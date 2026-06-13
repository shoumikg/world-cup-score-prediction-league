import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  fetchWorldCupData,
  normalizeOFTeamName,
  buildEventRows,
  type OFMatch,
} from '@/lib/openfootball'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Syncs goal scorers into match_events from openfootball/worldcup.json. The
// whole tournament arrives in ONE request with no rate limit, so a single call
// refreshes every match (idempotent: delete-then-insert per match). Safe to run
// on a schedule (e.g. every ~10 min) to pick up newly-finished matches — goal
// scorers are not the same as live scores (those come from /api/sync-scores).
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

  // ── 3. Index our matches by ordered "home|away" pair ───────────────────────
  // A given ordered pairing is effectively unique across one World Cup; when it
  // isn't (a rare knockout rematch), the kickoff date breaks the tie.
  const index = new Map<string, typeof matches>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    const key = `${m.home_team}|${m.away_team}`
    if (!index.has(key)) index.set(key, [])
    index.get(key)!.push(m)
  }

  // ── 4. Fetch the whole tournament (one request, no key, no rate limit) ─────
  let data
  try {
    data = await fetchWorldCupData()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  function resolveOurId(f: OFMatch): number | undefined {
    const home = normalizeOFTeamName(f.team1)
    const away = normalizeOFTeamName(f.team2)
    const candidates = index.get(`${home}|${away}`)
    if (!candidates || candidates.length === 0) return undefined
    if (candidates.length === 1) return candidates[0].id
    // Multiple matches with the same pairing — disambiguate by date (±1 day).
    if (f.date) {
      const target = Date.parse(f.date)
      const within = candidates.find(
        m => Math.abs(Date.parse(m.kickoff_utc.slice(0, 10)) - target) <= 86_400_000
      )
      if (within) return within.id
    }
    return candidates[0].id
  }

  // A match has open-play goals if either goals array is non-empty.
  const scored = data.matches.filter(
    f => (f.goals1?.length ?? 0) + (f.goals2?.length ?? 0) > 0
  )

  // ── Debug: show the first scored match's mapping + parsed rows ─────────────
  if (debug) {
    const f = scored[0]
    if (!f) return NextResponse.json({ debug: true, message: 'No scored matches in dataset' })
    const ourId = resolveOurId(f)
    return NextResponse.json({
      debug: true,
      openfootball: { team1: f.team1, team2: f.team2, date: f.date, goals1: f.goals1, goals2: f.goals2 },
      resolvedOurMatchId: ourId ?? null,
      rows: ourId ? buildEventRows(f, ourId) : [],
    })
  }

  // ── 5. Upsert events for each scored, matched fixture ──────────────────────
  let processed = 0
  let totalEvents = 0
  const errors: string[] = []
  const unmatched: string[] = []

  for (const f of scored) {
    const ourId = resolveOurId(f)
    if (ourId === undefined) {
      unmatched.push(`${f.team1} vs ${f.team2}${f.date ? ` (${f.date})` : ''}`)
      continue
    }

    const rows = buildEventRows(f, ourId)

    // Delete-then-insert keeps it idempotent across re-runs.
    const { error: delErr } = await db.from('match_events').delete().eq('match_id', ourId)
    if (delErr) {
      errors.push(`delete match ${ourId}: ${delErr.message}`)
      continue
    }

    if (rows.length > 0) {
      const { error: insErr } = await db.from('match_events').insert(rows)
      if (insErr) {
        errors.push(`insert match ${ourId}: ${insErr.message}`)
        continue
      }
      totalEvents += rows.length
    }
    processed++
  }

  return NextResponse.json({
    processed,
    totalEvents,
    ...(errors.length    && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
