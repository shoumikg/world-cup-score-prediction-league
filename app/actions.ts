'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateFeedback } from '@/lib/feedback'
import { validateDisplayName, validateFavoriteTeam } from '@/lib/profile'
import { predictionDeadlineUTC, istDateKey } from '@/lib/time'
import { getAdminClient } from '@/lib/supabase/admin'
import { validateBonusAnswer } from '@/lib/bonus'
import { validateMatchEvent } from '@/lib/matchEvent'
import { LATEST_CHANGELOG_ID } from '@/lib/changelog'

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

  const now = new Date()
  const deadline = predictionDeadlineUTC(match.kickoff_utc)

  if (deadline <= now) {
    // Deadline passed — check if the user has grace active for this day
    const dayKey = istDateKey(match.kickoff_utc)
    const { data: profile } = await supabase.from('profiles').select('grace_day').eq('id', user.id).single()

    if (profile?.grace_day !== dayKey)
      return { error: 'Predictions are locked — the deadline has passed.' }

    // Grace active — validate the first kickoff of the day hasn't passed yet
    const { data: dayMatchesRaw } = await supabase.from('matches').select('kickoff_utc')
    const firstKickoff = (dayMatchesRaw ?? [])
      .filter((m: { kickoff_utc: string }) => istDateKey(m.kickoff_utc) === dayKey)
      .reduce((min: number, m: { kickoff_utc: string }) => Math.min(min, new Date(m.kickoff_utc).getTime()), Infinity)

    if (Date.now() >= firstKickoff)
      return { error: 'Grace period ended — the first match has kicked off.' }

    // Use service-role client to bypass the deadline RLS policy
    const admin = getAdminClient()

    // Grace is only for MISSED predictions — block if one already exists
    const { data: existingPred } = await admin
      .from('predictions')
      .select('match_id')
      .eq('user_id', user.id)
      .eq('match_id', matchId)
      .maybeSingle()
    if (existingPred) return { error: 'You already predicted this match — grace is for missed predictions only.' }

    const { error: saveErr } = await admin.from('predictions').insert(
      { user_id: user.id, match_id: matchId, home_pred: homePred, away_pred: awayPred, updated_at: now.toISOString() }
    )
    if (saveErr) return { error: 'Failed to save prediction. Please try again.' }
    revalidatePath('/')
    revalidatePath(`/match/${matchId}`)
    return {}
  }

  const { error } = await supabase.from('predictions').upsert(
    {
      user_id: user.id,
      match_id: matchId,
      home_pred: homePred,
      away_pred: awayPred,
      updated_at: now.toISOString(),
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

export async function invokeGrace(matchId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { data: match } = await supabase.from('matches').select('kickoff_utc').eq('id', matchId).single()
  if (!match) return { error: 'Match not found.' }

  const { data: profile } = await supabase.from('profiles').select('grace_day').eq('id', user.id).single()
  if (profile?.grace_day) return { error: 'Grace has already been used.' }

  const deadline = predictionDeadlineUTC(match.kickoff_utc)
  if (deadline > new Date()) return { error: "Deadline hasn't passed — no need for grace." }

  const dayKey = istDateKey(match.kickoff_utc)
  const { data: dayMatchesRaw } = await supabase.from('matches').select('id, kickoff_utc')
  const dayMatches = (dayMatchesRaw ?? [])
    .filter((m: { id: number; kickoff_utc: string }) => istDateKey(m.kickoff_utc) === dayKey)
  const firstKickoff = dayMatches
    .reduce((min: number, m: { kickoff_utc: string }) => Math.min(min, new Date(m.kickoff_utc).getTime()), Infinity)

  if (Date.now() >= firstKickoff)
    return { error: 'Grace window has closed — the first match has already kicked off.' }

  // Ensure at least one match on this day has no prediction (grace is for missed picks only)
  const dayMatchIds = dayMatches.map((m: { id: number }) => m.id)
  if (dayMatchIds.length > 0) {
    const { data: existingPreds } = await supabase
      .from('predictions')
      .select('match_id')
      .eq('user_id', user.id)
      .in('match_id', dayMatchIds)
    if ((existingPreds?.length ?? 0) >= dayMatchIds.length)
      return { error: 'You already have predictions for all matches today — grace is not needed.' }
  }

  const { error } = await supabase.from('profiles').update({ grace_day: dayKey }).eq('id', user.id)
  if (error) return { error: 'Failed to activate grace. Please try again.' }

  revalidatePath('/')
  revalidatePath('/me')
  revalidatePath(`/match/${matchId}`)
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

// ── What's New ────────────────────────────────────────────────

export async function markWhatsNewSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('whats_new_reads').upsert(
    { user_id: user.id, seen_id: LATEST_CHANGELOG_ID, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  revalidatePath('/', 'layout')
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

// ── Match events (goal scorers) ───────────────────────────────────────────────

// Admin-only: add a goal-scorer event for a live or past match. Mirrors what the
// openfootball backfill writes (lib/openfootball.ts), so manual entries fill the
// gap until the public dataset publishes a match. RLS already restricts
// match_events writes to admins (migration 0012); the explicit check below is
// defense in depth, matching saveResult/saveKnockoutTeams.
//
// Note: the daily backfill is delete-then-insert per matched fixture, so once
// openfootball publishes this match it will replace these manual rows with the
// authoritative data. Matches openfootball hasn't published yet keep their
// manual events untouched.
export async function adminAddMatchEvent(
  matchId: number,
  team: string,
  type: string,
  rawPlayerName: string,
  rawMinute: string | null
): Promise<{ error?: string }> {
  if (!Number.isInteger(matchId)) return { error: 'Invalid match.' }

  const validated = validateMatchEvent(team, type, rawPlayerName, rawMinute)
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

  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Match not found.' }

  const { error } = await supabase.from('match_events').insert({
    match_id: matchId,
    team: validated.value.team,
    type: validated.value.type,
    player_name: validated.value.playerName,
    minute: validated.value.minute,
    extra_time: validated.value.extraTime,
    assist_name: null,
  })

  if (error) {
    if (error.code === '42501') return { error: 'Unauthorized.' }
    return { error: 'Failed to add goal. Please try again.' }
  }

  revalidatePath('/admin')
  revalidatePath(`/match/${matchId}`)
  revalidatePath('/bonus')
  revalidatePath('/leaderboard')
  return {}
}

// Admin-only: remove a goal-scorer event (to fix a typo or a wrong entry).
// matchId is passed only so the match detail page can be revalidated.
export async function adminDeleteMatchEvent(
  eventId: number,
  matchId: number
): Promise<{ error?: string }> {
  if (!Number.isInteger(eventId)) return { error: 'Invalid event.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return { error: 'Unauthorized.' }

  const { error } = await supabase.from('match_events').delete().eq('id', eventId)

  if (error) {
    if (error.code === '42501') return { error: 'Unauthorized.' }
    return { error: 'Failed to remove goal. Please try again.' }
  }

  revalidatePath('/admin')
  if (Number.isInteger(matchId)) revalidatePath(`/match/${matchId}`)
  revalidatePath('/bonus')
  revalidatePath('/leaderboard')
  return {}
}
