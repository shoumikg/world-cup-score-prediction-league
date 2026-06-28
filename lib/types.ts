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
  status: 'live' | 'ft' | 'aet' | 'pen' | null
  live_minute: number | null
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
  isSelf: boolean
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
  confirmedAnswer?: string | null  // Q1 only: admin-mapped canonical player name
}

export interface BonusGrade {
  user_id: string
  question_id: number
  is_correct: boolean
  confirmed_answer: string | null
  graded_at: string
}

export interface FinalistPrediction {
  user_id: string
  team_a: string
  team_b: string
  updated_at: string
}

export interface MatchEvent {
  id: number
  match_id: number
  minute: number | null
  extra_time: number | null
  type: 'goal' | 'own_goal' | 'penalty'
  team: 'home' | 'away'
  player_name: string
  assist_name: string | null
}
