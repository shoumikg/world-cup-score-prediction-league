import type { SupabaseClient } from '@supabase/supabase-js'
import type { Match } from './types'
import { computeGroupStandings, type TableRow } from './standings'

// Resolves the knockout bracket from group standings and earlier-round results.
//
// Every knockout slot is seeded with a source label in home_source/away_source:
//   'Winner C'  / 'Runner-up F'   → group winner / runner-up (groups A–L)
//   'Winner M74' / 'Loser M101'   → winner / loser of an earlier match
//   'Best 3rd (A/B/C/D/F)'        → one of the 8 best third-placed teams
//
// We auto-resolve the first two patterns. The 'Best 3rd' assignment depends on
// FIFA's official combination table (which qualifying thirds map to which slot)
// and is left for the admin to fill — rankQualifiedThirds() below feeds the
// admin a ranked list to do that with.

const WINNER_GROUP_RE = /^Winner ([A-L])$/
const RUNNER_GROUP_RE = /^Runner-up ([A-L])$/
const WINNER_MATCH_RE = /^Winner M(\d+)$/
const LOSER_MATCH_RE  = /^Loser M(\d+)$/

interface ResolveContext {
  standings: Map<string, TableRow[]>
  completeGroups: Set<string>
  byId: Map<number, Match>
}

/** A group is decided once every one of its matches has a result. */
export function isGroupComplete(matches: Match[], group: string): boolean {
  const groupMatches = matches.filter(m => m.stage === 'group' && m.group_name === group)
  return groupMatches.length > 0 && groupMatches.every(m => m.home_score !== null)
}

// Winner/loser of a played knockout match. Returns null when the match has no
// result yet, is missing a team, or finished level on the scoreline — a
// shootout (status 'pen') leaves equal scores and we don't store who won it, so
// that slot stays open for the admin rather than guessing.
function winnerOf(m: Match | undefined): string | null {
  if (!m || !m.home_team || !m.away_team) return null
  if (m.home_score === null || m.away_score === null) return null
  if (m.home_score === m.away_score) return null
  return m.home_score > m.away_score ? m.home_team : m.away_team
}

function loserOf(m: Match | undefined): string | null {
  if (!m || !m.home_team || !m.away_team) return null
  if (m.home_score === null || m.away_score === null) return null
  if (m.home_score === m.away_score) return null
  return m.home_score > m.away_score ? m.away_team : m.home_team
}

/** Resolves one source label to a team name, or null if not yet determinable. */
export function resolveKnockoutTeam(source: string, ctx: ResolveContext): string | null {
  let mt = source.match(WINNER_GROUP_RE)
  if (mt) {
    const g = mt[1]
    return ctx.completeGroups.has(g) ? ctx.standings.get(g)?.[0]?.team ?? null : null
  }
  mt = source.match(RUNNER_GROUP_RE)
  if (mt) {
    const g = mt[1]
    return ctx.completeGroups.has(g) ? ctx.standings.get(g)?.[1]?.team ?? null : null
  }
  mt = source.match(WINNER_MATCH_RE)
  if (mt) return winnerOf(ctx.byId.get(parseInt(mt[1], 10)))
  mt = source.match(LOSER_MATCH_RE)
  if (mt) return loserOf(ctx.byId.get(parseInt(mt[1], 10)))
  // 'Best 3rd (…)' and anything else: admin-filled.
  return null
}

/**
 * Computes which knockout slots can now be filled. Only ever fills slots that
 * are currently null, so an admin override is never overwritten. Runs to a
 * fixpoint so a single call cascades through dependent rounds.
 */
