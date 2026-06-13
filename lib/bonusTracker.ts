import { computeGroupStandings } from './standings'
import { normalizePlayerName } from './playerName'
import type { Match, MatchEvent, BonusAnswer } from './types'

export interface TopScorer {
  playerName: string
  goals: number
}

// Goals scored in group-stage matches; own goals excluded (they don't
// credit the scorer), penalties included (they do).
export function groupTopScorers(events: MatchEvent[], matches: Match[]): TopScorer[] {
  const groupMatchIds = new Set(
    matches.filter(m => m.stage === 'group').map(m => m.id)
  )
  const tally = new Map<string, number>()
  for (const e of events) {
    if (!groupMatchIds.has(e.match_id)) continue
    if (e.type === 'own_goal') continue
    tally.set(e.player_name, (tally.get(e.player_name) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([playerName, goals]) => ({ playerName, goals }))
    .sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName))
}

export interface BonusLeaders {
  leaders: string[]   // canonical names tied for first (empty = no data yet)
  stat: number        // the leading statistic value
}

// Q1: player name(s) tied for most group-stage goals
export function q1Leaders(events: MatchEvent[], matches: Match[]): BonusLeaders {
  const scorers = groupTopScorers(events, matches)
  if (scorers.length === 0) return { leaders: [], stat: 0 }
  const top = scorers[0].goals
  return {
    leaders: scorers.filter(s => s.goals === top).map(s => s.playerName),
    stat: top,
  }
}

// Q2: team(s) with most goals scored across the group stage
export function q2Leaders(matches: Match[]): BonusLeaders {
  const standings = computeGroupStandings(matches)
  let maxGF = 0
  for (const rows of standings.values())
    for (const r of rows) if (r.gf > maxGF) maxGF = r.gf
  if (maxGF === 0) return { leaders: [], stat: 0 }
  const leaders: string[] = []
  for (const rows of standings.values())
    for (const r of rows) if (r.gf === maxGF) leaders.push(r.team)
  return { leaders: leaders.sort(), stat: maxGF }
}

// Q3: team(s) with fewest goals conceded (only teams that have played ≥1
// match — avoids spurious 0s before kick-off)
export function q3Leaders(matches: Match[]): BonusLeaders {
  const standings = computeGroupStandings(matches)
  let minGA = Infinity
  for (const rows of standings.values())
    for (const r of rows) if (r.mp > 0 && r.ga < minGA) minGA = r.ga
  if (!isFinite(minGA)) return { leaders: [], stat: 0 }
  const leaders: string[] = []
  for (const rows of standings.values())
    for (const r of rows) if (r.mp > 0 && r.ga === minGA) leaders.push(r.team)
  return { leaders: leaders.sort(), stat: minGA }
}

// All group-stage matches have a final result
export function isGroupStageComplete(matches: Match[]): boolean {
  const group = matches.filter(m => m.stage === 'group')
  return group.length > 0 && group.every(m => m.home_score !== null && m.away_score !== null)
}

export interface DerivedGrade {
  user_id: string
  question_id: number
  is_correct: boolean
}

// Derives bonus correctness from live match data — no manual admin grades needed.
//
// Q1: requires a confirmed canonical player name from the admin squad-mapping step.
//     Participants whose Q1 entry hasn't been mapped are excluded from scoring
//     (they score 0 until the admin maps them; the admin form remains the only
//     manual step).
// Q2 / Q3: derived directly from answer_team vs. current standings leaders.
//
// Ties: all participants who picked any co-leader are marked correct ("all tied
// answers win" rule). If leaders array is empty (no results yet), nobody is correct.
export function computeBonusCorrectness(
  answers: BonusAnswer[],
  confirmedQ1Answers: Map<string, string>,  // user_id → confirmed canonical player name
  events: MatchEvent[],
  matches: Match[]
): DerivedGrade[] {
  const { leaders: q1L } = q1Leaders(events, matches)
  const { leaders: q2L } = q2Leaders(matches)
  const { leaders: q3L } = q3Leaders(matches)

  // Q1 leaders come from match_events (goal-scorer names); confirmed answers come
  // from the squads file. openfootball spells the same player differently across
  // the two files (case + diacritics), so compare on the normalized name key.
  const q1Keys = new Set(q1L.map(normalizePlayerName))

  const results: DerivedGrade[] = []
  for (const a of answers) {
    if (a.question_id === 1) {
      const confirmed = confirmedQ1Answers.get(a.user_id)
      if (!confirmed) continue  // unmapped — not scored yet
      results.push({
        user_id: a.user_id,
        question_id: 1,
        is_correct: q1Keys.size > 0 && q1Keys.has(normalizePlayerName(confirmed)),
      })
    } else if (a.question_id === 2) {
      results.push({
        user_id: a.user_id,
        question_id: 2,
        is_correct: q2L.length > 0 && q2L.includes(a.answer_team),
      })
    } else if (a.question_id === 3) {
      results.push({
        user_id: a.user_id,
        question_id: 3,
        is_correct: q3L.length > 0 && q3L.includes(a.answer_team),
      })
    }
  }
  return results
}
