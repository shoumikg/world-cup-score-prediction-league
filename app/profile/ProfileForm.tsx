'use client'

import { useState, useTransition } from 'react'
import { updateProfile } from '@/app/actions'
import { TEAM_NAMES, teamDisplay } from '@/lib/flags'
import { DISPLAY_NAME_MAX } from '@/lib/profile'
import type { Profile } from '@/lib/types'

export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [favoriteTeam, setFavoriteTeam] = useState(profile.favorite_team ?? '')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await updateProfile(displayName, favoriteTeam)
      if (res.error) {
        setMsg({ text: res.error, ok: false })
      } else {
        setMsg({ text: 'Profile saved!', ok: true })
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
        <p className="text-sm text-gray-800">{profile.username}</p>
        <p className="text-xs text-gray-400 mt-0.5">Used only for logging in. Cannot be changed.</p>
      </div>

      <div>
        <label htmlFor="display_name" className="block text-xs font-medium text-gray-500 mb-1">
          Display name
        </label>
        <input
          id="display_name"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          disabled={isPending}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-400 mt-0.5">{displayName.length}/{DISPLAY_NAME_MAX}</p>
      </div>

      <div>
        <label htmlFor="favorite_team" className="block text-xs font-medium text-gray-500 mb-1">
          Favourite team <span className="font-normal">(optional)</span>
        </label>
        <select
          id="favorite_team"
          value={favoriteTeam}
          onChange={e => setFavoriteTeam(e.target.value)}
          disabled={isPending}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        >
          <option value="">— None —</option>
          {TEAM_NAMES.map(t => (
            <option key={t} value={t}>{teamDisplay(t, t)}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">Shown as a flag next to your name.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save profile'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
