import { describe, it, expect } from 'vitest'
import { validateMatchEvent, PLAYER_NAME_MAX } from '../lib/matchEvent'

function ok(r: ReturnType<typeof validateMatchEvent>) {
  if ('error' in r) throw new Error(`expected valid, got error: ${r.error}`)
  return r.value
}

describe('validateMatchEvent', () => {
  it('accepts a plain goal with a simple minute', () => {
    const v = ok(validateMatchEvent('home', 'goal', 'Lionel Messi', '67'))
    expect(v).toEqual({
      team: 'home', type: 'goal', playerName: 'Lionel Messi', minute: 67, extraTime: null,
    })
  })

  it('parses stoppage-time minutes like 45+2', () => {
    const v = ok(validateMatchEvent('away', 'penalty', 'Harry Kane', '90+5'))
    expect(v.minute).toBe(90)
    expect(v.extraTime).toBe(5)
  })

  it('allows an empty minute (unknown) → null/null', () => {
    const v = ok(validateMatchEvent('home', 'own_goal', 'Some Defender', ''))
    expect(v.minute).toBeNull()
    expect(v.extraTime).toBeNull()
    expect(v.type).toBe('own_goal')
  })

  it('treats a null minute as unknown', () => {
    const v = ok(validateMatchEvent('home', 'goal', 'Player', null))
    expect(v.minute).toBeNull()
  })

  it('trims the player name', () => {
    expect(ok(validateMatchEvent('home', 'goal', '  Vinicius Jr  ', '12')).playerName).toBe('Vinicius Jr')
  })

  it('rejects an unknown team', () => {
    const r = validateMatchEvent('middle', 'goal', 'Player', '10')
    expect('error' in r).toBe(true)
  })

  it('rejects an unknown goal type', () => {
    const r = validateMatchEvent('home', 'assist', 'Player', '10')
    expect('error' in r).toBe(true)
  })

  it('rejects an empty / whitespace-only name', () => {
    expect('error' in validateMatchEvent('home', 'goal', '', '10')).toBe(true)
    expect('error' in validateMatchEvent('home', 'goal', '   ', '10')).toBe(true)
  })

  it('rejects a name over the max length', () => {
    const long = 'x'.repeat(PLAYER_NAME_MAX + 1)
    expect('error' in validateMatchEvent('home', 'goal', long, '10')).toBe(true)
    // exactly the max passes
    expect('error' in validateMatchEvent('home', 'goal', 'x'.repeat(PLAYER_NAME_MAX), '10')).toBe(false)
  })

  it('rejects malformed minute strings', () => {
    for (const bad of ['abc', '45+', '+5', '12.5', '45+2+3', '-3']) {
      expect('error' in validateMatchEvent('home', 'goal', 'Player', bad)).toBe(true)
    }
  })

  it('rejects out-of-range minutes', () => {
    expect('error' in validateMatchEvent('home', 'goal', 'Player', '131')).toBe(true)
    expect('error' in validateMatchEvent('home', 'goal', 'Player', '90+31')).toBe(true)
  })
})
