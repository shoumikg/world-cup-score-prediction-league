import { describe, it, expect } from 'vitest'
import { computeGroupStandings } from '../lib/standings'
import type { Match } from '../lib/types'

let nextId = 1
function groupMatch(
  group: string,
  home: string,
  away: string,
  homeScore: number | null = null,
  awayScore: number | null = null
): Match {
  return {
    id: nextId++,
    stage: 'group',
    group_name: group,
    kickoff_utc: '2026-06-11T19:00:00Z',
    home_team: home,
    away_team: away,
    home_source: null,
    away_source: null,
    venue: null,
    home_score: homeScore,
    away_score: awayScore,
  }
}

describe('computeGroupStandings', () => {
  it('lists all teams with zeros before any results (like the official table)', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa'),
      groupMatch('A', 'South Korea', 'Czechia'),
    ]).get('A')!

    expect(rows).toHaveLength(4)
    for (const r of rows) {
      expect(r).toMatchObject({ mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 })
    }
  })

  it('awards 3 points for a win and 0 for a loss, with goal accounting', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa', 3, 1),
    ]).get('A')!

    const mexico = rows.find(r => r.team === 'Mexico')!
    const sa = rows.find(r => r.team === 'South Africa')!
    expect(mexico).toMatchObject({ mp: 1, w: 1, d: 0, l: 0, gf: 3, ga: 1, gd: 2, pts: 3 })
    expect(sa).toMatchObject({ mp: 1, w: 0, d: 0, l: 1, gf: 1, ga: 3, gd: -2, pts: 0 })
  })

  it('awards 1 point each for a draw', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa', 1, 1),
    ]).get('A')!

    for (const r of rows) {
      expect(r).toMatchObject({ mp: 1, d: 1, pts: 1 })
    }
  })

  it('ignores matches without results in the numbers', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa', 2, 0),
      groupMatch('A', 'Mexico', 'South Korea'), // not played yet
    ]).get('A')!

    const mexico = rows.find(r => r.team === 'Mexico')!
    expect(mexico.mp).toBe(1)
    expect(rows).toHaveLength(3) // South Korea appears with zeros
  })

  it('sorts by points first', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa', 2, 0),       // Mexico 3 pts
      groupMatch('A', 'South Korea', 'Czechia', 1, 1),       // 1 pt each
    ]).get('A')!

    expect(rows[0].team).toBe('Mexico')
    expect(rows[rows.length - 1].team).toBe('South Africa')
  })

  it('breaks points ties by goal difference', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'Czechia', 4, 0),        // Mexico GD +4
      groupMatch('A', 'South Africa', 'South Korea', 1, 0), // South Africa GD +1
    ]).get('A')!

    expect(rows[0].team).toBe('Mexico')
    expect(rows[1].team).toBe('South Africa')
  })

  it('breaks points+GD ties by goals scored', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'Czechia', 3, 1),        // GD +2, GF 3
      groupMatch('A', 'South Africa', 'South Korea', 2, 0), // GD +2, GF 2
    ]).get('A')!

    expect(rows[0].team).toBe('Mexico')
  })

  it('breaks full ties alphabetically for a stable order', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'Czechia', 1, 0),
      groupMatch('A', 'South Africa', 'South Korea', 1, 0),
    ]).get('A')!

    // Mexico and South Africa both 3 pts, GD +1, GF 1
    expect(rows[0].team).toBe('Mexico')
    expect(rows[1].team).toBe('South Africa')
  })

  it('keeps groups separate and sorted by group name', () => {
    const standings = computeGroupStandings([
      groupMatch('B', 'Canada', 'Qatar', 2, 0),
      groupMatch('A', 'Mexico', 'Czechia', 1, 0),
    ])

    expect([...standings.keys()]).toEqual(['A', 'B'])
    expect(standings.get('B')![0].team).toBe('Canada')
  })

  it('ignores knockout matches entirely', () => {
    const knockout: Match = {
      ...groupMatch('A', 'Mexico', 'Brazil', 2, 1),
      stage: 'r32',
      group_name: null,
    }
    expect(computeGroupStandings([knockout]).size).toBe(0)
  })

  it('accumulates across multiple matchdays', () => {
    const rows = computeGroupStandings([
      groupMatch('A', 'Mexico', 'South Africa', 2, 0),
      groupMatch('A', 'Mexico', 'South Korea', 1, 1),
      groupMatch('A', 'Czechia', 'Mexico', 0, 3),
    ]).get('A')!

    const mexico = rows.find(r => r.team === 'Mexico')!
    expect(mexico).toMatchObject({ mp: 3, w: 2, d: 1, l: 0, gf: 6, ga: 1, gd: 5, pts: 7 })
  })
})
