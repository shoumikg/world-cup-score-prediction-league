const FLAGS: Record<string, string> = {
  // Group A
  'Mexico':             '🇲🇽',
  'South Africa':       '🇿🇦',
  'South Korea':        '🇰🇷',
  'Czechia':            '🇨🇿',
  // Group B
  'Canada':             '🇨🇦',
  'Bosnia-Herzegovina': '🇧🇦',
  'Qatar':              '🇶🇦',
  'Switzerland':        '🇨🇭',
  // Group C
  'Brazil':             '🇧🇷',
  'Morocco':            '🇲🇦',
  'Haiti':              '🇭🇹',
  'Scotland':           '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  // Group D
  'USA':                '🇺🇸',
  'Paraguay':           '🇵🇾',
  'Australia':          '🇦🇺',
  'Türkiye':            '🇹🇷',
  // Group E
  'Germany':            '🇩🇪',
  'Curaçao':            '🇨🇼',
  'Ivory Coast':        '🇨🇮',
  'Ecuador':            '🇪🇨',
  // Group F
  'Netherlands':        '🇳🇱',
  'Japan':              '🇯🇵',
  'Sweden':             '🇸🇪',
  'Tunisia':            '🇹🇳',
  // Group G
  'Belgium':            '🇧🇪',
  'Egypt':              '🇪🇬',
  'Iran':               '🇮🇷',
  'New Zealand':        '🇳🇿',
  // Group H
  'Spain':              '🇪🇸',
  'Cape Verde':         '🇨🇻',
  'Saudi Arabia':       '🇸🇦',
  'Uruguay':            '🇺🇾',
  // Group I
  'France':             '🇫🇷',
  'Senegal':            '🇸🇳',
  'Iraq':               '🇮🇶',
  'Norway':             '🇳🇴',
  // Group J
  'Argentina':          '🇦🇷',
  'Algeria':            '🇩🇿',
  'Austria':            '🇦🇹',
  'Jordan':             '🇯🇴',
  // Group K
  'Portugal':           '🇵🇹',
  'Congo DR':           '🇨🇩',
  'Uzbekistan':         '🇺🇿',
  'Colombia':           '🇨🇴',
  // Group L
  'England':            '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia':            '🇭🇷',
  'Ghana':              '🇬🇭',
  'Panama':             '🇵🇦',
}

/** All 48 qualified teams, alphabetical. */
export const TEAM_NAMES = Object.keys(FLAGS).sort()

/** Flag emoji only, e.g. "🇧🇷"; null for null/unknown teams. */
export function teamFlag(team: string | null | undefined): string | null {
  if (!team) return null
  return FLAGS[team] ?? null
}

/**
 * Returns the team name with its flag prepended, e.g. "🇧🇷 Brazil".
 * Falls back to `fallback` (no flag) when `team` is null/undefined or a
 * bracket placeholder like "Winner C" that has no flag entry.
 */
export function teamDisplay(
  team: string | null | undefined,
  fallback: string
): string {
  if (!team) return fallback
  const flag = FLAGS[team]
  return flag ? `${flag} ${team}` : team
}
