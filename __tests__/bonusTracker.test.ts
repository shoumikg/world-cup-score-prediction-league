import { describe, it, expect } from 'vitest'
import {
  groupTopScorers,
  q1Leaders,
  q2Leaders,
  q3Leaders,
  isGroupStageComplete,
  computeBonusCorrectness,
} from '../lib/bonusTracker'
import type { Match, MatchEvent, BonusAnswer } from '../lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function event(
  match_id: number,
  player_name: string,
  type: 'goal' | 'own_goal' | 'penalty' = 'goal'
): MatchEvent {
  return { id: match_id * 100, match_id, minute: null, extra_time: null, type, team: 'home', player_name, assist_name: null }
}

function groupMatch(id: number, homeScore: number | null, awayScore: number | null, ht = 'A', at = 'B'): Match {
  return {
    id, stage: 'group', group_name: 'A', kickoff_utc: '2026-06-12T18:00:00Z',
    home_team: ht, away_team: at, home_source: null, away_source: null,
    venue: null, home_score: homeScore, away_score: awayScore, status: null, live_minute: null,
  }
}

function finalMatch(id: number): Match {
  return { ...groupMatch(id, null, null), stage: 'final', group_name: null }
}

// ── groupTopScorers ───────────────────────────────────────────────────────────

describe('groupTopScorers', () => {
  it('counts goals per player in group-stage matches', () => {
    const matches = [groupMatch(1, 2, 0), groupMatch(2, 1, 0)]
    const events = [
      event(1, 'Messi'), event(1, 'Messi'), event(2, 'Ronaldo'),
    ]
    const result = groupTopScorers(events, matches)
    expect(result[0]).toEqual({ playerName: 'Messi', goals: 2 })
    expect(result[1]).toEqual({ playerName: 'Ronaldo', goals: 1 })
  })

  it('excludes own goals from the scorer tally', () => {
    const matches = [groupMatch(1, 1, 0)]
    const events = [event(1, 'Defender', 'own_goal')]
    expect(groupTopScorers(events, matches)).toHaveLength(0)
  })

  it('includes penalties as goals for the taker', () => {
    const matches = [groupMatch(1, 1, 0)]
    const events = [event(1, 'Striker', 'penalty')]
    const result = groupTopScorers(events, matches)
    expect(result).toHaveLength(1)
    expect(result[0].goals).toBe(1)
  })

  it('ignores events for non-group-stage matches', () => {
    const matches = [finalMatch(99)]
    const events = [event(99, 'Messi')]
    expect(groupTopScorers(events, matches)).toHaveLength(0)
  })

  it('returns empty array with no events', () => {
    expect(groupTopScorers([], [groupMatch(1, 1, 0)])).toHaveLength(0)
  })
})

// ── q1Leaders ────────────────────────────────────────────────────────────────

describe('q1Leaders', () => {
  it('returns the top scorer', () => {
    const matches = [groupMatch(1, 2, 0)]
    const events = [event(1, 'Messi'), event(1, 'Messi'), event(1, 'Ronaldo')]
    const { leaders, stat } = q1Leaders(events, matches)
    expect(leaders).toEqual(['Messi'])
    expect(stat).toBe(2)
  })

  it('returns all players tied at the top', () => {
    const matches = [groupMatch(1, 2, 0)]
    const events = [event(1, 'A'), event(1, 'B')]
    const { leaders } = q1Leaders(events, matches)
    expect(leaders.sort()).toEqual(['A', 'B'])
  })

  it('returns empty leaders when no events', () => {
    expect(q1Leaders([], [groupMatch(1, 1, 0)])).toEqual({ leaders: [], stat: 0 })
  })
})

// ── q2Leaders ────────────────────────────────────────────────────────────────

describe('q2Leaders', () => {
  it('returns team with most goals scored', () => {
    const matches = [
      groupMatch(1, 3, 0, 'Brazil', 'France'),
      groupMatch(2, 1, 0, 'Germany', 'Italy'),
    ]
    const { leaders, stat } = q2Leaders(matches)
    expect(leaders).toEqual(['Brazil'])
    expect(stat).toBe(3)
  })

  it('returns all teams tied for most goals', () => {
    const matches = [
      groupMatch(1, 3, 0, 'Brazil', 'France'),
      groupMatch(2, 3, 0, 'Germany', 'Italy'),
    ]
    const { leaders } = q2Leaders(matches)
    expect(leaders.sort()).toEqual(['Brazil', 'Germany'])
  })

  it('returns empty when no matches have results', () => {
    expect(q2Leaders([groupMatch(1, null, null)])).toEqual({ leaders: [], stat: 0 })
  })
})

// ── q3Leaders ────────────────────────────────────────────────────────────────

describe('q3Leaders', () => {
  it('returns team with fewest goals conceded', () => {
    const matches = [
      groupMatch(1, 3, 0, 'Brazil', 'France'),  // Brazil 0 conceded, France 3 conceded
      groupMatch(2, 2, 1, 'Germany', 'Italy'),
    ]
    const { leaders, stat } = q3Leaders(matches)
    expect(leaders).toEqual(['Brazil'])
    expect(stat).toBe(0)
  })

  it('returns all teams tied at fewest conceded', () => {
    const matches = [
      groupMatch(1, 1, 0, 'Brazil', 'France'),
      groupMatch(2, 1, 0, 'Germany', 'Italy'),
    ]
    const { leaders } = q3Leaders(matches)
    expect(leaders.sort()).toEqual(['Brazil', 'Germany'])
  })

  it('ignores teams that have played 0 matches (no spurious zeros)', () => {
    // Teams without results shouldn't appear as "0 conceded" leaders
    const matches = [
      groupMatch(1, null, null, 'Brazil', 'France'),  // not played yet
      groupMatch(2, 1, 0, 'Germany', 'Italy'),
    ]
    const { leaders } = q3Leaders(matches)
    // Only Germany and Italy have played; Germany conceded 0
    expect(leaders).toEqual(['Germany'])
  })

  it('returns empty when no matches have results', () => {
    expect(q3Leaders([groupMatch(1, null, null)])).toEqual({ leaders: [], stat: 0 })
  })
})

