import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchAllWCMatches, normalizeTeamName, mapGoalTeam, mapGoalType } from '@/lib/football-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // ── 3. Build lookup index ──────────────────────────────────────────────────
  const index = new Map<string, number>()
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue
    index.set(`${m.home_team}|${m.away_team}|${m.kickoff_utc.slice(0, 10)}`, m.id)
  }

  // ── 4. Fetch all WC matches from football-data.org (single API call) ───────
  let apiMatches
  try {
    apiMatches = await fetchAllWCMatches()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // Only process matches that have goals (implies they have started/finished)
  const withGoals = apiMatches.filter(f => f.goals && f.goals.length > 0)

  // ── 5. Upsert events for each matched match ────────────────────────────────
  let processed = 0
  let totalEvents = 0
  const errors: string[] = []
  const unmatched: string[] = []

  for (const f of withGoals) {
    const home = normalizeTeamName(f.homeTeam?.name ?? '')
    const away = normalizeTeamName(f.awayTeam?.name ?? '')
    if (!home || !away) continue

    const date = f.utcDate.slice(0, 10)
    const matchId = index.get(`${home}|${away}|${date}`)

    if (matchId === undefined) {
      unmatched.push(`${home} vs ${away} (${date})`)
      continue
    }

    const goals = f.goals ?? []

    // Delete existing events for this match then insert fresh — idempotent.
    const { error: delErr } = await db
      .from('match_events')
      .delete()
      .eq('match_id', matchId)

    if (delErr) {
      errors.push(`delete match ${matchId}: ${delErr.message}`)
      continue
    }

    if (goals.length === 0) continue

    const rows = goals
      .filter(g => g.scorer?.name)
      .map(g => ({
        match_id:    matchId,
        minute:      g.minute ?? null,
        extra_time:  g.injuryTime ?? null,
        type:        mapGoalType(g.type),
        team:        mapGoalTeam(g, f.homeTeam.name),
        player_name: g.scorer!.name,
        assist_name: g.assist?.name ?? null,
      }))

    if (rows.length > 0) {
      const { error: insErr } = await db.from('match_events').insert(rows)
      if (insErr) {
        errors.push(`insert match ${matchId}: ${insErr.message}`)
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
