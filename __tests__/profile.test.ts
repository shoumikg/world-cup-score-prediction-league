import { describe, it, expect } from 'vitest'
import { validateDisplayName, validateFavoriteTeam, DISPLAY_NAME_MAX } from '../lib/profile'

describe('validateDisplayName', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(validateDisplayName('')).toHaveProperty('error')
    expect(validateDisplayName('   ')).toHaveProperty('error')
    expect(validateDisplayName(null)).toHaveProperty('error')
  })

  it('trims surrounding whitespace', () => {
    expect(validateDisplayName('  The Oracle  ')).toEqual({ value: 'The Oracle' })
  })

  it('accepts exactly the max length and rejects one over', () => {
    expect(validateDisplayName('x'.repeat(DISPLAY_NAME_MAX))).toEqual({
      value: 'x'.repeat(DISPLAY_NAME_MAX),
    })
    expect(validateDisplayName('x'.repeat(DISPLAY_NAME_MAX + 1))).toHaveProperty('error')
  })
})

describe('validateFavoriteTeam', () => {
  it('treats empty selection as null (no favourite)', () => {
    expect(validateFavoriteTeam('')).toEqual({ value: null })
    expect(validateFavoriteTeam(null)).toEqual({ value: null })
    expect(validateFavoriteTeam(undefined)).toEqual({ value: null })
  })

  it('accepts a real team', () => {
    expect(validateFavoriteTeam('Brazil')).toEqual({ value: 'Brazil' })
  })

  it('rejects names not in the tournament', () => {
    expect(validateFavoriteTeam('Atlantis')).toHaveProperty('error')
  })
})
