import { describe, it, expect } from 'vitest'
import { stageLabel, scoreColor, matchPoints, MATCH_POINTS, scoreOutcome, scoringScore, displayScore } from '../lib/scoring'
import type { Match, Prediction, Stage } from '../lib/types'

// ── Fixtures ─────────────────────────────────────────────────
function match(home_score: number | null, away_score: number | null): Match {
  return {
    id: 1, stage: 'group', group_name: 'A',
    kickoff_utc: '2026-06-11T19:00:00Z',
    home_team: 'Home', away_team: 'Away',
    home_source: null, away_source: null,
    venue: 'Venue', home_score, away_score,
  }
}

function pred(home_pred: number, away_pred: number): Prediction {
  return { user_id: 'u', match_id: 1, home_pred, away_pred, updated_at: '' }
}

// ── matchPoints ───────────────────────────────────────────────
describe('matchPoints', () => {
  it.each([
    ['exact',      10],
    ['correct_gd',  5],
    ['correct',     3],
    ['wrong',       0],
  ] as const)('group stage %s → %d pts', (outcome, pts) => {
    expect(matchPoints(outcome, 'group')).toBe(pts)
  })

  const knockoutStages: Stage[] = ['r32', 'r16', 'qf', 'sf', 'third', 'final']
  it.each(knockoutStages)('stage %s is treated as knockout', stage => {
    expect(matchPoints('exact',      stage)).toBe(15)
    expect(matchPoints('correct_gd', stage)).toBe(8)
    expect(matchPoints('correct',    stage)).toBe(5)
    expect(matchPoints('wrong',      stage)).toBe(0)
  })

  it('MATCH_POINTS record is exhaustive over all outcomes', () => {
    for (const tier of ['group', 'knockout'] as const) {
      expect(Object.keys(MATCH_POINTS[tier]).sort())
        .toEqual(['correct', 'correct_gd', 'exact', 'wrong'])
    }
  })
})

// ── stageLabel ────────────────────────────────────────────────
describe('stageLabel', () => {
  it.each([
    ['r32', 'R32'],
    ['r16', 'R16'],
    ['qf',  'QF'],
    ['sf',  'SF'],
    ['third', '3rd'],
    ['final', 'Final'],
  ])('maps %s → %s', (stage, label) => {
    expect(stageLabel(stage)).toBe(label)
  })

  it('uppercases unknown stages as fallback', () => {
    expect(stageLabel('extra')).toBe('EXTRA')
  })
})

// ── scoreColor ────────────────────────────────────────────────
describe('scoreColor', () => {
  it('returns gray when no result yet', () => {
    expect(scoreColor(pred(2, 1), match(null, null))).toContain('gray')
  })

  describe('exact score (dark green)', () => {
    it('awards dark green for a perfect score prediction', () => {
      expect(scoreColor(pred(2, 1), match(2, 1))).toContain('bg-green-700')
    })

    it('awards dark green for an exact 0-0 draw', () => {
      expect(scoreColor(pred(0, 0), match(0, 0))).toContain('bg-green-700')
    })
  })

  describe('correct goal difference (light green)', () => {
    it('awards light green for correct home win with same GD, wrong exact scores', () => {
      expect(scoreColor(pred(2, 1), match(3, 2))).toContain('bg-green-100')
    })

    it('awards light green for correct away win with same GD', () => {
      expect(scoreColor(pred(0, 2), match(1, 3))).toContain('bg-green-100')
    })

    it('awards light green for correct draw prediction with different scoreline', () => {
      expect(scoreColor(pred(1, 1), match(2, 2))).toContain('bg-green-100')
    })
  })

  describe('correct result direction only (yellow)', () => {
    it('awards yellow for correct home win, wrong score and different GD', () => {
      expect(scoreColor(pred(1, 0), match(3, 1))).toContain('yellow')
    })

    it('awards yellow for correct away win, wrong score and different GD', () => {
      expect(scoreColor(pred(0, 2), match(0, 1))).toContain('yellow')
    })
  })

  describe('wrong result (red)', () => {
    it('awards red when predicted home win but actual away win', () => {
      expect(scoreColor(pred(2, 0), match(0, 1))).toContain('red')
    })

    it('awards red when predicted away win but actual home win', () => {
      expect(scoreColor(pred(0, 1), match(2, 0))).toContain('red')
    })

    it('awards red when predicted draw but actual home win', () => {
      expect(scoreColor(pred(1, 1), match(2, 0))).toContain('red')
    })

    it('awards red when predicted home win but actual draw', () => {
      expect(scoreColor(pred(2, 0), match(1, 1))).toContain('red')
    })
  })
})

