import { TEAM_NAMES } from './flags'

export const BONUS_TEXT_MAX = 100

export type BonusQuestionType = 'player' | 'team'

export interface BonusQuestion {
  id: number
  text: string
  type: BonusQuestionType
  points: number
}

export const GROUP_BONUS_QUESTIONS: readonly BonusQuestion[] = [
  { id: 1, text: 'Highest goal scorer of the Group Stage',                      type: 'player', points: 25 },
  { id: 2, text: 'Team scoring the highest number of goals in the Group Stage', type: 'team',   points: 25 },
  { id: 3, text: 'Team conceding the fewest goals in the Group Stage',          type: 'team',   points: 25 },
]

// Knockout finalists bonus: two picks, 25 pts each (50/25/0). These ids are not
// stored in bonus_answers — they live in finalist_predictions and are converted
// to grades for scoring (lib/finalist.ts). Listed here so bonusPointsFor knows
// their value. The group bonus UI iterates GROUP_BONUS_QUESTIONS, so it is
// unaffected.
export const FINALIST_QUESTION_IDS = [4, 5] as const

export const KNOCKOUT_BONUS_QUESTIONS: readonly BonusQuestion[] = [
  { id: 4, text: 'Finalist 1', type: 'team', points: 25 },
  { id: 5, text: 'Finalist 2', type: 'team', points: 25 },
]

/** Every bonus question across all stages. */
export const ALL_BONUS_QUESTIONS: readonly BonusQuestion[] = [
  ...GROUP_BONUS_QUESTIONS,
  ...KNOCKOUT_BONUS_QUESTIONS,
]

/** Points for a correct answer; 0 for unknown question ids (defensive). */
export function bonusPointsFor(questionId: number): number {
  return ALL_BONUS_QUESTIONS.find(q => q.id === questionId)?.points ?? 0
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Manual admin grading applies only to the group-stage questions; the knockout
// finalists bonus is graded automatically from the final, never via this path.
export function validateBonusGrade(
  questionId: unknown,
  isCorrect: unknown,
  targetUserId: unknown
): { questionId: number; isCorrect: boolean; targetUserId: string } | { error: string } {
  if (!Number.isInteger(questionId) || !GROUP_BONUS_QUESTIONS.some(q => q.id === questionId))
    return { error: 'Invalid question.' }
  if (typeof isCorrect !== 'boolean')
    return { error: 'Invalid grade.' }
  if (typeof targetUserId !== 'string' || !UUID_RE.test(targetUserId))
    return { error: 'Invalid user.' }
  return { questionId: questionId as number, isCorrect, targetUserId }
}

export function validateBonusAnswer(
  questionId: number,
  rawText: string | null | undefined,
  rawTeam: string | null | undefined
): { answer: { text: string | null; team: string } } | { error: string } {
  if (!Number.isInteger(questionId) || questionId < 1 || questionId > 3)
    return { error: 'Invalid question.' }

  const team = (rawTeam ?? '').trim()
  if (!team) return { error: 'Please select a team.' }
  if (!(TEAM_NAMES as readonly string[]).includes(team))
    return { error: 'Invalid team selection.' }

  if (questionId === 1) {
    const text = (rawText ?? '').trim()
    if (!text) return { error: 'Please enter a player name.' }
    if (text.length > BONUS_TEXT_MAX)
      return { error: `Player name must be ${BONUS_TEXT_MAX} characters or fewer.` }
    return { answer: { text, team } }
  }

  return { answer: { text: null, team } }
}