export function computeKnockoutFills(
  matches: Match[]
): { id: number; home_team?: string; away_team?: string }[] {
  // Work on shallow copies so resolved teams feed later iterations.
  const work = matches.map(m => ({ ...m }))
  const byId = new Map(work.map(m => [m.id, m]))
  const fills = new Map<number, { home_team?: string; away_team?: string }>()

  let changed = true
  while (changed) {
    changed = false
    const standings = computeGroupStandings(work)
    const completeGroups = new Set([...standings.keys()].filter(g => isGroupComplete(work, g)))
    const ctx: ResolveContext = { standings, completeGroups, byId }

    for (const m of work) {
      if (m.stage === 'group') continue
      if (!m.home_team && m.home_source) {
        const t = resolveKnockoutTeam(m.home_source, ctx)
        if (t) {
          m.home_team = t
          fills.set(m.id, { ...fills.get(m.id), home_team: t })
          changed = true
        }
      }
      if (!m.away_team && m.away_source) {
        const t = resolveKnockoutTeam(m.away_source, ctx)
        if (t) {
          m.away_team = t
          fills.set(m.id, { ...fills.get(m.id), away_team: t })
          changed = true
        }
      }
    }
  }

  return [...fills.entries()].map(([id, sides]) => ({ id, ...sides }))
}

// ── Bracket halves (for the finalists bonus) ──────────────────────────────
//
// The final (M104) is "Winner of SF-A" vs "Winner of SF-B". Each half of the
// draw is the subtree feeding one semi-final. Two teams in the same half must
// meet before the final, so they can't both be finalists — the finalists are
// always one team from each half. We derive each placed knockout team's half by
// tracing the bracket structure (the seeded source labels), independent of
// results.

const MATCH_REF_RE = /M(\d+)/

function matchRef(source: string | null): number | null {
  if (!source) return null
  const m = source.match(MATCH_REF_RE)
  return m ? parseInt(m[1], 10) : null
}

/** Maps each knockout match id to its half ('A'/'B') of the draw. */
function halfByMatch(matches: Match[]): Map<number, 'A' | 'B'> {
  const byId = new Map(matches.map(m => [m.id, m]))
  const half = new Map<number, 'A' | 'B'>()
  const final = matches.find(m => m.stage === 'final')
  if (!final) return half

  const assign = (id: number | null, h: 'A' | 'B') => {
    if (id === null || half.has(id)) return
    half.set(id, h)
    const m = byId.get(id)
    if (!m) return
    assign(matchRef(m.home_source), h)
    assign(matchRef(m.away_source), h)
  }
  assign(matchRef(final.home_source), 'A')
  assign(matchRef(final.away_source), 'B')
  return half
}

/**
 * Maps each team currently placed in the round of 32 to its half of the draw.
 * Used to validate finalist picks (the two must come from opposite halves) and
 * to filter the second team selector.
 */
export function bracketHalves(matches: Match[]): Map<string, 'A' | 'B'> {
  const byMatch = halfByMatch(matches)
  const teamHalf = new Map<string, 'A' | 'B'>()
  for (const m of matches) {
    if (m.stage !== 'r32') continue
    const h = byMatch.get(m.id)
    if (!h) continue
    if (m.home_team) teamHalf.set(m.home_team, h)
    if (m.away_team) teamHalf.set(m.away_team, h)
  }
  return teamHalf
}

export interface ThirdPlaceRow extends TableRow {
  group: string
  qualifies: boolean
}

/**
 * Ranks the third-placed team of every completed group, FIFA-style
 * (points → GD → GF → name). The top 8 qualify for the round of 32. Feeds the
 * admin's "fill Best 3rd slots" assist; the admin still maps each to a slot
 * using the official combination table.
 */
export function rankQualifiedThirds(matches: Match[]): ThirdPlaceRow[] {
  const standings = computeGroupStandings(matches)
  const thirds: (TableRow & { group: string })[] = []
  for (const [group, rows] of standings) {
    if (!isGroupComplete(matches, group)) continue
    if (rows[2]) thirds.push({ ...rows[2], group })
  }
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
  return thirds.map((r, i) => ({ ...r, qualifies: i < 8 }))
}

/**
 * Applies all currently-resolvable knockout fills to the database. Idempotent:
 * only writes slots that are still null, so it's safe to call after every
 * result entry / sync and never clobbers an admin override.
 */
export async function propagateKnockouts(client: SupabaseClient): Promise<{ filled: number }> {
  const { data } = await client.from('matches').select('*')
  const matches = (data ?? []) as Match[]
  const fills = computeKnockoutFills(matches)

  for (const f of fills) {
    const update: Record<string, string> = {}
    if (f.home_team) update.home_team = f.home_team
    if (f.away_team) update.away_team = f.away_team
    await client.from('matches').update(update).eq('id', f.id)
  }

  return { filled: fills.length }
}
