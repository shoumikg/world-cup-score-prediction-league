// openfootball/worldcup.json — free, public-domain WC26 dataset (no API key,
// no rate limit). Source of goal scorers, since football-data.org's free tier
// omits the goals array entirely.
//
// Shape (verified against the live 2026 dataset):
//   { name, matches: [ {
//       round, date, team1, team2,
//       score: { ft: [h, a], ht: [h, a] },
//       goals1: [ { name, minute, owngoal? } ],   // team1 (home) scorers
//       goals2: [ ... ],                          // team2 (away) scorers
//       group
//   } ] }
//
// Notes: minute is a string and may carry stoppage time ("45+5"). There is no
// assist data and no penalty flag — only the scorer, minute, and an owngoal
// boolean. Penalty-shootout goals are not in goals1/goals2.

import { normalizePlayerName } from './playerName'

const DATA_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

export interface OFGoal {
  name: string
  minute: string | number
  owngoal?: boolean
  penalty?: boolean // not present in the WC26 data, but tolerated if it appears
}

export interface OFMatch {
  round?: string
  date?: string
  team1: string
  team2: string
  score?: { ft?: [number, number]; ht?: [number, number] }
  goals1?: OFGoal[]
  goals2?: OFGoal[]
  group?: string
}

export interface OFData {
  name?: string
  matches: OFMatch[]
}

// Maps openfootball team names → names stored in our DB. Any name not listed
// passes through unchanged; unmatched fixtures with goals surface in the sync
// response so missing entries can be added. Verified same: USA, South Korea,
// Iran. The rest are insurance against spelling differences.
const OF_TEAM_NAME_MAP: Record<string, string> = {
  'Czech Republic':             'Czechia',
  'Bosnia and Herzegovina':     'Bosnia-Herzegovina',
  'Bosnia & Herzegovina':       'Bosnia-Herzegovina',
  'Turkey':                     'Türkiye',
  'Cabo Verde':                 'Cape Verde',
  'DR Congo':                   'Congo DR',
  'Democratic Republic of Congo': 'Congo DR',
  "Côte d'Ivoire":              'Ivory Coast',
  "Ivory Coast":                'Ivory Coast',
  'Curacao':                    'Curaçao',
  'Korea Republic':             'South Korea',
  'United States':              'USA',
}

export function normalizeOFTeamName(name: string): string {
  const t = (name ?? '').trim()
  return OF_TEAM_NAME_MAP[t] ?? t
}

// "45+5" → { minute: 45, extraTime: 5 };  "67" → { minute: 67, extraTime: null }
export function parseMinute(raw: string | number | undefined | null): {
  minute: number | null
  extraTime: number | null
} {
  if (raw == null) return { minute: null, extraTime: null }
  const s = String(raw).trim()
  if (s === '') return { minute: null, extraTime: null }
  const [base, extra] = s.split('+')
  const minute = parseInt(base, 10)
  const extraTime = extra != null ? parseInt(extra, 10) : NaN
  return {
    minute: Number.isFinite(minute) ? minute : null,
    extraTime: Number.isFinite(extraTime) ? extraTime : null,
  }
}

export interface MatchEventRow {
  match_id: number
  minute: number | null
  extra_time: number | null
  type: 'goal' | 'own_goal' | 'penalty'
  team: 'home' | 'away'
  player_name: string
  assist_name: string | null
}

function goalType(g: OFGoal): 'goal' | 'own_goal' | 'penalty' {
  if (g.owngoal) return 'own_goal'
  if (g.penalty) return 'penalty'
  return 'goal'
}

// Builds match_events rows for one openfootball match against our internal id.
// goals1 → home, goals2 → away. Goals with no scorer name are skipped.
export function buildEventRows(m: OFMatch, matchId: number): MatchEventRow[] {
  const rows: MatchEventRow[] = []
  const add = (goals: OFGoal[] | undefined, team: 'home' | 'away') => {
    for (const g of goals ?? []) {
      if (!g.name?.trim()) continue
      const { minute, extraTime } = parseMinute(g.minute)
      rows.push({
        match_id: matchId,
        minute,
        extra_time: extraTime,
        type: goalType(g),
        team,
        player_name: g.name.trim(),
        assist_name: null, // openfootball has no assist data
      })
    }
  }
  add(m.goals1, 'home')
  add(m.goals2, 'away')
  return rows
}

