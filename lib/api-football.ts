// Maps API-Football's official FIFA names → the names stored in our DB.
//
// BEFORE FIRST DEPLOY: verify this table against the live API:
//   GET https://v3.football.api-sports.io/teams?league=1&season=2026
//   (header: x-apisports-key: <your key>)
//
// Any name not in this map passes through unchanged. If a team is missing,
// the sync silently skips that fixture — the admin fallback handles it.
// Missing entries appear in the response body under "unmatched" for easy diagnosis.
const TEAM_NAME_MAP: Record<string, string> = {
  // API-Football name              → our DB name
  'Korea Republic':                 'South Korea',
  'IR Iran':                        'Iran',
  'United States':                  'USA',
  "Côte d'Ivoire":                  'Ivory Coast',
  'Bosnia and Herzegovina':         'Bosnia-Herzegovina',
  'Turkey':                         'Türkiye',       // API may still use pre-2022 name
  'Czech Republic':                 'Czechia',
  'DR Congo':                       'Congo DR',
  'Democratic Republic of Congo':   'Congo DR',
  'Curacao':                        'Curaçao',       // API strips the cedilla
  'Cape Verde Islands':             'Cape Verde',
}

export function normalizeTeamName(name: string): string {
  return TEAM_NAME_MAP[name] ?? name
}

// ---------------------------------------------------------------------------

const BASE_URL = 'https://v3.football.api-sports.io'

export interface ApiFixture {
  fixture: {
    id: number
    date: string        // ISO 8601 UTC e.g. "2026-06-11T19:00:00+00:00"
    status: { short: string }  // NS · 1H · HT · 2H · ET · P · FT · AET · PEN · CANC
  }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  goals: {
    home: number | null   // null until match starts; 0 is a valid score
    away: number | null
  }
}

// Maps API-Football status codes to our match status values.
// Codes not listed here (NS, CANC, PST, ABD, etc.) return null.
export function mapApiStatus(short: string): 'live' | 'ft' | 'aet' | 'pen' | null {
  switch (short) {
    case '1H': case '2H': case 'HT':
    case 'ET': case 'BT': case 'P':  return 'live'
    case 'FT':                        return 'ft'
    case 'AET':                       return 'aet'
    case 'PEN':                       return 'pen'
    default:                          return null
  }
}

// Returns all currently live fixtures in a single API call (1 request regardless
// of how many matches are live simultaneously).
export async function fetchLiveFixtures(): Promise<ApiFixture[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY env var is not set')

  // 10-second timeout prevents the cron handler from hanging on a slow API
  const res = await fetch(`${BASE_URL}/fixtures?live=all`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    // Cap error text to avoid large strings in logs
    const body = (await res.text()).slice(0, 300)
    throw new Error(`API-Football ${res.status}: ${body}`)
  }

  const json = await res.json()

  // API wraps errors in json.errors (object) even on HTTP 200
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors).slice(0, 300)}`)
  }

  return (json.response ?? []) as ApiFixture[]
}
