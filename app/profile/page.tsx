import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">Your profile</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your display name is what other players see — on the leaderboard and anywhere
        picks are compared. Your username stays private to you.
      </p>
      <ProfileForm profile={profile as Profile} />
    </div>
  )
}
