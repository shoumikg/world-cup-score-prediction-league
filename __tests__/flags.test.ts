import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { teamDisplay, TEAM_NAMES } from '../lib/flags'

describe('teamDisplay', () => {
  it('prepends the flag emoji for a known team', () => {
    expect(teamDisplay('Brazil', 'TBD')).toBe('🇧🇷 Brazil')
    expect(teamDisplay('Argentina', 'TBD')).toBe('🇦🇷 Argentina')
  })

  it('handles teams with special characters in their name', () => {
    expect(teamDisplay('Türkiye', 'TBD')).toMatch(/🇹🇷/)
    expect(teamDisplay('Curaçao', 'TBD')).toMatch(/🇨🇼/)
  })

  it('returns the fallback for null (knockout match not yet filled)', () => {
    expect(teamDisplay(null, 'Winner C')).toBe('Winner C')
  })

  it('returns the fallback for undefined', () => {
    expect(teamDisplay(undefined, 'TBD')).toBe('TBD')
  })

  it('returns the team name without flag for unknown names (bracket labels)', () => {
    expect(teamDisplay('Winner C', 'TBD')).toBe('Winner C')
    expect(teamDisplay('Runner-up F', 'TBD')).toBe('Runner-up F')
  })
})

describe('TEAM_NAMES', () => {
  it('contains exactly 48 teams', () => {
    expect(TEAM_NAMES).toHaveLength(48)
  })

  it('matches the favorite_team_valid constraint in migration 0004', () => {
    const sql = readFileSync(
      join(__dirname, '../supabase/migrations/0004_profile_fields.sql'),
      'utf8'
    )
    const constraint = sql.match(/favorite_team_valid[\s\S]*?\)\s*\)/)?.[0]
    expect(constraint).toBeTruthy()

    const sqlTeams = [...constraint!.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
    expect(sqlTeams).toEqual([...TEAM_NAMES].sort())
  })
})
