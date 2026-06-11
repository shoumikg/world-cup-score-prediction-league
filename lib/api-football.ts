// Maps API-Football's official FIFA names → the names stored in our DB.
//
// BEFORE FIRST DEPLOY: verify this table against the live API:
//   GET https://v3.football.api-sports.io/teams?league=1&season=2026
//   (header: x-apisports-key: <your key>)
//
// Any name not listed here passes through unchanged. If a team is missing
// from this map the sync simply skips that fixture — the admin fallback handles it.
const TEAM_NAME_MAP: Record<string, string> = {
  // FIFA official name        → our DB name
  'Korea Republic':            'South Korea',
  'IR Iran':                   'Iran',
  'United States':             'USA',
  "Côte d'Ivoire":             'Ivory Coast',
  'Bosnia and Herzegovina':    'Bosnia-Herzegovina',
  'Turkey':                    'Türkiye',           // API may still use old name
  'Czech Republic':            'Czechia',
  'DR Congo':                  'Congo DR',
  'Democratic Republic of Congo': 'Congo DR',
  'Curacao':                   'Curaçao',           // API strips the cedilla
  'Cape Verde Islands':        'Cape Verde',
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
    status: {
      short: string     // NS · 1H · HT · 2H · ET · P · FT · AET · PEN · CANC
    }
  }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  goals: {
    home: number | null   // null until match starts
    away: number | null
  }
}

// Returns all currently live fixtures in a single API call.
export async function fetchLiveFixtures(): Promise<ApiFixture[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY env var is not set')

  const res = await fetch(`${BASE_URL}/fixtures?live=all`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`API-Football ${res.status}: ${await res.text()}`)
  }

  const json = await res.json()

  // API wraps errors in json.errors (object) even on 200
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`)
  }

  return (json.response ?? []) as ApiFixture[]
}
