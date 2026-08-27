'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  addAuctionPlayer, deleteAuctionPlayer, setAuctionCaptain, setAuctionPurse, resetAuction,
} from '@/app/auction/actions'
import { TEAM_LABELS, type AuctionPlayer, type AuctionTeamRow } from '@/lib/auction'

interface ProfileOption {
  id: string
  display_name: string
}

interface Props {
  players: AuctionPlayer[]
  teams: AuctionTeamRow[]
  profiles: ProfileOption[]
}

export function AdminAuctionSetup({ players, teams, profiles }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [purse, setPurse] = useState(teams[0]?.purse.toString() ?? '1000')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const started = players.some(p => p.status !== 'pending')

  function run(action: () => Promise<{ error?: string }>, okText = 'Saved!') {
    startTransition(async () => {
      const res = await action()
      setMsg(res.error ? { text: res.error, ok: false } : { text: okText, ok: true })
      router.refresh()
    })
  }

  function handleAdd() {
    const value = name.trim()
    if (!value) return
    setName('')
    run(() => addAuctionPlayer(value), 'Added!')
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Anyone can watch at <Link href="/auction" className="text-green-600 hover:underline">/auction</Link> —
        no login needed. Captains bid from their own accounts on that page; you run the block from there too.
      </p>

      {/* Captains + purse */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        {teams
          .slice()
          .sort(a => (a.team === 'red' ? -1 : 1))
          .map(t => (
            <div key={t.team} className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold w-20 ${t.team === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                Team {TEAM_LABELS[t.team]}
              </span>
              <select
                value={t.captain_user_id ?? ''}
                onChange={e => e.target.value && run(() => setAuctionCaptain(t.team, e.target.value), 'Captain set!')}
                disabled={isPending}
                className="border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Pick captain…</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>
          ))}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
          <span className="text-xs font-semibold text-gray-500 w-20">Purse</span>
          <input
            type="number" min={0} max={1000000} value={purse}
            onChange={e => setPurse(e.target.value)}
            disabled={isPending}
            className="w-24 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button
            onClick={() => run(() => setAuctionPurse(parseInt(purse)), 'Purse set!')}
            disabled={isPending}
            className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
          >
            Set purse (both teams)
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text" value={name} placeholder="Player name"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            disabled={isPending}
            className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !name.trim()}
            className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
          >
            Add player
          </button>
        </div>
        {players.length === 0 ? (
          <p className="text-xs text-gray-400">No players yet — add everyone going up for auction.</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              {players.length} player{players.length !== 1 ? 's' : ''} · squads of {Math.ceil(players.length / 2)}
            </p>
            <ul className="divide-y">
              {players.map(p => (
                <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.status !== 'pending' ? (
                    <span className="text-xs text-gray-400">{p.status.replace('_', ' ')}</span>
                  ) : (
                    <button
                      onClick={() => run(() => deleteAuctionPlayer(p.id), 'Removed.')}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {started && (
          <button
            onClick={() => {
              if (confirm('Reset the whole auction? All sales and bids are cleared; the player list and captains stay.')) {
                run(() => resetAuction(), 'Auction reset.')
              }
            }}
            disabled={isPending}
            className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Reset auction
          </button>
        )}
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  )
}
