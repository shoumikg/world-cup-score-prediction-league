import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  fetchAllWCMatches,
  fetchMatchById,
  normalizeTeamName,
  goalsToEventRows,
} from '@/lib/football-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// football-data.org free tier allows 10 requests/minute. One request goes to
// the competition list; the rest are per-match detail fetches. We cap the
// per-invocation detail fetches so a single call never trips the limit. Re-run
// the endpoint (waiting ~1 min between runs) until "remaining" reaches 0.
const MAX_DETAIL_FETCHES = 8

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const debug = req.nextUrl.searchParams.get('debug') === '1'

  const db = getAdminClient()

  // ── 2. Load our match list ─────────────────────────────────────────────────
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

  // ── 3. Build lookup index "HomeTeam|AwayTeam|YYYY-MM-DD" → our match id ─────
  const index = new Map<string, number>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    index.set(`${m.home_team}|${m.away_team}|${m.kickoff_utc.slice(0, 10)}`, m.id)
  }

  // ── 4. Fetch the competition list (1 API call) to discover fd ids + scores ─
  let apiMatches
  try {
    apiMatches = await fetchAllWCMatches()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // ── 5. Which of our matches already have events? (skip those) ──────────────
  const { data: existingRaw } = await db.from('match_events').select('match_id')
  const haveEvents = new Set((existingRaw ?? []).map(r => (r as { match_id: number }).match_id))

  // ── 6. Determine candidates: matched to our DB, have open-play goals, no
  //       events yet. The list score tells us whether any goals exist at all,
  //       so 0-0 matches are never candidates and the loop terminates. ────────
  const candidates: { ourId: number; fdId: number }[] = []
  const unmatched: string[] = []

  for (const f of apiMatches) {
    const home = normalizeTeamName(f.homeTeam?.name ?? '')
    const away = normalizeTeamName(f.awayTeam?.name ?? '')
    if (!home || !away) continue

    const date = f.utcDate.slice(0, 10)
    const ourId = index.get(`${home}|${away}|${date}`)
    if (ourId === undefined) {
      // Only log finished/in-play fixtures as unmatched — scheduled ones are
      // expected to be absent (knockout placeholders not yet filled in).
      const hs = f.score.fullTime.home
      const as = f.score.fullTime.away
      if (hs !== null && as !== null) unmatched.push(`${home} vs ${away} (${date})`)
      continue
    }

    if (haveEvents.has(ourId)) continue

    const hs = f.score.fullTime.home ?? 0
    const as = f.score.fullTime.away ?? 0
    if (hs + as <= 0) continue // no open-play goals to fetch

    candidates.push({ ourId, fdId: f.id })
  }

  // ── 7. Debug mode: return raw API detail for first candidate ──────────────
  if (debug) {
    if (candidates.length === 0) {
      return NextResponse.json({ debug: true, message: 'No candidates found', unmatched })
    }
    const c = candidates[0]
    let raw
    try {
      raw = await fetchMatchById(c.fdId)
    } catch (err) {
      return NextResponse.json({ debug: true, error: String(err) }, { status: 502 })
    }
    return NextResponse.json({ debug: true, ourMatchId: c.ourId, fdMatchId: c.fdId, raw })
  }

  // ── 8. Fetch detail for up to MAX_DETAIL_FETCHES candidates ────────────────
  const batch = candidates.slice(0, MAX_DETAIL_FETCHES)
  let processed = 0
  let totalEvents = 0
  const errors: string[] = []

  for (const c of batch) {
    let detail
    try {
      detail = await fetchMatchById(c.fdId)
    } catch (err) {
      errors.push(`fetch fd ${c.fdId}: ${String(err)}`)
      continue
    }

    const rows = goalsToEventRows(detail, c.ourId)

    // Delete-then-insert keeps it idempotent if a match is re-processed.
    const { error: delErr } = await db.from('match_events').delete().eq('match_id', c.ourId)
    if (delErr) {
      errors.push(`delete match ${c.ourId}: ${delErr.message}`)
      continue
    }

    if (rows.length > 0) {
      const { error: insErr } = await db.from('match_events').insert(rows)
      if (insErr) {
        errors.push(`insert match ${c.ourId}: ${insErr.message}`)
        continue
      }
      totalEvents += rows.length
    }

    processed++
  }

  return NextResponse.json({
    processed,
    totalEvents,
    remaining: Math.max(0, candidates.length - batch.length),
    ...(errors.length    && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
