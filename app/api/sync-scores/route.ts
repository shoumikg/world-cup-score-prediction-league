import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchLiveFixtures, normalizeTeamName } from '@/lib/api-football'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// A match is "live" from 5 min before kickoff to 130 min after (covers 90 + ET + pens).
const BEFORE_MS = 5 * 60_000
const AFTER_MS  = 130 * 60_000

function inLiveWindow(kickoffUtc: string): boolean {
  const t = new Date(kickoffUtc).getTime()
  const now = Date.now()
  return now >= t - BEFORE_MS && now <= t + AFTER_MS
}

// Keeps total API calls within ~85/day regardless of how many matches are today.
// Formula: interval = ceil((matchesToday × 115 min) / 85 budget), minimum 2 min.
function intervalMinutes(matchCountToday: number): number {
  if (matchCountToday === 0) return Infinity
  return Math.max(2, Math.ceil((matchCountToday * 115) / 85))
}

export async function GET(req: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  // Vercel injects `Authorization: Bearer <CRON_SECRET>` automatically.
  // External cron services (e.g. cron-job.org) must send the same header.
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Load our match list (own DB — free, no API quota) ───────────────────
  const { data: matchesRaw, error: matchErr } = await getAdminClient()
    .from('matches')
    .select('id, kickoff_utc, home_team, away_team')

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

  const matches = (matchesRaw ?? []) as {
    id: number
    kickoff_utc: string
    home_team: string | null
    away_team: string | null
  }[]

  // ── 3. Skip if no matches are in their live window ─────────────────────────
  const liveNow = matches.filter(m => inLiveWindow(m.kickoff_utc))
  if (liveNow.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no live window' })
  }

  // ── 4. Adaptive rate-limiting ──────────────────────────────────────────────
  // Count matches on today's UTC date to calculate polling interval.
  const todayUTC = new Date().toISOString().slice(0, 10)
  const todayCount = matches.filter(m => m.kickoff_utc.slice(0, 10) === todayUTC).length
  const interval = intervalMinutes(todayCount)

  const { data: state } = await getAdminClient()
    .from('sync_state')
    .select('last_synced_at')
    .single()

  const lastSync = state?.last_synced_at ? new Date(state.last_synced_at) : new Date(0)
  const minsSince = (Date.now() - lastSync.getTime()) / 60_000

  if (minsSince < interval) {
    return NextResponse.json({
      skipped: true,
      reason: 'too soon',
      nextInMinutes: Math.ceil(interval - minsSince),
    })
  }

  // ── 5. Fetch live fixtures from API-Football ───────────────────────────────
  let fixtures
  try {
    fixtures = await fetchLiveFixtures()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // ── 6. Build lookup index: "HomeTeam|AwayTeam|YYYY-MM-DD" → match id ───────
  // Only index matches that have both teams filled in (knockout placeholders don't).
  // The date uses UTC — same slice API-Football gives us — so they align exactly.
  const index = new Map<string, number>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    index.set(`${m.home_team}|${m.away_team}|${m.kickoff_utc.slice(0, 10)}`, m.id)
  }

  // ── 7. Match each live fixture to our DB and collect updates ───────────────
  const updates: { id: number; home_score: number; away_score: number }[] = []
  const unmatched: string[] = []

  for (const f of fixtures) {
    // Skip fixtures that haven't produced goals data yet (pre-kickoff "NS")
    if (f.goals.home === null || f.goals.away === null) continue

    const home = normalizeTeamName(f.teams.home.name)
    const away = normalizeTeamName(f.teams.away.name)
    const date = f.fixture.date.slice(0, 10)

    const matchId = index.get(`${home}|${away}|${date}`)
    if (matchId !== undefined) {
      updates.push({ id: matchId, home_score: f.goals.home, away_score: f.goals.away })
    } else {
      unmatched.push(`${home} vs ${away} (${date})`)
    }
  }

  // ── 8. Write score updates ─────────────────────────────────────────────────
  const errors: string[] = []
  for (const u of updates) {
    const { error } = await getAdminClient()
      .from('matches')
      .update({ home_score: u.home_score, away_score: u.away_score })
      .eq('id', u.id)
    if (error) errors.push(`match ${u.id}: ${error.message}`)
  }

  // ── 9. Record sync timestamp (even on partial error) ──────────────────────
  await getAdminClient()
    .from('sync_state')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', true)

  return NextResponse.json({
    updated: updates.length,
    intervalMinutes: interval,
    ...(errors.length    && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
