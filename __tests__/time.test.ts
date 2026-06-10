import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { istDateKey, isKickedOff } from '../lib/time'

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
