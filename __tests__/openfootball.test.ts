import { describe, it, expect } from 'vitest'
import {
  parseMinute,
  normalizeOFTeamName,
  buildEventRows,
  matchSquadPlayer,
  type OFMatch,
  type OFPlayer,
} from '../lib/openfootball'

describe('parseMinute', () => {
  it('parses a plain minute string', () => {
    expect(parseMinute('67')).toEqual({ minute: 67, extraTime: null })
  })
  it('parses a stoppage-time string', () => {
    expect(parseMinute('45+5')).toEqual({ minute: 45, extraTime: 5 })
    expect(parseMinute('90+8')).toEqual({ minute: 90, extraTime: 8 })
  })
  it('accepts numbers', () => {
    expect(parseMinute(9)).toEqual({ minute: 9, extraTime: null })
  })
  it('returns nulls for missing/empty/garbage', () => {
    expect(parseMinute(undefined)).toEqual({ minute: null, extraTime: null })
    expect(parseMinute(null)).toEqual({ minute: null, extraTime: null })
    expect(parseMinute('')).toEqual({ minute: null, extraTime: null })
    expect(parseMinute('abc')).toEqual({ minute: null, extraTime: null })
  })
})

describe('normalizeOFTeamName', () => {
  it('maps known spelling differences to our DB names', () => {
    expect(normalizeOFTeamName('Czech Republic')).toBe('Czechia')
    expect(normalizeOFTeamName('Bosnia and Herzegovina')).toBe('Bosnia-Herzegovina')
    expect(normalizeOFTeamName('Bosnia & Herzegovina')).toBe('Bosnia-Herzegovina')
    expect(normalizeOFTeamName('Turkey')).toBe('Türkiye')
    expect(normalizeOFTeamName('Korea Republic')).toBe('South Korea')
    expect(normalizeOFTeamName('United States')).toBe('USA')
  })
  it('passes through already-matching names', () => {
    expect(normalizeOFTeamName('USA')).toBe('USA')
    expect(normalizeOFTeamName('South Korea')).toBe('South Korea')
    expect(normalizeOFTeamName('Iran')).toBe('Iran')
  })
  it('trims whitespace', () => {
    expect(normalizeOFTeamName('  Brazil  ')).toBe('Brazil')
  })
})

describe('buildEventRows', () => {
  const match: OFMatch = {
    team1: 'Mexico',
    team2: 'South Africa',
    date: '2026-06-11',
    goals1: [
      { name: 'Julián Quiñones', minute: '9' },
      { name: 'Raúl Jiménez', minute: '67' },
    ],
    goals2: [],
  }

  it('maps goals1 to home and goals2 to away', () => {
    const rows = buildEventRows(match, 42)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      match_id: 42,
      minute: 9,
      extra_time: null,
      type: 'goal',
      team: 'home',
      player_name: 'Julián Quiñones',
      assist_name: null,
    })
    expect(rows.every(r => r.team === 'home')).toBe(true)
  })

  it('marks own goals', () => {
    const rows = buildEventRows(
      { team1: 'A', team2: 'B', goals2: [{ name: 'Defender', minute: '30', owngoal: true }] },
      1
    )
    expect(rows[0].type).toBe('own_goal')
    expect(rows[0].team).toBe('away')
  })

  it('marks penalties when flagged', () => {
    const rows = buildEventRows(
      { team1: 'A', team2: 'B', goals1: [{ name: 'Striker', minute: '50', penalty: true }] },
      1
    )
    expect(rows[0].type).toBe('penalty')
  })

  it('parses stoppage-time minutes', () => {
    const rows = buildEventRows(
      { team1: 'A', team2: 'B', goals1: [{ name: 'X', minute: '90+3' }] },
      1
    )
    expect(rows[0]).toMatchObject({ minute: 90, extra_time: 3 })
  })

  it('skips goals with no scorer name', () => {
    const rows = buildEventRows(
      { team1: 'A', team2: 'B', goals1: [{ name: '', minute: '10' }, { name: '   ', minute: '20' }] },
      1
    )
    expect(rows).toHaveLength(0)
  })

  it('returns an empty array when there are no goals', () => {
    expect(buildEventRows({ team1: 'A', team2: 'B' }, 1)).toEqual([])
  })
})

describe('matchSquadPlayer', () => {
  const p = (number: number, name: string, pos: OFPlayer['pos'] = 'FW'): OFPlayer => ({
    number, name, pos, date_of_birth: '2000-01-01',
  })
  const squad: OFPlayer[] = [
    p(9, 'Adam Hložek'),
    p(10, 'Patrik Schick'),
    p(7, 'Ladislav Krejčí', 'DF'),
    p(8, 'Vladimír Darida', 'MF'),
    p(1, 'Matěj Kovář', 'GK'),
  ]

  it('matches an exact full name', () => {
    const m = matchSquadPlayer('Patrik Schick', squad)
    expect(m?.player.number).toBe(10)
    expect(m?.method).toBe('exact')
    expect(m?.ambiguous).toBe(false)
  })

  it('matches a bare surname', () => {
    expect(matchSquadPlayer('Schick', squad)?.player.number).toBe(10)
    expect(matchSquadPlayer('schick', squad)?.method).toBe('surname')
  })

  it('matches ignoring diacritics in either direction', () => {
    expect(matchSquadPlayer('Krejci', squad)?.player.number).toBe(7)
    expect(matchSquadPlayer('hlozek', squad)?.player.number).toBe(9)
    expect(matchSquadPlayer('Ladislav Krejci', squad)?.player.number).toBe(7)
  })

  it('matches via substring as a last resort', () => {
    // "darid" is not a full token, so it falls through to partial
    const m = matchSquadPlayer('darid', squad)
    expect(m?.player.number).toBe(8)
    expect(m?.method).toBe('partial')
  })

  it('flags ambiguous surname matches', () => {
    const dupes = [p(7, 'Ladislav Krejčí', 'DF'), p(14, 'Jakub Krejčí', 'MF')]
    const m = matchSquadPlayer('Krejci', dupes)
    expect(m?.ambiguous).toBe(true)
    expect(m?.method).toBe('surname')
  })

  it('returns null for no match, empty text, or empty squad', () => {
    expect(matchSquadPlayer('Ronaldo', squad)).toBeNull()
    expect(matchSquadPlayer('', squad)).toBeNull()
    expect(matchSquadPlayer(null, squad)).toBeNull()
    expect(matchSquadPlayer('Schick', [])).toBeNull()
  })
})
