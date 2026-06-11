import { describe, it, expect } from 'vitest'
import { computeLeaderboard } from '../lib/leaderboard'
import { scoreOutcome } from '../lib/scoring'
import { teamFlag } from '../lib/flags'
import type { Match, Prediction, Stage } from '../lib/types'

// ── Fixtures ─────────────────────────────────────────────────
function match(
  id: number,
  homeScore: number | null,
  awayScore: number | null,
  stage: Stage = 'group'
): Match {
  return {
    id, stage, group_name: stage === 'group' ? 'A' : null,
    kickoff_utc: '2026-06-11T19:00:00Z',
    home_team: 'Home', away_team: 'Away',
    home_source: null, away_source: null,
    venue: null, home_score: homeScore, away_score: awayScore,
  }
}

function grade(userId: string, questionId: number, isCorrect: boolean) {
  return { user_id: userId, question_id: questionId, is_correct: isCorrect }
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

  // ── match points ────────────────────────────────────────────

  it('accumulates match points from group outcomes', () => {
    // exact(10) + correct(3) = 13 pts
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('u1', 1, 2, 1), pred('u1', 2, 1, 0)],
      [match(1, 2, 1), match(2, 3, 1)]
    )
    expect(rows[0].points).toBe(13)
    expect(rows[0].bonusPoints).toBe(0)
    expect(rows[0].total).toBe(13)
  })

  it('uses knockout points for non-group stages', () => {
    // group exact = 10, final exact = 15
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('u1', 1, 2, 1), pred('u1', 2, 1, 0)],
      [match(1, 2, 1, 'group'), match(2, 1, 0, 'final')]
    )
    expect(rows[0].points).toBe(10 + 15)
  })

  it('third-place match uses knockout points', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('u1', 1, 2, 1)],
      [match(1, 2, 1, 'third')]
    )
    expect(rows[0].points).toBe(15)
  })

  // ── bonus points ────────────────────────────────────────────

  it('adds 25 bonusPoints for a correct Q1 grade', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      [grade('u1', 1, true)]
    )
    expect(rows[0].bonusPoints).toBe(25)
    expect(rows[0].total).toBe(25)
  })

  it('adds nothing for an incorrect grade', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      [grade('u1', 1, false)]
    )
    expect(rows[0].bonusPoints).toBe(0)
  })

  it('adds nothing when no grade row exists (ungraded)', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      []
    )
    expect(rows[0].bonusPoints).toBe(0)
  })

  it('omitting 4th arg gives bonusPoints 0 for everyone (backwards compat)', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [pred('u1', 1, 2, 1)],
      [match(1, 2, 1)]
    )
    expect(rows[0].bonusPoints).toBe(0)
    expect(rows[0].total).toBe(rows[0].points)
  })

  it('sums multiple correct bonus grades', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      [grade('u1', 1, true), grade('u1', 2, true), grade('u1', 3, false)]
    )
    expect(rows[0].bonusPoints).toBe(50) // 25+25
  })

  it('ignores bonus grade for a user without a profile row', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      [grade('ghost', 1, true)]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].bonusPoints).toBe(0)
  })

  it('grade with unknown questionId contributes 0 (bonusPointsFor defensive)', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [],
      [grade('u1', 99, true)]
    )
    expect(rows[0].bonusPoints).toBe(0)
  })

  // ── total-first sort ─────────────────────────────────────────

  it('ranks by total pts: bonus pts can outweigh match count advantage', () => {
    // Alice: 1 exact = 10 pts. Bob: 1 correct (3 pts, pred 2-0 vs actual 2-1 — same
    // direction but different GD) + Q1 correct (25 pts) = 28 pts.
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [pred('u1', 1, 2, 1), pred('u2', 1, 2, 0)],
      [match(1, 2, 1)],
      [grade('u2', 1, true)]
    )
    expect(rows[0].displayName).toBe('Bob')
    expect(rows[0].total).toBe(28)
  })

  it('breaks total tie by exact count', () => {
    // Alice: 2×correct_gd = 10 pts, 0 exact. Bob: 1×exact = 10 pts, 1 exact.
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [
        pred('u1', 1, 2, 1), pred('u1', 2, 3, 2), // Alice: 2 correct_gd (GD match)
        pred('u2', 3, 2, 1),                       // Bob: 1 exact
      ],
      [match(1, 3, 2), match(2, 4, 3), match(3, 2, 1)]
    )
    expect(rows[0].displayName).toBe('Bob')
    expect(rows[0].total).toBe(rows[1].total) // same total
    expect(rows[0].exact).toBe(1)
  })
})
