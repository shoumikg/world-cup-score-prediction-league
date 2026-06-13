import { describe, it, expect } from 'vitest'
import {
  parseMinute,
  normalizeOFTeamName,
  buildEventRows,
  type OFMatch,
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
