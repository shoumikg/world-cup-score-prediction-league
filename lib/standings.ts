import type { Match } from './types'

export interface TableRow {
  team: string
  mp: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
}

/**
 * Computes group-stage standings from match fixtures and results.
 * Teams appear as soon as their fixtures exist (all zeros before results);
 * only matches with an entered result affect the numbers.
 * Sort order: points, goal difference, goals for, then team name.
 */
export function computeGroupStandings(matches: Match[]): Map<string, TableRow[]> {
  const groups = new Map<string, Map<string, TableRow>>()

  for (const m of matches) {
    if (m.stage !== 'group' || !m.group_name || !m.home_team || !m.away_team) continue

    let g = groups.get(m.group_name)
    if (!g) {
      g = new Map()
      groups.set(m.group_name, g)
    }
    for (const team of [m.home_team, m.away_team]) {
      if (!g.has(team)) {
        g.set(team, { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 })
      }
    }

    if (m.home_score === null || m.away_score === null) continue
    applyResult(g.get(m.home_team)!, m.home_score, m.away_score)
    applyResult(g.get(m.away_team)!, m.away_score, m.home_score)
  }

  const out = new Map<string, TableRow[]>()
  for (const name of [...groups.keys()].sort()) {
    out.set(name, [...groups.get(name)!.values()].sort(compareRows))
  }
  return out
}

function applyResult(row: TableRow, scored: number, conceded: number) {
  row.mp += 1
  row.gf += scored
  row.ga += conceded
  row.gd = row.gf - row.ga
  if (scored > conceded) {
    row.w += 1
    row.pts += 3
  } else if (scored === conceded) {
    row.d += 1
    row.pts += 1
  } else {
    row.l += 1
  }
}

function compareRows(a: TableRow, b: TableRow): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
}
