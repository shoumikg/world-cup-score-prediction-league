'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { savePrediction } from '@/app/actions'
import { stageLabel, scoreColor, scoreOutcome, type Outcome } from '@/lib/scoring'
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

  const [homeVal, setHomeVal] = useState(prediction?.home_pred ?? 0)
  const [awayVal, setAwayVal] = useState(prediction?.away_pred ?? 0)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const lastSaved = useRef<{ home: number | null; away: number | null }>({
    home: prediction?.home_pred ?? null,
    away: prediction?.away_pred ?? null,
  })

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
    startTransition(async () => {
      const res = await savePrediction(match.id, homeVal, awayVal)
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

  const predictedCount = picks?.filter(p => p.prediction !== null).length ?? 0

  // Once a result is in, order everyone's picks best-first (mini leaderboard
  // for the match); before that, keep the server's alphabetical order.
  const OUTCOME_RANK: Record<Outcome, number> = { exact: 0, correct_gd: 1, correct: 2, wrong: 3 }
  const entryRank = (e: PickEntry) =>
    e.prediction
      ? OUTCOME_RANK[scoreOutcome(
          { user_id: '', match_id: match.id, home_pred: e.prediction.homePred, away_pred: e.prediction.awayPred, updated_at: '' },
          match
        )!]
      : 4 // no pick sorts last
  const displayedPicks = picks && hasResult
    ? [...picks].sort((a, b) => entryRank(a) - entryRank(b) || a.displayName.localeCompare(b.displayName))
    : picks

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
    <div className="py-3 border-b last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Match meta + teams: stacked on mobile, inline on sm+ */}
        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <a href={`/match/${match.id}`} className="text-xs text-gray-400 hover:text-green-600 w-6 text-right shrink-0">#{match.id}</a>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
              match.stage === 'group'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {match.stage === 'group' ? `Grp ${match.group_name}` : stageLabel(match.stage)}
            </span>
            {/* Mobile: score chip rides the meta line, pushed right */}
            <span className="ml-auto sm:hidden">{scoreChip}</span>
          </div>

          {/* Full team names — wrap instead of truncating */}
          <span className={`text-sm font-medium sm:min-w-0 ${isPlaceholder ? 'text-gray-400 italic' : ''}`}>
            {homeName} <span className="text-xs text-gray-400 font-normal">vs</span> {awayName}
          </span>
        </div>

        {/* Venue */}
        <span className="text-xs text-gray-400 hidden lg:block shrink-0 max-w-36 truncate">{match.venue}</span>

        {/* Desktop: score chip in its usual slot */}
        <span className="hidden sm:block shrink-0">{scoreChip}</span>

        {/* Prediction section — wraps so the saved/error message drops to its
            own line on narrow screens instead of overflowing */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none py-1">
            Everyone's picks ({predictedCount}{totalPlayers ? ` of ${totalPlayers}` : ''})
          </summary>
          <div className="mt-2 pb-1">
            {displayedPicks!.map((entry, i) => (
              <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                entry.isSelf ? 'bg-green-50' : 'odd:bg-gray-50'
              }`}>
                <span className={`text-xs min-w-0 flex-1 truncate ${
                  entry.isSelf ? 'text-green-900 font-semibold' : 'text-gray-600'
                }`}>
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

