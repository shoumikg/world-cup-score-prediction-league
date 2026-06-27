import { describe, it, expect } from 'vitest'
import {
  isGroupComplete,
  computeKnockoutFills,
  rankQualifiedThirds,
} from '../lib/knockout'
import type { Match, Stage } from '../lib/types'

let nextId = 1000
function gm(
  group: string,
  home: string,
  away: string,
  hs: number | null = null,
  as: number | null = null
): Match {
  return {
    id: nextId++, stage: 'group', group_name: group, kickoff_utc: '2026-06-11T19:00:00Z',
    home_team: home, away_team: away, home_source: null, away_source: null, venue: null,
    home_score: hs, away_score: as, status: hs !== null ? 'ft' : null, live_minute: null,
  }
}

function km(
  id: number, stage: Stage, homeSrc: string, awaySrc: string,
  opts: { home?: string; away?: string; hs?: number; as?: number; status?: Match['status'] } = {}
): Match {
  return {
    id, stage, group_name: null, kickoff_utc: '2026-06-28T17:00:00Z',
    home_team: opts.home ?? null, away_team: opts.away ?? null,
    home_source: homeSrc, away_source: awaySrc, venue: null,
    home_score: opts.hs ?? null, away_score: opts.as ?? null, status: opts.status ?? null,
    live_minute: null,
  }
}

// A complete group A with a clear order: A1 (6 pts) > A2 (3) > A3 (0).
function completeGroupA(): Match[] {
  return [
    gm('A', 'A1', 'A2', 2, 0),
    gm('A', 'A1', 'A3', 1, 0),
    gm('A', 'A2', 'A3', 1, 0),
  ]
}

function fillFor(fills: { id: number; home_team?: string; away_team?: string }[], id: number) {
  return fills.find(f => f.id === id)
}

describe('isGroupComplete', () => {
  it('is false while any group match lacks a result', () => {
    const matches = [gm('A', 'A1', 'A2', 1, 0), gm('A', 'A1', 'A3')]
    expect(isGroupComplete(matches, 'A')).toBe(false)
  })
  it('is true once every group match has a result', () => {
    expect(isGroupComplete(completeGroupA(), 'A')).toBe(true)
  })
  it('is false for a group with no matches', () => {
    expect(isGroupComplete(completeGroupA(), 'Z')).toBe(false)
  })
})

describe('computeKnockoutFills — group winners / runners-up', () => {
  it('does not fill until the group is complete', () => {
    const matches = [
      gm('A', 'A1', 'A2', 1, 0), // A3 games unplayed → group incomplete
      gm('A', 'A1', 'A3'),
      gm('A', 'A2', 'A3'),
      km(73, 'r32', 'Winner A', 'Runner-up A'),
    ]
    expect(computeKnockoutFills(matches)).toEqual([])
  })

  it('fills winner and runner-up once the group is complete', () => {
    const matches = [...completeGroupA(), km(73, 'r32', 'Winner A', 'Runner-up A')]
    const fills = computeKnockoutFills(matches)
    expect(fillFor(fills, 73)).toEqual({ id: 73, home_team: 'A1', away_team: 'A2' })
  })
})

describe('computeKnockoutFills — match progression', () => {
  it('fills Winner M## and Loser M## from a decided result', () => {
    const matches = [
      km(101, 'sf', 'x', 'y', { home: 'X', away: 'Y', hs: 2, as: 1, status: 'ft' }),
      km(104, 'final', 'Winner M101', 'Winner M102'),
      km(103, 'third', 'Loser M101', 'Loser M102'),
    ]
    const fills = computeKnockoutFills(matches)
    expect(fillFor(fills, 104)).toEqual({ id: 104, home_team: 'X' })
    expect(fillFor(fills, 103)).toEqual({ id: 103, home_team: 'Y' })
  })

  it('leaves Winner/Loser M## unresolved when the match ended level (penalty shootout)', () => {
    const matches = [
      km(101, 'sf', 'x', 'y', { home: 'X', away: 'Y', hs: 1, as: 1, status: 'pen' }),
      km(104, 'final', 'Winner M101', 'Winner M102'),
    ]
    expect(computeKnockoutFills(matches)).toEqual([])
  })
})

describe('computeKnockoutFills — safety rules', () => {
  it('never auto-assigns a Best 3rd slot', () => {
    const matches = [...completeGroupA(), km(75, 'r32', 'Winner A', 'Best 3rd (A/B/C/D/F)')]
    const fills = computeKnockoutFills(matches)
    // Home resolves from the group; the Best-3rd away slot stays for the admin.
    expect(fillFor(fills, 75)).toEqual({ id: 75, home_team: 'A1' })
  })

  it('never overwrites a slot an admin already set', () => {
    const matches = [
      ...completeGroupA(),
      km(73, 'r32', 'Winner A', 'Runner-up A', { home: 'Manual Override' }),
    ]
    const fills = computeKnockoutFills(matches)
    // Home is already set → only the empty away side is filled.
    expect(fillFor(fills, 73)).toEqual({ id: 73, away_team: 'A2' })
  })

  it('resolves two dependency levels in a single pass (fixpoint)', () => {
    const matches = [
      ...completeGroupA(),
      // R32 already has teams + a result entered, feeding the R16 slot.
      km(73, 'r32', 'Winner A', 'Runner-up A', { home: 'A1', away: 'A2', hs: 3, as: 0, status: 'ft' }),
      km(91, 'r16', 'Winner M73', 'Winner M75'),
    ]
    const fills = computeKnockoutFills(matches)
    expect(fillFor(fills, 91)).toEqual({ id: 91, home_team: 'A1' })
  })
})

describe('rankQualifiedThirds', () => {
  it('ranks thirds across complete groups and flags the qualifiers', () => {
    // Group A third = A3 (0 pts). In group B, B2 and B3 both finish on 1 pt but
    // B3 has the better GD, so B2 is the third-placed team (1 pt) → ranks above A3.
    const matches = [
      ...completeGroupA(),
      gm('B', 'B1', 'B2', 3, 0),
      gm('B', 'B1', 'B3', 1, 0),
      gm('B', 'B2', 'B3', 1, 1),
    ]
    const thirds = rankQualifiedThirds(matches)
    expect(thirds.map(t => t.team)).toEqual(['B2', 'A3'])
    expect(thirds.every(t => t.qualifies)).toBe(true) // fewer than 8 → all qualify
  })

  it('ignores groups that are not yet complete', () => {
    const matches = [
      ...completeGroupA(),
      gm('B', 'B1', 'B2', 3, 0),
      gm('B', 'B1', 'B3'), // unplayed → group B incomplete
    ]
    const thirds = rankQualifiedThirds(matches)
    expect(thirds.map(t => t.group)).toEqual(['A'])
  })
})
