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
  stage: Stage = 'group',
  kickoff = '2026-06-11T19:00:00Z'
): Match {
  return {
    id, stage, group_name: stage === 'group' ? 'A' : null,
    kickoff_utc: kickoff,
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

  // ── recentForm ───────────────────────────────────────────────

  it('recentForm is empty when player has no scored predictions', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [],
      [match(1, 2, 1)]
    )
    expect(rows[0].recentForm).toEqual([])
  })

  it('recentForm contains outcomes in chronological order', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'Alice')],
      [
        pred('u1', 1, 2, 1), // exact  — earlier
        pred('u1', 2, 0, 1), // wrong  — later
      ],
      [
        match(1, 2, 1, 'group', '2026-06-11T19:00:00Z'),
        match(2, 1, 0, 'group', '2026-06-12T19:00:00Z'),
      ]
    )
    expect(rows[0].recentForm).toEqual(['exact', 'wrong'])
  })

  it('recentForm is capped at 5 entries (most recent)', () => {
    const matches = [1,2,3,4,5,6].map(i =>
      match(i, 1, 0, 'group', `2026-06-${10+i}T19:00:00Z`)
    )
    const preds = [1,2,3,4,5,6].map(i => pred('u1', i, 1, 0)) // all exact
    const rows = computeLeaderboard([profile('u1', 'Alice')], preds, matches)
    expect(rows[0].recentForm).toHaveLength(5)
  })

  it('recentForm includes only the 5 most recent, not the oldest', () => {
    // 6 matches: first is wrong, last 5 are exact
    const matches = [1,2,3,4,5,6].map(i =>
      match(i, 1, 0, 'group', `2026-06-${10+i}T19:00:00Z`)
    )
    const preds = [
      pred('u1', 1, 0, 1), // wrong — oldest, should be excluded
      ...([2,3,4,5,6].map(i => pred('u1', i, 1, 0))), // exact
    ]
    const rows = computeLeaderboard([profile('u1', 'Alice')], preds, matches)
    expect(rows[0].recentForm).toEqual(['exact','exact','exact','exact','exact'])
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

  it('breaks total tie by bonus points before exact count', () => {
    // Alice: bonus 25, no match pts → total 25, 0 exact.
    // Bob: group exact (10) + final exact (15) → total 25, 2 exact, bonus 0.
    // Bonus outranks exact in the tie-break chain, so Alice wins.
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [pred('u2', 1, 2, 1), pred('u2', 2, 2, 1)],
      [match(1, 2, 1, 'group'), match(2, 2, 1, 'final')],
      [grade('u1', 1, true)]
    )
    expect(rows[0].displayName).toBe('Alice')
    expect(rows[0].total).toBe(rows[1].total) // both 25
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)              // bonus differs → separate ranks
  })

  // ── rank computation ──────────────────────────────────────────

  it('single player always gets rank 1', () => {
    const rows = computeLeaderboard([profile('u1', 'Alice')], [], [])
    expect(rows[0].rank).toBe(1)
  })

  it('no ties: sequential ranks 1-2-3', () => {
    // Alice exact (10pts), Bob correct_gd (5pts), Charlie correct (3pts)
    // pred(2,0) vs match(2,1): home wins both, GD 2 vs 1 → correct (not correct_gd)
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob'), profile('u3', 'Charlie')],
      [
        pred('u1', 1, 2, 1),  // Alice exact (2-1 = 2-1)
        pred('u2', 1, 3, 2),  // Bob correct_gd (pred GD=1, actual GD=1, home win)
        pred('u3', 1, 2, 0),  // Charlie correct (pred GD=2, actual GD=1, same winner)
      ],
      [match(1, 2, 1)]
    )
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3])
  })

  it('fully-identical stats share the same rank', () => {
    // Both players have no predictions: total=0, exact=0, correct_gd=0, correct=0, wrong=0
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [],
      [match(1, 2, 1)]
    )
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(1)
  })

  it('same total but different exact counts → different ranks', () => {
    // Alice: 1 exact (10 pts). Bob: 2 correct_gd (5+5=10 pts). Same total, Alice ranks higher.
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob')],
      [
        pred('u1', 1, 2, 1),                       // Alice exact  on m1
        pred('u2', 2, 3, 2), pred('u2', 3, 3, 2),  // Bob 2×correct_gd (pred 3-2, actual 4-3)
      ],
      [match(1, 2, 1), match(2, 4, 3), match(3, 4, 3)]
    )
    expect(rows[0].displayName).toBe('Alice')
    expect(rows[0].total).toBe(rows[1].total) // both 10 pts
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)              // different rank — exact counts differ
  })

  it('rank skips correctly after a tied group', () => {
    // Alice+Bob tied (rank 1), Charlie is rank 3 (not 2)
    const rows = computeLeaderboard(
      [profile('u1', 'Alice'), profile('u2', 'Bob'), profile('u3', 'Charlie')],
      [
        pred('u1', 1, 2, 1),  // Alice exact (10 pts)
        pred('u2', 1, 2, 1),  // Bob exact (10 pts) — identical to Alice
        pred('u3', 1, 1, 0),  // Charlie correct (3 pts)
      ],
      [match(1, 2, 1)]
    )
    const alice   = rows.find(r => r.displayName === 'Alice')!
    const bob     = rows.find(r => r.displayName === 'Bob')!
    const charlie = rows.find(r => r.displayName === 'Charlie')!
    expect(alice.rank).toBe(1)
    expect(bob.rank).toBe(1)
    expect(charlie.rank).toBe(3)  // skips rank 2
  })

  it('three-way tie all get rank 1, next player gets rank 4', () => {
    const rows = computeLeaderboard(
      [profile('u1', 'A'), profile('u2', 'B'), profile('u3', 'C'), profile('u4', 'D')],
      [
        pred('u1', 1, 2, 1), pred('u2', 1, 2, 1), pred('u3', 1, 2, 1), // A, B, C: exact (10 pts)
        pred('u4', 1, 1, 0),                                             // D: correct (3 pts)
      ],
      [match(1, 2, 1)]
    )
    expect(rows.find(r => r.displayName === 'A')!.rank).toBe(1)
    expect(rows.find(r => r.displayName === 'B')!.rank).toBe(1)
    expect(rows.find(r => r.displayName === 'C')!.rank).toBe(1)
    expect(rows.find(r => r.displayName === 'D')!.rank).toBe(4)
  })
})
