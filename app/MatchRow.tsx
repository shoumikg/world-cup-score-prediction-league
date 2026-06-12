'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { savePrediction } from '@/app/actions'
import { stageLabel, scoreColor } from '@/lib/scoring'
import { teamDisplay } from '@/lib/flags'
import { kickoffTimerDelay, predictionDeadlineUTC } from '@/lib/time'
import { teamFlag } from '@/lib/flags'
import type { Match, Prediction, PickEntry } from '@/lib/types'

interface Props {
  match: Match
  prediction: Prediction | undefined
  isLocked: boolean
  picks?: PickEntry[]
  totalPlayers?: number
}

export function MatchRow({ match, prediction, isLocked, picks, totalPlayers }: Props) {
  const homeName = teamDisplay(match.home_team, match.home_source ?? 'TBD')
  const awayName = teamDisplay(match.away_team, match.away_source ?? 'TBD')
  const isPlaceholder = !match.home_team

  const deadlineISO = predictionDeadlineUTC(match.kickoff_utc).toISOString()

  const [homeVal, setHomeVal] = useState(prediction?.home_pred?.toString() ?? '')
  const [awayVal, setAwayVal] = useState(prediction?.away_pred?.toString() ?? '')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const lastSaved = useRef({ home: homeVal, away: awayVal })

  // The server-rendered isLocked is frozen at page load; flip the row at the
  // 9 PM IST deadline even if the tab stays open. Client clock is a UX hint
  // only — the server action and RLS remain the authority.
  const [clientLocked, setClientLocked] = useState(false)
  useEffect(() => {
    if (isLocked) return
    const delay = kickoffTimerDelay(deadlineISO)
    if (delay === 'past') {
      setClientLocked(true)
      return
    }
    if (delay === null) return
    const t = setTimeout(() => setClientLocked(true), delay)
    return () => clearTimeout(t)
  }, [isLocked, deadlineISO])

  const locked = isLocked || clientLocked

  function handleSave() {
    if (kickoffTimerDelay(deadlineISO) === 'past') {
      setClientLocked(true)
      return
    }
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
        // Server says the match started (e.g. client clock is behind) — lock the row
        if (res.error.includes('locked')) setClientLocked(true)
      } else {
        lastSaved.current = { home: homeVal, away: awayVal }
        setMsg({ text: 'Saved!', ok: true })
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  const hasResult = match.home_score !== null

  // True when the current inputs are exactly what's stored in the DB
  const isRecorded =
    lastSaved.current.home !== '' &&
    homeVal === lastSaved.current.home &&
    awayVal === lastSaved.current.away

  // What the locked chip shows. Falls back to lastSaved for the window where
  // the client lock flipped but the revalidated prediction prop hasn't
  // arrived yet (saved after page load, locked at kickoff without reload).
  const displayPred: Prediction | undefined =
    prediction ??
    (lastSaved.current.home !== ''
      ? {
          user_id: '',
          match_id: match.id,
          home_pred: parseInt(lastSaved.current.home),
          away_pred: parseInt(lastSaved.current.away),
          updated_at: '',
        }
      : undefined)

  const predictedCount = picks?.filter(p => p.prediction !== null).length ?? 0

  return (
    <div className="py-3 border-b last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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

        {/* Score chip — appearance depends on match status */}
        {hasResult && match.status === 'live' && (
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-green-600 text-white rounded px-2 py-0.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
            <span className="text-[10px] font-semibold">LIVE</span>
            <span className="text-sm font-bold">{match.home_score}–{match.away_score}</span>
          </span>
        )}
        {hasResult && match.status !== 'live' && (
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-gray-800 text-white rounded px-2 py-0.5 shrink-0">
            <span className="text-[10px] font-medium text-gray-400">
              {match.status === 'aet' ? 'AET' : match.status === 'pen' ? 'PEN' : 'FT'}
            </span>
            <span className="text-sm font-bold">{match.home_score}–{match.away_score}</span>
          </span>
        )}

        {/* Prediction section */}
        <div className="flex items-center gap-2 shrink-0">
          {locked ? (
            <div className="flex items-center gap-1.5">
              {displayPred ? (
                <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
                  hasResult ? scoreColor(displayPred, match) : 'bg-gray-100 text-gray-700'
                }`}>
                  {displayPred.home_pred}–{displayPred.away_pred}
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
          {msg ? (
            <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </span>
          ) : (
            !locked && isRecorded && (
              <span className="text-xs text-green-600 whitespace-nowrap" title="Prediction recorded">
                ✓ Recorded
              </span>
            )
          )}
        </div>
      </div>

      {/* Popular pick split — visible after deadline */}
      {locked && picks && picks.length > 0 && (() => {
        const homeWins = picks.filter(p => p.prediction && p.prediction.homePred > p.prediction.awayPred).length
        const draws    = picks.filter(p => p.prediction && p.prediction.homePred === p.prediction.awayPred).length
        const awayWins = picks.filter(p => p.prediction && p.prediction.homePred < p.prediction.awayPred).length
        return (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {homeName} <span className="font-semibold ml-1">{homeWins}</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Draw <span className="font-semibold ml-1">{draws}</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {awayName} <span className="font-semibold ml-1">{awayWins}</span>
            </span>
          </div>
        )
      })()}

      {/* Everyone's picks — visible after deadline */}
      {locked && picks && (
        <details className="mt-2 pt-2 border-t">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            Everyone's picks ({predictedCount}{totalPlayers ? ` of ${totalPlayers}` : ''})
          </summary>
          <div className="mt-2 space-y-1.5 pb-1">
            {picks.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 min-w-0 flex-1 truncate">
                  {teamFlag(entry.favoriteTeam) && (
                    <span className="mr-1">{teamFlag(entry.favoriteTeam)}</span>
                  )}
                  {entry.displayName}
                </span>
                {entry.prediction !== null ? (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    hasResult
                      ? scoreColor(
                          {
                            user_id: '',
                            match_id: match.id,
                            home_pred: entry.prediction.homePred,
                            away_pred: entry.prediction.awayPred,
                            updated_at: '',
                          },
                          match
                        )
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {entry.prediction.homePred}–{entry.prediction.awayPred}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic shrink-0">no pick</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