// ── isGroupStageComplete ──────────────────────────────────────────────────────

describe('isGroupStageComplete', () => {
  it('returns true when all group matches have results', () => {
    expect(isGroupStageComplete([groupMatch(1, 1, 0), groupMatch(2, 2, 1)])).toBe(true)
  })

  it('returns false when any group match is missing a result', () => {
    expect(isGroupStageComplete([groupMatch(1, 1, 0), groupMatch(2, null, null)])).toBe(false)
  })

  it('returns false when there are no group matches', () => {
    expect(isGroupStageComplete([finalMatch(1)])).toBe(false)
    expect(isGroupStageComplete([])).toBe(false)
  })

  it('ignores non-group matches', () => {
    // group match done + final not done → still true (final isn't group stage)
    expect(isGroupStageComplete([groupMatch(1, 1, 0), finalMatch(99)])).toBe(true)
  })
})

// ── computeBonusCorrectness ───────────────────────────────────────────────────

function answer(user_id: string, question_id: number, answer_team: string, answer_text: string | null = null): BonusAnswer {
  return { user_id, question_id, answer_text, answer_team, updated_at: '' }
}

describe('computeBonusCorrectness', () => {
  const matches = [
    groupMatch(1, 3, 0, 'Brazil', 'France'),   // Brazil 3gf/0ga; France 0gf/3ga
    groupMatch(2, 1, 0, 'Germany', 'Italy'),   // Germany 1gf/0ga; Italy 0gf/1ga
  ]
  const events = [
    event(1, 'Neymar'), event(1, 'Neymar'), event(1, 'Vinicius'),  // Brazil 3 goals; Neymar top scorer 2
  ]

  describe('Q2 (most goals scored)', () => {
    it('marks correct when team matches leader', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 2, 'Brazil')],
        new Map(),
        events,
        matches
      )
      expect(grades).toHaveLength(1)
      expect(grades[0]).toEqual({ user_id: 'u1', question_id: 2, is_correct: true })
    })

    it('marks incorrect when team is behind', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 2, 'Germany')],
        new Map(),
        events,
        matches
      )
      expect(grades[0].is_correct).toBe(false)
    })

    it('marks all tied teams as correct', () => {
      const tiedMatches = [
        groupMatch(1, 3, 0, 'Brazil', 'France'),
        groupMatch(2, 3, 0, 'Germany', 'Italy'),
      ]
      const grades = computeBonusCorrectness(
        [answer('u1', 2, 'Brazil'), answer('u2', 2, 'Germany')],
        new Map(),
        [],
        tiedMatches
      )
      expect(grades.every(g => g.is_correct)).toBe(true)
    })
  })

  describe('Q3 (fewest goals conceded)', () => {
    it('marks correct for team with 0 conceded', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 3, 'Brazil')],
        new Map(),
        events,
        matches
      )
      expect(grades[0].is_correct).toBe(true)
    })

    it('marks incorrect for team with more conceded', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 3, 'France')],
        new Map(),
        events,
        matches
      )
      expect(grades[0].is_correct).toBe(false)
    })
  })

  describe('Q1 (top scorer)', () => {
    it('marks correct when confirmed_answer is the top scorer', () => {
      const confirmed = new Map([['u1', 'Neymar']])
      const grades = computeBonusCorrectness(
        [answer('u1', 1, 'Brazil', 'neymar')],
        confirmed,
        events,
        matches
      )
      expect(grades[0].is_correct).toBe(true)
    })

    it('marks incorrect when confirmed_answer is not the top scorer', () => {
      const confirmed = new Map([['u1', 'Vinicius']])  // 1 goal, not top
      const grades = computeBonusCorrectness(
        [answer('u1', 1, 'Brazil', 'vinicius')],
        confirmed,
        events,
        matches
      )
      expect(grades[0].is_correct).toBe(false)
    })

    it('excludes entries with no confirmed_answer from scoring', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 1, 'Brazil', 'neymar')],
        new Map(),  // no mapping for u1
        events,
        matches
      )
      expect(grades).toHaveLength(0)
    })

    it('marks all tied top scorers as correct', () => {
      const tiedEvents = [event(1, 'A'), event(1, 'B')]
      const confirmed = new Map([['u1', 'A'], ['u2', 'B']])
      const grades = computeBonusCorrectness(
        [answer('u1', 1, 'X', 'a'), answer('u2', 1, 'Y', 'b')],
        confirmed,
        tiedEvents,
        matches
      )
      expect(grades.every(g => g.is_correct)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('nobody is correct when no match data exists yet', () => {
      const grades = computeBonusCorrectness(
        [answer('u1', 2, 'Brazil'), answer('u1', 3, 'Brazil')],
        new Map(),
        [],
        []
      )
      expect(grades.every(g => !g.is_correct)).toBe(true)
    })

    it('handles mixed questions in one call', () => {
      const confirmed = new Map([['u1', 'Neymar']])
      const grades = computeBonusCorrectness(
        [
          answer('u1', 1, 'Brazil', 'neymar'),
          answer('u1', 2, 'Brazil'),
          answer('u1', 3, 'Brazil'),
        ],
        confirmed,
        events,
        matches
      )
      expect(grades).toHaveLength(3)
      expect(grades.every(g => g.user_id === 'u1')).toBe(true)
    })
  })
})
