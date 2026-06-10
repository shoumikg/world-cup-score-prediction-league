import { describe, it, expect } from 'vitest'
import { teamDisplay } from '../lib/flags'

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