// ── 90-minute (regulation) scoring for knockouts ──────────────
function ko(opts: {
  stage?: Stage
  home?: number | null; away?: number | null
  regHome?: number | null; regAway?: number | null
  status?: Match['status']; minute?: number | null
}): Match {
  return {
    id: 2, stage: opts.stage ?? 'r16', group_name: null,
    kickoff_utc: '2026-07-04T17:00:00Z', home_team: 'H', away_team: 'A',
    home_source: null, away_source: null, venue: null,
    home_score: opts.home ?? null, away_score: opts.away ?? null,
    reg_home_score: opts.regHome ?? null, reg_away_score: opts.regAway ?? null,
    status: opts.status ?? null, live_minute: opts.minute ?? null,
  }
}

describe('knockout grading on the 90-minute score', () => {
  it('grades on the regulation score, not the extra-time result', () => {
    // 1–1 at 90', 3–1 after extra time.
    const m = ko({ home: 3, away: 1, regHome: 1, regAway: 1, status: 'aet' })
    expect(scoreOutcome(pred(1, 1), m)).toBe('exact')   // matched the 90' score
    expect(scoreOutcome(pred(3, 1), m)).toBe('wrong')   // matched ET, not 90' (a draw)
  })

  it('grades a penalty match on the level 90-minute score', () => {
    const m = ko({ home: 0, away: 0, regHome: 0, regAway: 0, status: 'pen' })
    expect(scoreOutcome(pred(0, 0), m)).toBe('exact')
  })

  it('is unscored until the 90-minute score is recorded (finished in ET)', () => {
    const m = ko({ home: 2, away: 1, regHome: null, regAway: null, status: 'aet' })
    expect(scoringScore(m)).toBeNull()
    expect(scoreOutcome(pred(2, 1), m)).toBeNull()
  })

  it('uses the running score for live provisional points during regular time', () => {
    const m = ko({ home: 1, away: 0, status: 'live', minute: 70 })
    expect(scoreOutcome(pred(1, 0), m)).toBe('exact')
  })

  it('stops trusting the running score once in extra time (minute > 90)', () => {
    const m = ko({ home: 2, away: 1, status: 'live', minute: 105 })
    expect(scoringScore(m)).toBeNull()
  })

  it('a regulation knockout grades on its (equal) regulation and full score', () => {
    const m = ko({ home: 2, away: 1, regHome: 2, regAway: 1, status: 'ft' })
    expect(scoreOutcome(pred(2, 1), m)).toBe('exact')
  })
})

describe('displayScore', () => {
  it('shows the 90-minute score for a settled extra-time knockout', () => {
    const m = ko({ home: 3, away: 1, regHome: 1, regAway: 1, status: 'aet' })
    expect(displayScore(m)).toEqual({ home: 1, away: 1 })
  })

  it('shows the running score for a live knockout', () => {
    const m = ko({ home: 2, away: 2, regHome: null, regAway: null, status: 'live', minute: 100 })
    expect(displayScore(m)).toEqual({ home: 2, away: 2 })
  })

  it('shows the actual score for a group match', () => {
    expect(displayScore(match(3, 2))).toEqual({ home: 3, away: 2 })
  })
})
