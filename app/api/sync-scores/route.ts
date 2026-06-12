import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchLiveFixtures, normalizeTeamName, mapApiStatus } from '@/lib/api-football'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// A match is "live" from 5 min before kickoff to 150 min after.
// 150 min covers: 90 play + 15 HT + 30 ET + 5 ET break + ~10 stoppage time.
const BEFORE_MS = 5 * 60_000
const AFTER_MS  = 150 * 60_000

function inLiveWindow(kickoffUtc: string): boolean {
  const t = new Date(kickoffUtc).getTime()
  const now = Date.now()
  return now >= t - BEFORE_MS && now <= t + AFTER_MS
}

// interval = ceil(matches_today × 115 min / 85 daily budget), minimum 2 min.
// Falls back to 2 min for the edge case where a match from yesterday UTC is still
// in its live window but no matches are scheduled on today's UTC date.
function intervalMinutes(matchCountToday: number): number {
  if (matchCountToday === 0) return 2
  return Math.max(2, Math.ceil((matchCountToday * 115) / 85))
}

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  // Explicitly check the env var is set — avoids the "Bearer undefined" bypass
  // where an unset secret makes the header trivially guessable.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()

  // ── 2. Load match list (own DB — no API quota used) ────────────────────────
  const { data: matchesRaw, error: matchErr } = await db
    .from('matches')
    .select('id, kickoff_utc, home_team, away_team')

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

  const matches = (matchesRaw ?? []) as {
    id: number
    kickoff_utc: string
    home_team: string | null
    away_team: string | null
  }[]

  // ── 3. Skip if nothing is live right now ───────────────────────────────────
  const anyLive = matches.some(m => inLiveWindow(m.kickoff_utc))
  if (!anyLive) {
    return NextResponse.json({ skipped: true, reason: 'no live window' })
  }

  // ── 4. Compute adaptive interval ───────────────────────────────────────────
  const todayUTC = new Date().toISOString().slice(0, 10)
  const todayCount = matches.filter(m => m.kickoff_utc.slice(0, 10) === todayUTC).length
  const interval = intervalMinutes(todayCount)
  // interval is always >= 2, so Date.now() - interval * 60_000 is always valid
  const cutoff = new Date(Date.now() - interval * 60_000).toISOString()

  // ── 5. Atomic claim via conditional UPDATE ─────────────────────────────────
  // Updates last_synced_at only if enough time has elapsed. If two cron instances
  // fire simultaneously, only one satisfies the lte condition — the other sees 0
  // rows returned and skips. Side-effect: if the API later fails, the timestamp
  // is still advanced, which intentionally prevents quota-burning retry storms.
  const { data: claimed } = await db
    .from('sync_state')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', true)
    .lte('last_synced_at', cutoff)
    .select('id')

  if (!claimed || claimed.length === 0) {
    const { data: state } = await db.from('sync_state').select('last_synced_at').single()
    const elapsed = state?.last_synced_at
      ? (Date.now() - new Date(state.last_synced_at).getTime()) / 60_000
      : 0
    return NextResponse.json({
      skipped: true,
      reason: 'too soon',
      nextInMinutes: Math.max(0, Math.ceil(interval - elapsed)),
    })
  }

  // ── 6. Fetch live fixtures from API-Football ───────────────────────────────
  let fixtures
  try {
    fixtures = await fetchLiveFixtures()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // ── 7. Build lookup index: "HomeTeam|AwayTeam|YYYY-MM-DD" → match id ───────
  // Only matches with both teams populated are indexed — knockout placeholders
  // ("Winner M37") are skipped and will match once admin fills in the teams.
  const index = new Map<string, number>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    index.set(`${m.home_team}|${m.away_team}|${m.kickoff_utc.slice(0, 10)}`, m.id)
  }

  // ── 8. Match each API fixture to our DB ────────────────────────────────────
  const updates: {
    id: number
    home_score: number
    away_score: number
    status: 'live' | 'ft' | 'aet' | 'pen' | null
  }[] = []
  const unmatched: string[] = []

  for (const f of fixtures) {
    // Skip fixtures with no goal data yet (pre-kickoff status "NS")
    if (f.goals.home === null || f.goals.away === null) continue

    // Guard against malformed API responses with missing team fields
    const home = normalizeTeamName((f.teams.home?.name ?? '').trim())
    const away = normalizeTeamName((f.teams.away?.name ?? '').trim())
    if (!home || !away) continue

    const date = f.fixture.date.slice(0, 10)
    const matchId = index.get(`${home}|${away}|${date}`)

    if (matchId !== undefined) {
      updates.push({
        id: matchId,
        home_score: f.goals.home,
        away_score: f.goals.away,
        status: mapApiStatus(f.fixture.status.short),
      })
    } else {
      // Log for diagnosis — unmatched usually means the normalization map needs
      // an entry. Visible in Vercel function logs and the response body.
      unmatched.push(`${home} vs ${away} (${date})`)
    }
  }

  // ── 9. Write score + status updates ───────────────────────────────────────
  const errors: string[] = []
  for (const u of updates) {
    const { error } = await db
      .from('matches')
      .update({ home_score: u.home_score, away_score: u.away_score, status: u.status })
      .eq('id', u.id)
    if (error) errors.push(`match ${u.id}: ${error.message}`)
  }

  return NextResponse.json({
    updated: updates.length,
    intervalMinutes: interval,
    ...(errors.length    && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
