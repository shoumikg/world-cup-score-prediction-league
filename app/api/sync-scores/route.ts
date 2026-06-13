import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchTodayMatches, normalizeTeamName, mapStatus, fetchMatchById, goalsToEventRows } from '@/lib/football-data'

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

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  // Explicitly check env var is set — avoids "Bearer undefined" bypass.
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

  // ── 3. Skip if nothing is in its live window right now ─────────────────────
  const anyLive = matches.some(m => inLiveWindow(m.kickoff_utc))
  if (!anyLive) {
    return NextResponse.json({ skipped: true, reason: 'no live window' })
  }

  // ── 4. Atomic 1-minute rate limit ─────────────────────────────────────────
  // football-data.org free tier has no daily cap, only 10 req/min. We use 1
  // req/tick, so polling every minute is always safe.
  // The conditional UPDATE acts as a lightweight distributed lock: if two cron
  // instances fire simultaneously, only one satisfies the lte condition.
  const cutoff = new Date(Date.now() - 60_000).toISOString()

  const { data: claimed } = await db
    .from('sync_state')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', true)
    .lte('last_synced_at', cutoff)
    .select('id')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'too soon' })
  }

  // ── 5. Fetch today's WC matches from football-data.org ────────────────────
  let apiMatches
  try {
    apiMatches = await fetchTodayMatches()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // Only process matches that have started (non-null scores)
  const activeMatches = apiMatches.filter(
    f => f.score.fullTime.home !== null && f.score.fullTime.away !== null
  )

  // ── 6. Build lookup index: "HomeTeam|AwayTeam|YYYY-MM-DD" → match id ───────
  // Knockout placeholders (null home_team/away_team) are excluded until admin
  // fills in the teams — the next sync then matches them automatically.
  const index = new Map<string, number>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    index.set(`${m.home_team}|${m.away_team}|${m.kickoff_utc.slice(0, 10)}`, m.id)
  }

  // ── 7. Match each API fixture to our DB ────────────────────────────────────
  const updates: {
    id: number
    home_score: number
    away_score: number
    status: 'live' | 'ft' | 'aet' | 'pen' | null
    live_minute: number | null
    fdMatch: typeof activeMatches[number]
  }[] = []
  const unmatched: string[] = []

  for (const f of activeMatches) {
    const home = normalizeTeamName(f.homeTeam?.name ?? '')
    const away = normalizeTeamName(f.awayTeam?.name ?? '')
    if (!home || !away) continue

    const date = f.utcDate.slice(0, 10)
    const matchId = index.get(`${home}|${away}|${date}`)

    if (matchId !== undefined) {
      const status = mapStatus(f.status, f.score.duration)
      updates.push({
        id: matchId,
        home_score: f.score.fullTime.home!,
        away_score: f.score.fullTime.away!,
        status,
        // Minute is only meaningful in play; cleared at FT or when the feed omits it
        live_minute: status === 'live' && typeof f.minute === 'number' ? f.minute : null,
        fdMatch: f,
      })
    } else {
      // Appears in Vercel function logs and response body for diagnosis.
      // Usually means a missing entry in the normalization map.
      unmatched.push(`${home} vs ${away} (${date})`)
    }
  }

  // ── 8. Write score + status updates ───────────────────────────────────────
  const errors: string[] = []
  for (const u of updates) {
    const { error } = await db
      .from('matches')
      .update({ home_score: u.home_score, away_score: u.away_score, status: u.status, live_minute: u.live_minute })
      .eq('id', u.id)
    if (error) errors.push(`match ${u.id}: ${error.message}`)
  }

  // ── 9. Sync goal events for active matches ─────────────────────────────────
  // The competition list response carries scores but NOT the goals array, so we
  // fetch per-match detail for each active fixture. Only matches with at least
  // one open-play goal are fetched, bounding the extra API calls (the live
  // window rarely holds more than a handful of matches; well under 10 req/min).
  let eventsUpdated = 0
  for (const u of updates) {
    if (u.home_score + u.away_score <= 0) continue // no open-play goals yet

    let detail
    try {
      detail = await fetchMatchById(u.fdMatch.id)
    } catch (err) {
      errors.push(`events fetch match ${u.id}: ${String(err)}`)
      continue
    }

    const rows = goalsToEventRows(detail, u.id)

    await db.from('match_events').delete().eq('match_id', u.id)

    if (rows.length > 0) {
      const { error: insErr } = await db.from('match_events').insert(rows)
      if (insErr) errors.push(`events match ${u.id}: ${insErr.message}`)
      else eventsUpdated += rows.length
    }
  }

  return NextResponse.json({
    updated: updates.length,
    ...(eventsUpdated   && { eventsUpdated }),
    ...(errors.length   && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
