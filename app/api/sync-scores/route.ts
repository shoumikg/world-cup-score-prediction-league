import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchTodayMatches, normalizeTeamName, mapStatus } from '@/lib/football-data'
import { propagateKnockouts } from '@/lib/knockout'

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
    .select('id, kickoff_utc, home_team, away_team, stage')

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

  const matches = (matchesRaw ?? []) as {
    id: number
    kickoff_utc: string
    home_team: string | null
    away_team: string | null
    stage: string
  }[]
  const stageById = new Map(matches.map(m => [m.id, m.stage]))

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
    reg_home_score?: number
    reg_away_score?: number
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
      // Record the regulation (90') score for knockout grading ONLY when the
      // match finished in normal time — then fullTime IS the 90' score. For
      // extra-time / penalty matches the provider's fullTime includes ET, so we
      // never use it here; the admin enters the 90' score instead.
      const regulationKnockout =
        f.status === 'FINISHED' &&
        f.score.duration === 'REGULAR' &&
        (stageById.get(matchId) ?? 'group') !== 'group'
      // Once a match is in extra time / penalties the running score includes ET
      // goals and must not grade predictions. The provider's ET minute is
      // unreliable (it can reset or be omitted), so derive "past 90'" from the
      // status itself and pin live_minute above 90 — scoringScore then holds off
      // grading the knockout until the admin records the 90-minute score.
      const beyondRegulation = f.status === 'EXTRA_TIME' || f.status === 'PENALTY_SHOOTOUT'
      const liveMinute =
        status !== 'live' ? null
          : beyondRegulation ? Math.max(91, typeof f.minute === 'number' ? f.minute : 91)
          : (typeof f.minute === 'number' ? f.minute : null)
      updates.push({
        id: matchId,
        home_score: f.score.fullTime.home!,
        away_score: f.score.fullTime.away!,
        status,
        live_minute: liveMinute,
        ...(regulationKnockout
          ? { reg_home_score: f.score.fullTime.home!, reg_away_score: f.score.fullTime.away! }
          : {}),
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
    const patch: Record<string, number | string | null> = {
      home_score: u.home_score, away_score: u.away_score, status: u.status, live_minute: u.live_minute,
    }
    // Only set reg_* when known — never overwrite an admin-entered 90' score with null.
    if (u.reg_home_score !== undefined) {
      patch.reg_home_score = u.reg_home_score
      patch.reg_away_score = u.reg_away_score!
    }
    const { error } = await db.from('matches').update(patch).eq('id', u.id)
    if (error) errors.push(`match ${u.id}: ${error.message}`)
  }

  // A synced result may decide a group or an earlier knockout round — fill any
  // dependent slots that are now resolvable. Only fills null slots, so admin
  // overrides are preserved. Once a knockout's teams are filled, the next sync
  // can match its fixture and pull its score.
  const { filled } = await propagateKnockouts(db)

  return NextResponse.json({
    updated: updates.length,
    ...(filled         && { knockoutsFilled: filled }),
    ...(errors.length    && { errors }),
    ...(unmatched.length && { unmatched }),
  })
}
