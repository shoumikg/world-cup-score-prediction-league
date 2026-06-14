'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { savePrediction, invokeGrace } from '@/app/actions'
import { stageLabel, scoreColor } from '@/lib/scoring'
import { teamDisplay } from '@/lib/flags'
import { kickoffTimerDelay, predictionDeadlineUTC } from '@/lib/time'
import type { Match, Prediction, PickEntry } from '@/lib/types'

interface Props {
  match: Match
  prediction: Prediction | undefined
  isLocked: boolean
  picks?: PickEntry[]
  /** 'available' = grace can be invoked; 'active' = grace invoked, predictions open until graceUntil */
  graceState?: 'available' | 'active'
  /** ISO timestamp of first kickoff of the day — used as lock time when grace is active */
  graceUntil?: string
}

export function MatchRow({ match, prediction, isLocked, picks, graceState, graceUntil }: Props) {
  const homeName = teamDisplay(match.home_team, match.home_source ?? 'TBD')
  const awayName = teamDisplay(match.away_team, match.away_source ?? 'TBD')

  const deadlineISO = predictionDeadlineUTC(match.kickoff_utc).toISOString()
  // When grace is active, lock at the first kickoff of the day rather than at the deadline
  const lockISO = graceState === 'active' && graceUntil ? graceUntil : deadlineISO

  const [homeVal, setHomeVal] = useState(prediction?.home_pred ?? 0)
  const [awayVal, setAwayVal] = useState(prediction?.away_pred ?? 0)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [graceIsPending, startGraceTransition] = useTransition()
  const [graceMsg, setGraceMsg] = useState<string | null>(null)
  const lastSaved = useRef<{ home: number | null; away: number | null }>({
    home: prediction?.home_pred ?? null,
    away: prediction?.away_pred ?? null,
  })

  // The server-rendered isLocked is frozen at page load; flip the row at the
  // lock time (deadline normally; first kickoff when grace is active) even if
  // the tab stays open. Client clock is a UX hint only.
  const [clientLocked, setClientLocked] = useState(false)
  useEffect(() => {
    if (isLocked) return
    const delay = kickoffTimerDelay(lockISO)
    if (delay === 'past') {
      setClientLocked(true)
      return
    }
    if (delay === null) return
    const t = setTimeout(() => setClientLocked(true), delay)
    return () => clearTimeout(t)
  }, [isLocked, lockISO])

  const locked = isLocked || clientLocked

  function handleInvokeGrace() {
    setGraceMsg(null)
    startGraceTransition(async () => {
      const res = await invokeGrace(match.id)
      if (res.error) setGraceMsg(res.error)
    })
  }

  function handleSave() {
    if (kickoffTimerDelay(lockISO) === 'past') {
      setClientLocked(true)
      return
    }
    startTransition(async () => {
      const res = await savePrediction(match.id, homeVal, awayVal)
      if (res.error) {
        setMsg({ text: res.error, ok: false })
        // Server says the match started (e.g. client clock is behind) — lock the row
        if (res.error.includes('locked') || res.error.includes('Grace period ended') || res.error.includes('kicked off')) setClientLocked(true)
      } else {
        lastSaved.current = { home: homeVal, away: awayVal }
        setMsg({ text: 'Saved!', ok: true })
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  const hasResult = match.home_score !== null

  // True when the current ticker values match what's stored in the DB
  const isRecorded =
    lastSaved.current.home !== null &&
    homeVal === lastSaved.current.home &&
    awayVal === lastSaved.current.away

  // What the locked chip shows. Falls back to lastSaved for the window where
  // the client lock flipped but the revalidated prediction prop hasn't
  // arrived yet (saved after page load, locked at kickoff without reload).
  const displayPred: Prediction | undefined =
    prediction ??
    (lastSaved.current.home !== null
      ? {
          user_id: '',
          match_id: match.id,
          home_pred: lastSaved.current.home,
          away_pred: lastSaved.current.away!,
          updated_at: '',
        }
      : undefined)

  // Score chip — appearance depends on match status. Rendered in two spots:
  // beside the stage badge on mobile, between venue and prediction on sm+.
  const scoreChip = !hasResult ? null : match.status === 'live' ? (
    <span className="inline-flex items-center gap-1.5 bg-green-600 text-white rounded px-2 py-0.5 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
      <span className="text-[10px] font-semibold">
        {match.live_minute != null ? `${match.live_minute}'` : 'LIVE'}
      </span>
      <span className="text-sm font-bold">{match.home_score}–{match.away_score}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-gray-800 text-white rounded px-2 py-0.5 shrink-0">
      <span className="text-[10px] font-medium text-gray-400">
        {match.status === 'aet' ? 'AET' : match.status === 'pen' ? 'PEN' : 'FT'}
      </span>
      <span className="text-sm font-bold">{match.home_score}–{match.away_score}</span>
    </span>
  )

  return (
    <div className="py-3 border-b last:border-0 relative isolate group">
      {/* Invisible full-row link — team names and interactive controls sit above it via z-10 */}
      <a href={`/match/${match.id}`} className="absolute inset-0" aria-label={`Match ${match.id} detail`} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Match meta + teams: stacked on mobile, inline on sm+ */}
        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-6 text-right shrink-0">#{match.id}</span>
            {match.stage === 'group' && match.group_name ? (
              <a href={`/groups/${match.group_name}`}
                className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0 bg-blue-100 text-blue-700 hover:bg-blue-200 relative z-10">
                Group {match.group_name}
              </a>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0 bg-purple-100 text-purple-700">
                {stageLabel(match.stage)}
              </span>
            )}
            {/* Mobile: score chip rides the meta line, pushed right */}
            <span className="ml-auto sm:hidden">{scoreChip}</span>
          </div>

          {/* Team names — individually linked to filtered schedule, above the row overlay */}
          <span className="text-sm font-medium sm:min-w-0 relative z-10">
            {match.home_team ? (
              <a href={`/?team=${encodeURIComponent(match.home_team)}`} className="hover:underline">
                {homeName}
              </a>
            ) : (
              <span className="text-gray-400 italic">{homeName}</span>
            )}
            {' '}<span className="text-xs text-gray-400 font-normal">vs</span>{' '}
            {match.away_team ? (
              <a href={`/?team=${encodeURIComponent(match.away_team)}`} className="hover:underline">
                {awayName}
              </a>
            ) : (
              <span className="text-gray-400 italic">{awayName}</span>
            )}
          </span>
        </div>

        {/* Venue */}
        <span className="text-xs text-gray-400 hidden lg:block shrink-0 max-w-36 truncate">{match.venue}</span>

        {/* Desktop: score chip in its usual slot */}
        <span className="hidden sm:block shrink-0">{scoreChip}</span>

        {/* Prediction section — above row overlay so buttons remain clickable */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 relative z-10">
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
              <div className="flex items-center">
                <button type="button" onClick={() => setHomeVal(Math.max(0, homeVal - 1))} disabled={isPending}
                  className="w-8 h-8 rounded-l border border-r-0 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center disabled:opacity-50 select-none touch-manipulation">−</button>
                <span className="w-8 h-8 border-y border-gray-300 flex items-center justify-center text-sm font-semibold select-none">{homeVal}</span>
                <button type="button" onClick={() => setHomeVal(Math.min(99, homeVal + 1))} disabled={isPending}
                  className="w-8 h-8 rounded-r border border-l-0 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center disabled:opacity-50 select-none touch-manipulation">+</button>
              </div>
              <span className="text-gray-400 text-xs">–</span>
              <div className="flex items-center">
                <button type="button" onClick={() => setAwayVal(Math.max(0, awayVal - 1))} disabled={isPending}
                  className="w-8 h-8 rounded-l border border-r-0 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center disabled:opacity-50 select-none touch-manipulation">−</button>
                <span className="w-8 h-8 border-y border-gray-300 flex items-center justify-center text-sm font-semibold select-none">{awayVal}</span>
                <button type="button" onClick={() => setAwayVal(Math.min(99, awayVal + 1))} disabled={isPending}
                  className="w-8 h-8 rounded-r border border-l-0 border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center disabled:opacity-50 select-none touch-manipulation">+</button>
              </div>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                {isPending ? '…' : 'Save'}
              </button>
              {graceState === 'active' && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Grace
                </span>
              )}
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

      {/* Grace option banner — deadline passed, window still open, grace not yet used */}
      {graceState === 'available' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-amber-700 font-medium">⏰ Grace option available until first kick-off</span>
          <button
            onClick={handleInvokeGrace}
            disabled={graceIsPending}
            className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-50"
          >
            {graceIsPending ? 'Activating…' : 'Use Grace (1 of 1)'}
          </button>
          {graceMsg && <span className="text-red-500">{graceMsg}</span>}
        </div>
      )}

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

    </div>
  )
}

