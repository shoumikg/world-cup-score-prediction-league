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
