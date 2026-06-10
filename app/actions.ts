'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  // Server-side kickoff check (defense in depth — RLS is the authority)
  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_utc')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Match not found.' }
  if (new Date(match.kickoff_utc) <= new Date())
    return { error: 'Match has already started — predictions are locked.' }

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
    if (error.message.includes('predictions_before_kickoff') || error.code === '42501')
      return { error: 'Match has already started — predictions are locked.' }
    return { error: 'Failed to save prediction. Please try again.' }
  }

  revalidatePath('/')
  return {}
}

// ── Admin ─────────────────────────────────────────────────────

export async function saveResult(
  matchId: number,
  homeScore: number,
  awayScore: number
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .single()

  if (!profile?.is_admin) return { error: 'Unauthorized.' }

  const { error } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore })
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
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
