'use client'

import { useState, useTransition, useRef } from 'react'
import { savePrediction } from '@/app/actions'
import { stageLabel, scoreColor } from '@/lib/scoring'
import { teamDisplay } from '@/lib/flags'
import type { Match, Prediction } from '@/lib/types'

interface Props {
  match: Match
  prediction: Prediction | undefined
  isLocked: boolean
}

export function MatchRow({ match, prediction, isLocked }: Props) {
  const homeName = teamDisplay(match.home_team, match.home_source ?? 'TBD')
  const awayName = teamDisplay(match.away_team, match.away_source ?? 'TBD')
  const isPlaceholder = !match.home_team

  const [homeVal, setHomeVal] = useState(prediction?.home_pred?.toString() ?? '')
  const [awayVal, setAwayVal] = useState(prediction?.away_pred?.toString() ?? '')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const lastSaved = useRef({ home: homeVal, away: awayVal })

  function handleSave() {
    const h = parseInt(homeVal)
    const a = parseInt(awayVal)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setMsg({ text: 'Enter valid scores (0+)', ok: false })
      return
    }
    startTransition(async () => {
      const res = await savePrediction(match.id, h, a)
      if (res.error) {
        setMsg({ text: res.error, ok: false })
      } else {
        lastSaved.current = { home: homeVal, away: awayVal }
        setMsg({ text: 'Saved!', ok: true })
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  const hasResult = match.home_score !== null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b last:border-0">
      {/* Match meta */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-gray-400 w-6 text-right shrink-0">#{match.id}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
          match.stage === 'group'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-purple-100 text-purple-700'
        }`}>
          {match.stage === 'group' ? `Grp ${match.group_name}` : stageLabel(match.stage)}
        </span>

        <span className={`text-sm font-medium truncate ${isPlaceholder ? 'text-gray-400 italic' : ''}`}>
          {homeName}
        </span>
        <span className="text-xs text-gray-400 shrink-0">vs</span>
        <span className={`text-sm font-medium truncate ${isPlaceholder ? 'text-gray-400 italic' : ''}`}>
          {awayName}
        </span>
      </div>

      {/* Venue */}
      <span className="text-xs text-gray-400 hidden lg:block shrink-0 max-w-36 truncate">{match.venue}</span>

      {/* Result (if entered) */}
      {hasResult && (
        <span className="text-sm font-bold text-gray-800 shrink-0 w-12 text-center">
          {match.home_score}–{match.away_score}
        </span>
      )}

      {/* Prediction section */}
      <div className="flex items-center gap-2 shrink-0">
        {isLocked ? (
          <div className="flex items-center gap-1.5">
            {prediction ? (
              <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
                hasResult ? scoreColor(prediction, match) : 'bg-gray-100 text-gray-700'
              }`}>
                {prediction.home_pred}–{prediction.away_pred}
              </span>
            ) : (
              <span className="text-xs text-gray-300 italic">no pick</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={99}
              value={homeVal}
              onChange={e => setHomeVal(e.target.value)}
              disabled={isPending}
              className="w-12 border rounded px-1.5 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
              placeholder="–"
            />
            <span className="text-gray-400 text-xs">–</span>
            <input
              type="number"
              min={0}
              max={99}
              value={awayVal}
              onChange={e => setAwayVal(e.target.value)}
              disabled={isPending}
              className="w-12 border rounded px-1.5 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
              placeholder="–"
            />
            <button
              onClick={handleSave}
              disabled={isPending}
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              {isPending ? '…' : 'Save'}
            </button>
          </div>
        )}
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

