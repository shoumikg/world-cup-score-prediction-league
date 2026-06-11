export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'

export interface Match {
  id: number
  stage: Stage
  group_name: string | null
  kickoff_utc: string
  home_team: string | null
  away_team: string | null
  home_source: string | null
  away_source: string | null
  venue: string | null
  home_score: number | null
  away_score: number | null
}

export interface Prediction {
  user_id: string
  match_id: number
  home_pred: number
  away_pred: number
  updated_at: string
}

export interface Profile {
  id: string
  username: string
  display_name: string
  favorite_team: string | null
  is_admin: boolean
  created_at: string
}

export interface PickEntry {
  displayName: string
  favoriteTeam: string | null
  prediction: { homePred: number; awayPred: number } | null
}

export interface BonusAnswer {
  user_id: string
  question_id: number
  answer_text: string | null
  answer_team: string
  updated_at: string
}

export interface BonusPickEntry {
  displayName: string
  favoriteTeam: string | null
  answer: { text: string | null; team: string } | null
}

export interface BonusGrade {
  user_id: string
  question_id: number
  is_correct: boolean
  graded_at: string
}
