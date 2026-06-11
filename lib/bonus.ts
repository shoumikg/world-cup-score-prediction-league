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

/** Every bonus question across all stages. Knockout questions (30 pts each, ids 4+)
 *  will be appended here when added — no schema or scoring changes needed. */
export const ALL_BONUS_QUESTIONS: readonly BonusQuestion[] = GROUP_BONUS_QUESTIONS

/** Points for a correct answer; 0 for unknown question ids (defensive). */
export function bonusPointsFor(questionId: number): number {
  return ALL_BONUS_QUESTIONS.find(q => q.id === questionId)?.points ?? 0
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateBonusGrade(
  questionId: unknown,
  isCorrect: unknown,
  targetUserId: unknown
): { questionId: number; isCorrect: boolean; targetUserId: string } | { error: string } {
  if (!Number.isInteger(questionId) || !ALL_BONUS_QUESTIONS.some(q => q.id === questionId))
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
