import { describe, it, expect } from 'vitest'
import { stageLabel, scoreColor } from '../lib/scoring'
import type { Match, Prediction } from '../lib/types'

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

  describe('exact score (green)', () => {
    it('awards green for a perfect score prediction', () => {
      expect(scoreColor(pred(2, 1), match(2, 1))).toContain('green')
    })

    it('awards green for an exact 0-0 draw', () => {
      expect(scoreColor(pred(0, 0), match(0, 0))).toContain('green')
    })
  })

  describe('correct result direction only (yellow)', () => {
    it('awards yellow for correct home win, wrong score', () => {
      expect(scoreColor(pred(1, 0), match(3, 1))).toContain('yellow')
    })

    it('awards yellow for correct away win, wrong score', () => {
      expect(scoreColor(pred(0, 2), match(0, 1))).toContain('yellow')
    })

    it('awards yellow for correct draw, wrong exact scores', () => {
      expect(scoreColor(pred(1, 1), match(2, 2))).toContain('yellow')
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
