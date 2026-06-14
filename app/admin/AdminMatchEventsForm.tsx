'use client'

import { useState, useTransition } from 'react'
import { adminAddMatchEvent, adminDeleteMatchEvent } from '@/app/actions'
import { EVENT_TYPES, PLAYER_NAME_MAX, type EventType } from '@/lib/matchEvent'
import type { MatchEvent } from '@/lib/types'

interface Props {
  matchId: number
  homeLabel: string
  awayLabel: string
  events: MatchEvent[]
}

const TYPE_LABEL: Record<EventType, string> = {
  goal: 'Goal',
  penalty: 'Penalty',
  own_goal: 'Own goal',
}

function minuteText(e: MatchEvent): string {
  if (e.minute == null) return '–'
  return `${e.minute}${e.extra_time != null ? `+${e.extra_time}` : ''}'`
}

// Admin-only: add / remove goal scorers for a live or past match. Writes through
// the privileged adminAddMatchEvent / adminDeleteMatchEvent actions (RLS already
// restricts match_events writes to admins). Mirrors what the openfootball
// backfill produces, so manual entries display identically on the match page.
export function AdminMatchEventsForm({ matchId, homeLabel, awayLabel, events }: Props) {
  const [team, setTeam] = useState<'home' | 'away'>('home')
  const [type, setType] = useState<EventType>('goal')
  const [name, setName] = useState('')
  const [minute, setMinute] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    startTransition(async () => {
      const res = await adminAddMatchEvent(matchId, team, type, name, minute || null)
      if (res.error) {
        setMsg({ text: res.error, ok: false })
      } else {
        setName('')
        setMinute('')
        setMsg({ text: 'Added!', ok: true })
      }
    })
  }

  function handleDelete(eventId: number) {
    startTransition(async () => {
      const res = await adminDeleteMatchEvent(eventId, matchId)
      if (res.error) setMsg({ text: res.error, ok: false })
    })
  }

  const sorted = [...events].sort(
    (a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.extra_time ?? 0) - (b.extra_time ?? 0)
  )

  return (
    <details className="mt-2">
      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
        Goal scorers ({events.length})
      </summary>

      {/* Existing events */}
      {sorted.length > 0 && (
        <div className="mt-3 divide-y divide-gray-100">
          {sorted.map(e => (
            <div key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="text-xs text-gray-400 tabular-nums w-10 shrink-0">{minuteText(e)}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                {e.team === 'home' ? homeLabel : awayLabel}
              </span>
              <span className="text-sm text-gray-700 min-w-0 flex-1 truncate">
                {e.player_name}
                {e.type !== 'goal' && (
                  <span className="text-xs text-gray-400 ml-1">({TYPE_LABEL[e.type as EventType]})</span>
                )}
              </span>
              <button
                onClick={() => handleDelete(e.id)}
                disabled={isPending}
                className="text-xs text-red-500 hover:text-red-700 shrink-0 disabled:opacity-50"
                title="Remove goal"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add a goal */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={team}
          onChange={e => setTeam(e.target.value as 'home' | 'away')}
          disabled={isPending}
          className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 max-w-40"
        >
          <option value="home">{homeLabel}</option>
          <option value="away">{awayLabel}</option>
        </select>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={PLAYER_NAME_MAX}
          disabled={isPending}
          placeholder="Scorer name"
          className="border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 w-40"
        />
        <input
          type="text"
          value={minute}
          onChange={e => setMinute(e.target.value)}
          disabled={isPending}
          placeholder="67"
          className="border rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 w-16"
          title="Minute, e.g. 67 or 45+2"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value as EventType)}
          disabled={isPending}
          className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
        >
          {EVENT_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {isPending ? '…' : 'Add'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
        )}
      </div>
    </details>
  )
}
