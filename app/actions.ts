'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateFeedback } from '@/lib/feedback'
import { validateDisplayName, validateFavoriteTeam } from '@/lib/profile'
import { predictionDeadlineUTC } from '@/lib/time'
import { validateBonusAnswer, validateBonusGrade } from '@/lib/bonus'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// ── Auth ──────────────────────────────────────────────────────

export async function signup(formData: FormData): Promise<{ error?: string }> {
  const username = (formData.get('username') as string || '').toLowerCase().trim()
  const password = formData.get('password') as string
  const inviteCode = formData.get('invite_code') as string

  if (!USERNAME_RE.test(username))
    return { error: 'Username must be 3–20 characters: letters, numbers, underscores only.' }
  if (!password || password.length < 8)
    return { error: 'Password must be at least 8 characters.' }
  if (inviteCode !== process.env.LEAGUE_INVITE_CODE)
    return { error: 'Invalid invite code.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: `${username}@league.local`,
    password,
    options: { data: { username } },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered'))
      return { error: 'Username already taken.' }
    return { error: error.message }
  }

  redirect('/')
}

export async function login(formData: FormData): Promise<{ error?: string }> {
  const username = (formData.get('username') as string || '').toLowerCase().trim()
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: `${username}@league.local`,
    password,
  })

  if (error) return { error: 'Invalid username or password.' }
  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// ── Predictions ───────────────────────────────────────────────

export async function savePrediction(
  matchId: number,
  homePred: number,
  awayPred: number
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  // Server-side deadline check (defense in depth — RLS is the authority)
  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_utc')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Match not found.' }
  if (predictionDeadlineUTC(match.kickoff_utc) <= new Date())
    return { error: 'Predictions are locked — the deadline has passed.' }

  const { error } = await supabase.from('predictions').upsert(
    {
      user_id: user.id,
      match_id: matchId,
      home_pred: homePred,
      away_pred: awayPred,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,match_id' }
  )

  if (error) {
    if (error.code === '42501')
      return { error: 'Predictions are locked — the deadline has passed.' }
    return { error: 'Failed to save prediction. Please try again.' }
  }

  revalidatePath('/')
  return {}
}

// ── Profile ───────────────────────────────────────────────────

export async function updateProfile(
  displayName: string,
  favoriteTeam: string
): Promise<{ error?: string }> {
  const name = validateDisplayName(displayName)
  if ('error' in name) return { error: name.error }
  const team = validateFavoriteTeam(favoriteTeam)
  if ('error' in team) return { error: team.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.value, favorite_team: team.value })
    .eq('id', user.id)

  if (error) return { error: 'Failed to save profile. Please try again.' }
  revalidatePath('/profile')
  return {}
}

// ── Feedback ──────────────────────────────────────────────────

export async function submitFeedback(rawMessage: string): Promise<{ error?: string }> {
  const result = validateFeedback(rawMessage)
  if ('error' in result) return { error: result.error }

  const supabase = await createClient()

  // Username comes from the session, never from the client
  const { data: { user } } = await supabase.auth.getUser()
  let username = 'guest'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()
    username = profile?.username ?? 'guest'
  }

  const { error } = await supabase
    .from('feedback')
    .insert({ username, message: result.message })

  if (error) return { error: 'Failed to send feedback. Please try again.' }
  return {}
}

// ── Bonus questions ───────────────────────────────────────────

export async function saveBonusAnswer(
  questionId: number,
  rawText: string | null,
  rawTeam: string
): Promise<{ error?: string }> {
  const result = validateBonusAnswer(questionId, rawText, rawTeam)
  if ('error' in result) return { error: result.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  // Server-side deadline check (defense in depth — RLS is the authority)
  const { data: firstGroupMatches } = await supabase
    .from('matches')
    .select('kickoff_utc')
    .eq('stage', 'group')
    .order('kickoff_utc')
    .limit(1)

  const firstKickoff = (firstGroupMatches as { kickoff_utc: string }[] | null)?.[0]?.kickoff_utc
  if (!firstKickoff) return { error: 'No group matches found.' }
  if (predictionDeadlineUTC(firstKickoff) <= new Date())
    return { error: 'Bonus predictions are locked — the deadline has passed.' }

  const { error } = await supabase.from('bonus_answers').upsert(
    {
      user_id: user.id,
      question_id: questionId,
      answer_text: result.answer.text,
      answer_team: result.answer.team,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' }
  )

  if (error) {
    if (error.code === '42501')
      return { error: 'Bonus predictions are locked — the deadline has passed.' }
    return { error: 'Failed to save answer. Please try again.' }
  }

  revalidatePath('/bonus')
  return {}
}

// ── Admin ─────────────────────────────────────────────────────

export async function saveResult(
  matchId: number,
  homeScore: number,
  awayScore: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return { error: 'Unauthorized.' }

  const { error } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, status: 'ft', live_minute: null })
    .eq('id', matchId)

  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}

export async function saveKnockoutTeams(
  matchId: number,
  homeTeam: string,
  awayTeam: string,
  kickoffUtc?: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return { error: 'Unauthorized.' }

  const update: Record<string, string> = {
    home_team: homeTeam.trim(),
    away_team: awayTeam.trim(),
  }
  if (kickoffUtc) update.kickoff_utc = kickoffUtc

  const { error } = await supabase
    .from('matches')
    .update(update)
    .eq('id', matchId)

  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/admin')
  return {}
}

export async function saveBonusGrade(
  targetUserId: string,
  questionId: number,
  isCorrect: boolean
): Promise<{ error?: string }> {
  const validated = validateBonusGrade(questionId, isCorrect, targetUserId)
  if ('error' in validated) return { error: validated.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return { error: 'Unauthorized.' }

  const { error } = await supabase.from('bonus_grades').upsert(
    {
      user_id: validated.targetUserId,
      question_id: validated.questionId,
      is_correct: validated.isCorrect,
      graded_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' }
  )

  if (error) {
    if (error.code === '23503') return { error: 'That player has no answer for this question.' }
    if (error.code === '42501') return { error: 'Unauthorized.' }
    return { error: 'Failed to save grade. Please try again.' }
  }

  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  return {}
}
