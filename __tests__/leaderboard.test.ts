import { describe, it, expect } from 'vitest'
import { computeLeaderboard } from '../lib/leaderboard'
import { scoreOutcome } from '../lib/scoring'
import { teamFlag } from '../lib/flags'
import type { Match, Prediction } from '../lib/types'

// ── Fixtures ─────────────────────────────────────────────────
function match(id: number, homeScore: number | null, awayScore: number | null): Match {
  return {
    id, stage: 'group', group_name: 'A',
    kickoff_utc: '2026-06-11T19:00:00Z',
    home_team: 'Home', away_team: 'Away',
    home_source: null, away_source: null,
    venue: null, home_score: homeScore, away_score: awayScore,
  }
}

function pred(userId: string, matchId: number, home: number, away: number): Prediction {
  return { user_id: userId, match_id: matchId, home_pred: home, away_pred: away, updated_at: '' }
}

function profile(id: string, name: string, team: string | null = null) {
  return { id, display_name: name, favorite_team: team }
}

// ── scoreOutcome ─────────────────────────────────────────────
describe('scoreOutcome', () => {
  it('returns null when the match has no result', () => {
    expect(scoreOutcome(pred('u', 1, 2, 1), match(1, null, null))).toBeNull()
  })

  it('returns exact for a perfect prediction', () => {
    expect(scoreOutcome(pred('u', 1, 2, 1), match(1, 2, 1))).toBe('exact')
  })

  it('returns correct for right winner with wrong score', () => {
    expect(scoreOutcome(pred('u', 1, 1, 0), match(1, 3, 1))).toBe('correct')
  })

  it('returns correct_gd for a draw predicted with different numbers (same GD=0)', () => {
    expect(scoreOutcome(pred('u', 1, 1, 1), match(1, 2, 2))).toBe('correct_gd')
  })

  it('returns correct_gd for correct winner with matching GD', () => {
    expect(scoreOutcome(pred('u', 1, 2, 1), match(1, 3, 2))).toBe('correct_gd')
  })

  it('returns correct for right winner with different GD', () => {
    expect(scoreOutcome(pred('u', 1, 1, 0), match(1, 3, 1))).toBe('correct')
  })

  it('returns wrong for same GD but opposite result direction', () => {
    expect(scoreOutcome(pred('u', 1, 2, 0), match(1, 0, 2))).toBe('wrong')
  })

  it('returns wrong when the result direction differs', () => {
    expect(scoreOutcome(pred('u', 1, 2, 0), match(1, 0, 1))).toBe('wrong')
  })
})

// ── teamFlag ─────────────────────────────────────────────────
describe('teamFlag', () => {
  it('returns the flag for a known team', () => {
    expect(teamFlag('Brazil')).toBe('🇧🇷')
  })

  it('returns null for null and unknown teams', () => {
    expect(teamFlag(null)).toBeNull()
    expect(teamFlag(undefined)).toBeNull()
    expect(teamFlag('Atlantis')).toBeNull()
  })
})

// ── computeLeaderboard ───────────────────────────────────────
describe('computeLeaderboard', () => {
  it('includes players with no predictions, with all zeros', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [match(1, 2, 1)]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      displayName: 'Alice', exact: 0, correct: 0, wrong: 0, scored: 0,
    })
  })

  it('tallies outcomes into the right categories', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [
        pred('u1', 1, 2, 1), // exact
        pred('u1', 2, 1, 0), // correct (actual 3-1, different GD)
        pred('u1', 3, 0, 2), // wrong (actual 1-0)
      ],
      [match(1, 2, 1), match(2, 3, 1), match(3, 1, 0)]
    )
    expect(rows[0]).toMatchObject({ exact: 1, correct_gd: 0, correct: 1, wrong: 1, scored: 3 })
  })

  it('tallies correct_gd outcome', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [
        pred('u1', 1, 2, 1), // exact (2-1 = 2-1)
        pred('u1', 2, 3, 2), // correct_gd (pred 3-2, actual 4-3: same GD=1, home win)
        pred('u1', 3, 1, 1), // correct_gd (pred 1-1, actual 2-2: draw, GD=0)
      ],
      [match(1, 2, 1), match(2, 4, 3), match(3, 2, 2)]
    )
    expect(rows[0]).toMatchObject({ exact: 1, correct_gd: 2, correct: 0, wrong: 0, scored: 3 })
  })

  it('ignores predictions for matches without results', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('u1', 1, 2, 1)],
      [match(1, null, null)]
    )
    expect(rows[0].scored).toBe(0)
  })

  it('does not count a missed prediction as wrong', () => {
    // Bob made no prediction for a scored match — his wrong count stays 0
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [pred('u1', 1, 0, 2)], // Alice got it wrong
      [match(1, 1, 0)]
    )
    const bob = rows.find(r => r.displayName === 'Bob')!
    expect(bob).toMatchObject({ wrong: 0, scored: 0 })
    const alice = rows.find(r => r.displayName === 'Alice')!
    expect(alice).toMatchObject({ wrong: 1, scored: 1 })
  })

  it('sorts by exact count first', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [
        pred('u2', 1, 2, 1),  // Bob exact
        pred('u1', 1, 1, 0),  // Alice correct only
      ],
      [match(1, 2, 1)]
    )
    expect(rows[0].displayName).toBe('Bob')
  })

  it('breaks exact ties by correct_gd count', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [
        pred('u1', 1, 2, 1), pred('u2', 1, 2, 1),  // both exact on match 1
        pred('u2', 2, 3, 2),                        // Bob correct_gd on match 2 (actual 4-3)
      ],
      [match(1, 2, 1), match(2, 4, 3)]
    )
    expect(rows[0].displayName).toBe('Bob')
  })

  it('breaks exact+correct_gd ties by correct count', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [
        pred('u1', 1, 2, 1), pred('u2', 1, 2, 1),  // both exact on match 1
        pred('u2', 2, 1, 0),                        // Bob also correct on match 2
      ],
      [match(1, 2, 1), match(2, 3, 0)]
    )
    expect(rows[0].displayName).toBe('Bob')
  })

  it('breaks exact+correct ties by fewest wrong', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [pred('u1', 1, 0, 1)], // Alice wrong; Bob didn't predict
      [match(1, 1, 0)]
    )
    expect(rows[0].displayName).toBe('Bob')
  })

  it('breaks full ties alphabetically by display name', () => {
    const rows = computeLeaderboard(
      [profile('u2', 'Zara'), profile('u1', 'Alice')],
      [],
      []
    )
    expect(rows.map(r => r.displayName)).toEqual(['Alice', 'Zara'])
  })

  it('ignores predictions from users without a profile row', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('ghost', 1, 2, 1)],
      [match(1, 2, 1)]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].scored).toBe(0)
  })
})
