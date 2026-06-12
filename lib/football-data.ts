// Maps football-data.org team names → names stored in our DB.
//
// VERIFIED 2026-06-12 against GET /v4/competitions/WC/teams (all 48 teams):
// only United States→USA, Turkey→Türkiye, Cape Verde Islands→Cape Verde are
// actually needed; the rest match our DB exactly (incl. South Korea, Czechia,
// Bosnia-Herzegovina, Congo DR, Ivory Coast, Curaçao). Extra entries below are
// harmless and kept as insurance against mid-tournament renames.
//
// Any name not listed here passes through unchanged. Missing entries show up
// under "unmatched" in the sync response and Vercel function logs.
const TEAM_NAME_MAP: Record<string, string> = {
  // football-data.org name           → our DB name
  'United States':                     'USA',
  'Bosnia and Herzegovina':            'Bosnia-Herzegovina',
  'Turkey':                            'Türkiye',        // may still use pre-2022 name
  'Czech Republic':                    'Czechia',
  'DR Congo':                          'Congo DR',
  'Democratic Republic of Congo':      'Congo DR',
  'Curacao':                           'Curaçao',
  'Cape Verde Islands':                'Cape Verde',
  "Côte d'Ivoire":                     'Ivory Coast',
}

export function normalizeTeamName(name: string): string {
  const t = name.trim()
  return TEAM_NAME_MAP[t] ?? t
}

// Maps football-data.org status + duration → our match status values
export function mapStatus(
  status: string,
  duration: string
): 'live' | 'ft' | 'aet' | 'pen' | null {
  switch (status) {
    case 'IN_PLAY':
    case 'PAUSED':
    case 'EXTRA_TIME':
    case 'PENALTY_SHOOTOUT': return 'live'
    case 'FINISHED':
      if (duration === 'EXTRA_TIME')       return 'aet'
      if (duration === 'PENALTY_SHOOTOUT') return 'pen'
      return 'ft'
    default: return null
  }
}

// ---------------------------------------------------------------------------

export interface FDMatch {
  id: number
  utcDate: string            // ISO 8601 kickoff UTC
  status: string             // SCHEDULED TIMED IN_PLAY PAUSED EXTRA_TIME PENALTY_SHOOTOUT FINISHED
  homeTeam: { name: string }
  awayTeam: { name: string }
  score: {
    duration: string         // REGULAR EXTRA_TIME PENALTY_SHOOTOUT
    fullTime: {
      home: number | null    // current/final home goals (null if not yet started)
      away: number | null
    }
  }
}

// Fetches WC matches for yesterday + today UTC in a single request.
// Covering two days ensures we don't miss late-UTC kickoffs still in progress
// when the clock rolls past midnight UTC.
export async function fetchTodayMatches(): Promise<FDMatch[]> {
  const key = process.env.FOOTBALL_DATA_KEY
  if (!key) throw new Error('FOOTBALL_DATA_KEY env var is not set')

  const todayUTC     = new Date().toISOString().slice(0, 10)
  const yesterdayUTC = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const url = `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=${yesterdayUTC}&dateTo=${todayUTC}`

  const res = await fetch(url, {
    headers: { 'X-Auth-Token': key },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new Error(`football-data.org ${res.status}: ${body}`)
  }

  const json = await res.json()

  if (json.errorCode) {
    throw new Error(`football-data.org error ${json.errorCode}: ${String(json.message).slice(0, 200)}`)
  }

  return (json.matches ?? []) as FDMatch[]
}
