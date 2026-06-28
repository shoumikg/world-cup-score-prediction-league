import { describe, it, expect } from 'vitest'
import {
  finalistOptions,
  validateFinalistPrediction,
  finalists,
  computeFinalistGrades,
} from '../lib/finalist'
import { bonusPointsFor } from '../lib/bonus'
import type { Match, Stage, FinalistPrediction } from '../lib/types'

// Minimal but structurally faithful bracket: 4 R32 matches → 2 R16 → 2 QF →
// 2 SF → final. M73/M74 feed SF M101; M75/M76 feed SF M102.
function km(id: number, stage: Stage, homeSrc: string, awaySrc: string, home?: string, away?: string): Match {
  return {
    id, stage, group_name: null, kickoff_utc: '2026-06-28T17:00:00Z',
    home_team: home ?? null, away_team: away ?? null,
    home_source: homeSrc, away_source: awaySrc, venue: null,
    home_score: null, away_score: null, status: null, live_minute: null,
  }
}

function bracket(): Match[] {
  return [
    // Half A R32
    km(73, 'r32', 'Winner A', 'Runner-up B', 'Alpha', 'Bravo'),
    km(74, 'r32', 'Winner C', 'Runner-up D', 'Charlie', 'Delta'),
    // Half B R32
    km(75, 'r32', 'Winner E', 'Runner-up F', 'Echo', 'Foxtrot'),
    km(76, 'r32', 'Winner G', 'Runner-up H', 'Golf', 'Hotel'),
    // R16
    km(89, 'r16', 'Winner M73', 'Winner M74'),   // half A
    km(91, 'r16', 'Winner M75', 'Winner M76'),   // half B
    // QF
    km(97, 'qf', 'Winner M89', 'Winner M89'),    // half A (feeds SF M101)
    km(99, 'qf', 'Winner M91', 'Winner M91'),    // half B (feeds SF M102)
    // SF
    km(101, 'sf', 'Winner M97', 'Winner M97'),   // half A
    km(102, 'sf', 'Winner M99', 'Winner M99'),   // half B
    // Final
    km(104, 'final', 'Winner M101', 'Winner M102'),
  ]
}

describe('finalistOptions', () => {
  it('lists the round-of-32 teams, name-sorted, with no duplicates', () => {
    const opts = finalistOptions(bracket())
    expect(opts).toContain('Alpha')
    expect(opts).toContain('Echo')
    expect(opts).toEqual([...opts].sort())          // sorted
    expect(opts.length).toBe(new Set(opts).size)    // unique
    // Only R32 participants — later-round placeholder slots aren't included.
    expect(opts).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'])
  })

  it('omits teams not yet placed in the bracket', () => {
    const matches = bracket().map(m => m.id === 75 ? km(75, 'r32', 'Winner E', 'Runner-up F') : m)
    const opts = finalistOptions(matches)
    expect(opts).not.toContain('Echo')
    expect(opts).toContain('Alpha')
  })
})

describe('validateFinalistPrediction', () => {
  it('accepts any two distinct round-of-32 teams', () => {
    expect(validateFinalistPrediction('Alpha', 'Echo', bracket())).toEqual({ teamA: 'Alpha', teamB: 'Echo' })
  })
  it('accepts two teams that would meet before the final (no half restriction)', () => {
    // Alpha and Delta both feed SF M101 — previously rejected, now allowed.
    expect(validateFinalistPrediction('Alpha', 'Delta', bracket())).toEqual({ teamA: 'Alpha', teamB: 'Delta' })
  })
  it('rejects the same team twice', () => {
    const r = validateFinalistPrediction('Alpha', 'Alpha', bracket())
    expect('error' in r && r.error).toMatch(/different/i)
  })
  it('rejects a team not in the bracket', () => {
    const r = validateFinalistPrediction('Alpha', 'Nowhere', bracket())
    expect('error' in r).toBe(true)
  })
  it('rejects a missing pick', () => {
    expect('error' in validateFinalistPrediction('Alpha', '', bracket())).toBe(true)
  })
})

describe('computeFinalistGrades', () => {
  const preds: FinalistPrediction[] = [
    { user_id: 'u1', team_a: 'Alpha', team_b: 'Echo', updated_at: '' }, // both finalists
    { user_id: 'u2', team_a: 'Alpha', team_b: 'Hotel', updated_at: '' }, // one finalist
    { user_id: 'u3', team_a: 'Delta', team_b: 'Hotel', updated_at: '' }, // none
  ]

  function withFinal(home: string | null, away: string | null): Match[] {
    return bracket().map(m =>
      m.id === 104 ? { ...m, home_team: home, away_team: away } : m
    )
  }

  it('returns [] finalists until both teams of the final are known', () => {
    expect(finalists(withFinal('Alpha', null))).toEqual([])
  })

  it('scores 50 / 25 / 0 via two 25-pt sub-grades', () => {
    const matches = withFinal('Alpha', 'Echo')
    const grades = computeFinalistGrades(preds, matches)
    const pts = (uid: string) =>
      grades.filter(g => g.user_id === uid && g.is_correct).reduce((s, g) => s + bonusPointsFor(g.question_id), 0)
    expect(pts('u1')).toBe(50)
    expect(pts('u2')).toBe(25)
    expect(pts('u3')).toBe(0)
  })

  it('scores everyone 0 before the final is decided', () => {
    const grades = computeFinalistGrades(preds, bracket())
    expect(grades.every(g => !g.is_correct)).toBe(true)
  })
})