export async function fetchWorldCupData(): Promise<OFData> {
  const res = await fetch(DATA_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new Error(`openfootball ${res.status}: ${body}`)
  }
  const json = (await res.json()) as OFData
  return { name: json.name, matches: json.matches ?? [] }
}

// ── Squads ──────────────────────────────────────────────────────────────────

const SQUADS_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.squads.json'

export interface OFPlayer {
  number: number
  pos: 'GK' | 'DF' | 'MF' | 'FW'
  name: string
  date_of_birth: string // YYYY-MM-DD
}

export interface OFSquad {
  name: string      // openfootball name (may differ from our DB name)
  fifa_code: string
  group: string     // "A"…"L"
  players: OFPlayer[]
}

// Squads are published pre-tournament and change only for injury replacements.
// Cache for 1 hour so a forced-dynamic page doesn't hit GitHub on every render.
export async function fetchSquads(): Promise<OFSquad[]> {
  const res = await fetch(SQUADS_URL, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new Error(`openfootball squads ${res.status}: ${body}`)
  }
  const json = await res.json()
  return (Array.isArray(json) ? json : []) as OFSquad[]
}

// Find the squad for a team by our DB team name.
// Normalises the openfootball name before comparing so e.g. "Korea Republic"
// matches "South Korea" in our DB.
export function findSquad(squads: OFSquad[], dbTeamName: string): OFSquad | undefined {
  return squads.find(s => normalizeOFTeamName(s.name) === dbTeamName)
}

// Player age in complete years as of today.
export function calcAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Player-name resolution ────────────────────────────────────────────────────
// Maps a participant's free-text Q1 entry (e.g. "schick", "Patrik Schick",
// "messi") to a real player in the selected team's squad. Squad names are full
// names with diacritics ("Patrik Schick"); entries are arbitrary text, so we
// compare on a diacritic-stripped, lower-cased, punctuation-free basis via the
// shared normalizePlayerName key (also used when scoring Q1 against goal events).

export type SquadMatchMethod = 'exact' | 'surname' | 'partial'

export interface SquadMatch {
  player: OFPlayer
  method: SquadMatchMethod
  ambiguous: boolean // more than one squad player matched at the winning tier
}

// Best-effort resolution of a text entry against a squad. Returns the matched
// player and how confident the match is, or null when nothing plausibly matches.
// Tiers, most to least confident: exact full name → surname → substring.
export function matchSquadPlayer(
  rawText: string | null | undefined,
  players: OFPlayer[]
): SquadMatch | null {
  const q = normalizePlayerName(rawText ?? '')
  if (!q || players.length === 0) return null

  const normalized = players.map(p => ({ player: p, name: normalizePlayerName(p.name) }))

  // 1. Exact full-name match.
  const exact = normalized.filter(p => p.name === q)
  if (exact.length > 0)
    return { player: exact[0].player, method: 'exact', ambiguous: exact.length > 1 }

  // 2. Surname match: the entry equals a token of the player's name, or the
  //    entry's last token equals the player's last token. Catches "schick",
  //    "krejci", and "ladislav krejci" alike.
  const qLast = q.split(' ').pop()!
  const surname = normalized.filter(p => {
    const tokens = p.name.split(' ')
    return tokens.includes(q) || tokens[tokens.length - 1] === qLast
  })
  if (surname.length > 0)
    return { player: surname[0].player, method: 'surname', ambiguous: surname.length > 1 }

  // 3. Substring either direction (typo-tolerant last resort).
  const partial = normalized.filter(p => p.name.includes(q) || q.includes(p.name))
  if (partial.length > 0)
    return { player: partial[0].player, method: 'partial', ambiguous: partial.length > 1 }

  return null
}
