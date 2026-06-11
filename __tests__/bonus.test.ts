import { describe, it, expect } from 'vitest'
import { validateBonusAnswer, BONUS_TEXT_MAX, GROUP_BONUS_QUESTIONS } from '../lib/bonus'
import { TEAM_NAMES } from '../lib/flags'

const validTeam = 'Brazil'

// ── Q1: player type ───────────────────────────────────────────
describe('validateBonusAnswer — Q1 (player)', () => {
  it('accepts a valid player name and country', () => {
    expect(validateBonusAnswer(1, 'Vinícius Jr', validTeam))
      .toEqual({ answer: { text: 'Vinícius Jr', team: validTeam } })
  })

  it('trims whitespace from the player name', () => {
    expect(validateBonusAnswer(1, '  Neymar  ', validTeam))
      .toEqual({ answer: { text: 'Neymar', team: validTeam } })
  })

  it('rejects an empty player name', () => {
    expect(validateBonusAnswer(1, '', validTeam)).toHaveProperty('error')
  })

  it('rejects a whitespace-only player name', () => {
    expect(validateBonusAnswer(1, '   ', validTeam)).toHaveProperty('error')
  })

  it('rejects null player name', () => {
    expect(validateBonusAnswer(1, null, validTeam)).toHaveProperty('error')
  })

  it('rejects undefined player name', () => {
    expect(validateBonusAnswer(1, undefined, validTeam)).toHaveProperty('error')
  })

  it(`accepts a player name of exactly ${BONUS_TEXT_MAX} characters`, () => {
    const maxName = 'A'.repeat(BONUS_TEXT_MAX)
    expect(validateBonusAnswer(1, maxName, validTeam))
      .toEqual({ answer: { text: maxName, team: validTeam } })
  })

  it(`rejects a player name one character over the limit`, () => {
    const overName = 'A'.repeat(BONUS_TEXT_MAX + 1)
    expect(validateBonusAnswer(1, overName, validTeam)).toHaveProperty('error')
  })

  it('rejects a missing team (empty string)', () => {
    expect(validateBonusAnswer(1, 'Messi', '')).toHaveProperty('error')
  })

  it('rejects a missing team (null)', () => {
    expect(validateBonusAnswer(1, 'Messi', null)).toHaveProperty('error')
  })

  it('rejects an invalid team name', () => {
    expect(validateBonusAnswer(1, 'Messi', 'Atlantis')).toHaveProperty('error')
  })
})

// ── Q2 and Q3: team type ──────────────────────────────────────
describe('validateBonusAnswer — Q2 (team)', () => {
  it('accepts a valid team', () => {
    expect(validateBonusAnswer(2, null, validTeam))
      .toEqual({ answer: { text: null, team: validTeam } })
  })

  it('ignores any provided text and sets it to null', () => {
    expect(validateBonusAnswer(2, 'should be ignored', validTeam))
      .toEqual({ answer: { text: null, team: validTeam } })
  })

  it('rejects an invalid team', () => {
    expect(validateBonusAnswer(2, null, 'Not A Team')).toHaveProperty('error')
  })

  it('rejects a missing team', () => {
    expect(validateBonusAnswer(2, null, '')).toHaveProperty('error')
  })
})

describe('validateBonusAnswer — Q3 (team)', () => {
  it('accepts a valid team', () => {
    expect(validateBonusAnswer(3, null, 'Argentina'))
      .toEqual({ answer: { text: null, team: 'Argentina' } })
  })

  it('rejects an invalid team', () => {
    expect(validateBonusAnswer(3, null, 'Wakanda')).toHaveProperty('error')
  })
})

// ── Invalid question IDs ──────────────────────────────────────
describe('validateBonusAnswer — invalid question IDs', () => {
  it('rejects question ID 0', () => {
    expect(validateBonusAnswer(0, null, validTeam)).toHaveProperty('error')
  })

  it('rejects question ID 4', () => {
    expect(validateBonusAnswer(4, null, validTeam)).toHaveProperty('error')
  })

  it('rejects a non-integer question ID', () => {
    expect(validateBonusAnswer(1.5, null, validTeam)).toHaveProperty('error')
  })
})

// ── TEAM_NAMES coverage ───────────────────────────────────────
describe('validateBonusAnswer — TEAM_NAMES coverage', () => {
  it('accepts every team in TEAM_NAMES for Q2', () => {
    for (const team of TEAM_NAMES) {
      const result = validateBonusAnswer(2, null, team)
      expect(result, `expected ${team} to be valid`).not.toHaveProperty('error')
    }
  })

  it('accepts every team in TEAM_NAMES as Q1 country', () => {
    for (const team of TEAM_NAMES) {
      const result = validateBonusAnswer(1, 'Test Player', team)
      expect(result, `expected ${team} to be valid for Q1`).not.toHaveProperty('error')
    }
  })
})

// ── GROUP_BONUS_QUESTIONS structure ──────────────────────────
describe('GROUP_BONUS_QUESTIONS', () => {
  it('has exactly 3 questions', () => {
    expect(GROUP_BONUS_QUESTIONS).toHaveLength(3)
  })

  it('has IDs 1, 2, 3 in order', () => {
    expect(GROUP_BONUS_QUESTIONS.map(q => q.id)).toEqual([1, 2, 3])
  })

  it('Q1 is player type, Q2 and Q3 are team type', () => {
    expect(GROUP_BONUS_QUESTIONS[0].type).toBe('player')
    expect(GROUP_BONUS_QUESTIONS[1].type).toBe('team')
    expect(GROUP_BONUS_QUESTIONS[2].type).toBe('team')
  })
})
