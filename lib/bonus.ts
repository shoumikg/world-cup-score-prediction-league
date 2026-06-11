import { TEAM_NAMES } from './flags'

export const BONUS_TEXT_MAX = 100

export type BonusQuestionType = 'player' | 'team'

export interface BonusQuestion {
  id: number
  text: string
  type: BonusQuestionType
}

export const GROUP_BONUS_QUESTIONS: readonly BonusQuestion[] = [
  { id: 1, text: 'Highest goal scorer of the Group Stage',                      type: 'player' },
  { id: 2, text: 'Team scoring the highest number of goals in the Group Stage', type: 'team'   },
  { id: 3, text: 'Team conceding the fewest goals in the Group Stage',          type: 'team'   },
]

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
