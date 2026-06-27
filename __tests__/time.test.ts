import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { istDateKey, isKickedOff, kickoffTimerDelay, predictionDeadlineUTC, isDeadlinePassed, utcToISTInput, istInputToUTC } from '../lib/time'

describe('IST datetime-local conversion', () => {
  it('renders a UTC instant as IST wall-clock for the input', () => {
    // 17:00 UTC + 5:30 = 22:30 IST
    expect(utcToISTInput('2026-07-04T17:00:00Z')).toBe('2026-07-04T22:30')
  })

  it('converts an IST input back to the UTC instant', () => {
    expect(istInputToUTC('2026-07-04T22:30')).toBe('2026-07-04T17:00:00.000Z')
  })

  it('round-trips and handles the day boundary (IST ahead of UTC)', () => {
    const utc = '2026-07-04T20:00:00.000Z' // 01:30 IST on July 5
    expect(utcToISTInput(utc)).toBe('2026-07-05T01:30')
    expect(istInputToUTC(utcToISTInput(utc))).toBe(utc)
  })
})

describe('istDateKey', () => {
  it('returns the UTC date for a match well within the same IST day', () => {
    // UTC 10:00 Jun 11 → IST 15:30 Jun 11 → same day
    expect(istDateKey('2026-06-11T10:00:00Z')).toBe('2026-06-11')
  })

  it('advances to next IST day when UTC crosses 18:30', () => {
    // UTC 18:29:59 → IST 23:59:59 → still Jun 11
    expect(istDateKey('2026-06-11T18:29:59Z')).toBe('2026-06-11')
    // UTC 18:30:00 → IST 00:00:00 Jun 12 → advances to Jun 12
    expect(istDateKey('2026-06-11T18:30:00Z')).toBe('2026-06-12')
  })

  it('correctly maps the tournament opener (UTC 19:00 Jun 11 → IST Jun 12)', () => {
    // Match 1: Mexico vs South Africa kicks off at this UTC time
    expect(istDateKey('2026-06-11T19:00:00Z')).toBe('2026-06-12')
  })

  it('handles month-end rollover', () => {
    // UTC 18:30 Jun 30 → IST 00:00 Jul 1
    expect(istDateKey('2026-06-30T18:30:00Z')).toBe('2026-07-01')
  })

  it('handles year-end rollover', () => {
    // UTC 18:30 Dec 31 → IST 00:00 Jan 1
    expect(istDateKey('2025-12-31T18:30:00Z')).toBe('2026-01-01')
  })

  it('keeps late UTC night matches on the correct IST day', () => {
    // UTC 01:00 on Jun 14 → IST 06:30 Jun 14 (still the same IST day as the opener round)
    expect(istDateKey('2026-06-14T01:00:00Z')).toBe('2026-06-14')
  })
})

describe('isKickedOff', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns false when kickoff is in the future', () => {
    vi.setSystemTime(new Date('2026-06-11T18:00:00Z'))
    expect(isKickedOff('2026-06-11T19:00:00Z')).toBe(false)
  })

  it('returns true when kickoff is in the past', () => {
    vi.setSystemTime(new Date('2026-06-11T20:00:00Z'))
    expect(isKickedOff('2026-06-11T19:00:00Z')).toBe(true)
  })

  it('returns true at the exact kickoff moment (boundary is inclusive)', () => {
    vi.setSystemTime(new Date('2026-06-11T19:00:00Z'))
    expect(isKickedOff('2026-06-11T19:00:00Z')).toBe(true)
  })
})

describe('kickoffTimerDelay', () => {
  const NOW = new Date('2026-06-11T19:00:00Z').getTime()

  it("returns 'past' when kickoff has passed", () => {
    expect(kickoffTimerDelay('2026-06-11T18:00:00Z', NOW)).toBe('past')
  })

  it("returns 'past' at the exact kickoff moment (consistent with isKickedOff)", () => {
    expect(kickoffTimerDelay('2026-06-11T19:00:00Z', NOW)).toBe('past')
  })

  it('returns the exact remaining milliseconds for an upcoming match', () => {
    expect(kickoffTimerDelay('2026-06-11T19:00:05Z', NOW)).toBe(5000)
  })

  it('returns null beyond the setTimeout overflow limit (~24.8 days)', () => {
    // 30 days out would overflow a 32-bit timer delay and fire immediately
    expect(kickoffTimerDelay('2026-07-11T19:00:00Z', NOW)).toBeNull()
  })

  it('returns a number just inside the overflow limit', () => {
    const justInside = NOW + 2 ** 31 - 1
    expect(kickoffTimerDelay(new Date(justInside).toISOString(), NOW)).toBe(2 ** 31 - 1)
  })
})

describe('predictionDeadlineUTC', () => {
  it('returns 9 PM IST the previous day (15:30 UTC) for a mid-afternoon IST kickoff', () => {
    // 14:00 IST June 12 = 08:30 UTC June 12 → deadline June 11 21:00 IST = 15:30 UTC
    expect(predictionDeadlineUTC('2026-06-12T08:30:00Z').toISOString())
      .toBe('2026-06-11T15:30:00.000Z')
  })

  it('uses the IST calendar date regardless of UTC date', () => {
    // 19:30 IST June 12 = 14:00 UTC June 12 → same deadline as above
    expect(predictionDeadlineUTC('2026-06-12T14:00:00Z').toISOString())
      .toBe('2026-06-11T15:30:00.000Z')
  })

  it('all matches on the same IST day share one deadline', () => {
    // First moment of June 12 IST = 18:30 UTC June 11; last predictable moment = just before midnight IST
    const first = predictionDeadlineUTC('2026-06-11T18:30:00Z') // 00:00 IST June 12
    const last  = predictionDeadlineUTC('2026-06-12T18:00:00Z') // 23:30 IST June 12
    expect(first.toISOString()).toBe(last.toISOString())
    expect(first.toISOString()).toBe('2026-06-11T15:30:00.000Z')
  })

  it('handles month-end rollover', () => {
    // Match July 1 IST → deadline June 30 9 PM IST = June 30 15:30 UTC
    expect(predictionDeadlineUTC('2026-07-01T00:00:00Z').toISOString())
      .toBe('2026-06-30T15:30:00.000Z')
  })
})

describe('isDeadlinePassed', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns false when the 9 PM IST deadline is still in the future', () => {
    vi.setSystemTime(new Date('2026-06-11T14:30:00Z')) // 8 PM IST June 11
    expect(isDeadlinePassed('2026-06-12T08:30:00Z')).toBe(false)
  })

  it('returns true when the deadline has passed', () => {
    vi.setSystemTime(new Date('2026-06-11T16:30:00Z')) // 10 PM IST June 11
    expect(isDeadlinePassed('2026-06-12T08:30:00Z')).toBe(true)
  })

  it('returns true at exactly the deadline moment (boundary inclusive)', () => {
    vi.setSystemTime(new Date('2026-06-11T15:30:00Z')) // exactly 9 PM IST June 11
    expect(isDeadlinePassed('2026-06-12T08:30:00Z')).toBe(true)
  })
})
