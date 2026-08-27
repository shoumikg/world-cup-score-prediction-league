'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  auctionPhase, bidRemainingMs, holdRemainingMs, maxBid, teamStats,
  MIN_BID, BID_INCREMENTS, TEAM_LABELS,
  type AuctionPlayer, type AuctionTeamRow, type AuctionTeamId, type TeamStats, type AuctionEvent,
} from '@/lib/auction'
import {
  placeBid, putRandomOnBlock, putSpecificOnBlock, hammerSold, markUnsold, clearAuctionBids,
  undoSold, returnToPool, stopClock, restartClock, adminSetBid, forceReleaseHold,
  finalizeExpiredBid, toggleHold, releaseExhaustedHold,
} from './actions'

function fmtMins(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function TeamChip({ team }: { team: AuctionTeamId }) {
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${TEAM_STYLES[team].chip}`}>
      {TEAM_LABELS[team]}
    </span>
  )
}

function feedLine(e: AuctionEvent) {
  const name = <span className="font-medium">{e.player_name}</span>
  switch (e.type) {
    case 'on_block':
      return <>🎲 {name} is on the block!</>
    case 'bid':
      return <>{e.team && <TeamChip team={e.team} />} bids <span className="font-semibold tabular-nums">{e.amount}</span> on {name}</>
    case 'bid_set':
      return <>🔧 Auctioneer sets the bid — {e.team && <TeamChip team={e.team} />} <span className="font-semibold tabular-nums">{e.amount}</span> on {name}</>
    case 'hold_start':
      return <>⏸ {e.team && <TeamChip team={e.team} />} holds — clock paused</>
    case 'hold_end':
      return <>▶ {e.team && <TeamChip team={e.team} />} releases the hold</>
    case 'hold_exhausted':
      return <>⌛ {e.team && <TeamChip team={e.team} />} is out of hold time — clock resumes</>
    case 'sold':
      return <>🔨 <span className="text-green-700">SOLD</span> — {name} to {e.team && <TeamChip team={e.team} />} for <span className="tabular-nums">{e.amount}</span>!</>
    case 'unsold':
      return <>❌ {name} goes unsold</>
    case 'undo':
      return <>↩️ Sale of {name} undone</>
    case 'back_to_pool':
      return <>↩️ {name} returns to the pool</>
    case 'clear_bids':
      return <>🧹 Bids on {name} cleared</>
    case 'clock_stopped':
      return <>⏸ Auctioneer stops the clock</>
    case 'clock_restarted':
      return <>⏱ Fresh 10 seconds on the clock</>
  }
}

const POLL_MS = 3000
const POLL_TIMED_MS = 1500     // faster while a sold-timer is running
const POLL_COMPLETE_MS = 15000 // slow once the auction is done
const STALE_MS = 15000

const TEAM_STYLES: Record<AuctionTeamId, { card: string; chip: string; text: string; solid: string }> = {
  red:  { card: 'border-red-200 bg-red-50',  chip: 'bg-red-100 text-red-700',  text: 'text-red-700',  solid: 'bg-red-600 hover:bg-red-700' },
  blue: { card: 'border-blue-200 bg-blue-50', chip: 'bg-blue-100 text-blue-700', text: 'text-blue-700', solid: 'bg-blue-600 hover:bg-blue-700' },
}

interface Props {
  initialPlayers: AuctionPlayer[]
  initialTeams: AuctionTeamRow[]
  initialEvents: AuctionEvent[]
  isAdmin: boolean
  captainOf: AuctionTeamId | null
}

export function AuctionLive({ initialPlayers, initialTeams, initialEvents, isAdmin, captainOf }: Props) {
  const [players, setPlayers] = useState(initialPlayers)
  const [teams, setTeams] = useState(initialTeams)
  const [events, setEvents] = useState(initialEvents)
  const [stale, setStale] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [stagedText, setStagedText] = useState('')
  const [overrideTeam, setOverrideTeam] = useState<AuctionTeamId>('red')
  const [overrideAmount, setOverrideAmount] = useState('')
  const [nowMs, setNowMs] = useState(0) // 0 until mounted — avoids SSR/client clock mismatch
  const [isPending, startTransition] = useTransition()
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const lastOkRef = useRef(Date.now())
  const lastFinalizeRef = useRef(0)
  const lastHoldReleaseRef = useRef(0)
  const clockOffsetRef = useRef(0) // serverNow − clientNow, measured once
  const eventsRef = useRef(initialEvents)
  const pollCountRef = useRef(0)

  const refetch = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    const supabase = supabaseRef.current
    // Feed is delta-fetched against the newest id we hold (full resync every
    // 20th poll to self-heal after an auction reset) — the 50-row feed was the
    // bulk of the polling payload.
    const maxEventId = eventsRef.current[0]?.id ?? 0
    const fullFeed = maxEventId === 0 || pollCountRef.current % 20 === 0
    pollCountRef.current += 1
    const eventsQuery = fullFeed
      ? supabase.from('auction_events').select('*').order('id', { ascending: false }).limit(50)
      : supabase.from('auction_events').select('*').gt('id', maxEventId).order('id', { ascending: false }).limit(50)
    const [{ data: p, error: pe }, { data: t, error: te }, { data: ev }] = await Promise.all([
      supabase.from('auction_players').select('*').order('id'),
      supabase.from('auction_teams').select('*'),
      eventsQuery,
    ])
    if (!pe && p) setPlayers(p as AuctionPlayer[])
    if (!te && t) setTeams(t as AuctionTeamRow[])
    if (ev) {
      const rows = ev as AuctionEvent[]
      if (fullFeed) {
        eventsRef.current = rows
        setEvents(rows)
      } else if (rows.length > 0) {
        const known = new Set(eventsRef.current.map(e => e.id))
        const fresh = rows.filter(e => !known.has(e.id))
        if (fresh.length > 0) {
          const merged = [...fresh, ...eventsRef.current].slice(0, 50)
          eventsRef.current = merged
          setEvents(merged)
        }
      }
    }
    if (!pe && !te) {
      lastOkRef.current = Date.now()
      setStale(false)
    } else if (Date.now() - lastOkRef.current > STALE_MS) {
      setStale(true)
    }
  }, [])

  const phase = auctionPhase(players)
  const onBlock = players.find(p => p.status === 'on_block') ?? null
  const hasTimedBid = !!(onBlock && onBlock.current_bid !== null && onBlock.bid_placed_at)

  // Poll — faster while the sold-timer is running, slow once the auction is
  // complete, paused when the tab is hidden.
  useEffect(() => {
    const tick = () => { if (!document.hidden) refetch() }
    const interval = hasTimedBid ? POLL_TIMED_MS : phase === 'complete' ? POLL_COMPLETE_MS : POLL_MS
    const id = setInterval(tick, interval)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refetch, hasTimedBid, phase])

  // One-time clock-skew probe: countdowns compare the device clock against
  // server-written timestamps, and a device clock a few seconds off silently
  // breaks a 10-second timer (fast → everything looks instantly expired and a
  // captain's bid UI goes dead; slow → surprise sales). The same-origin
  // favicon response's Date header gives Vercel's clock; centre it against the
  // request round-trip and ignore sub-1.5s noise (the header has 1s grain).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t0 = Date.now()
        const res = await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
        const t1 = Date.now()
        const dateHeader = res.headers.get('date')
        if (cancelled || !dateHeader) return
        const offset = Date.parse(dateHeader) + 500 - (t0 + t1) / 2
        clockOffsetRef.current = Math.abs(offset) > 1500 ? offset : 0
        setNowMs(Date.now() + clockOffsetRef.current)
      } catch { /* unmeasurable — leave offset at 0 */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Local clock for the countdown (only ticks while a timed bid is live).
  useEffect(() => {
    setNowMs(Date.now() + clockOffsetRef.current)
    if (!hasTimedBid) return
    const id = setInterval(() => setNowMs(Date.now() + clockOffsetRef.current), 250)
    return () => clearInterval(id)
  }, [hasTimedBid])

  const remainingMs = onBlock && nowMs > 0 ? bidRemainingMs(onBlock, nowMs) : null
  const expired = remainingMs !== null && remainingMs <= 0
  const holdingTeam = onBlock?.hold_team ?? null
  const holdingTeamRow = holdingTeam ? teams.find(t => t.team === holdingTeam) ?? null : null
  const holdBudgetLeft = holdingTeamRow && onBlock && nowMs > 0
    ? holdRemainingMs(holdingTeamRow, onBlock, nowMs)
    : null

  // When the countdown runs out, any viewer's client — anonymous spectators
  // included — closes the sale. The server re-verifies expiry and
  // optimistic-locks the write, so early or duplicate calls are harmless
  // no-ops, and the sale never depends on a particular tab being awake.
  useEffect(() => {
    if (!onBlock || !expired) return
    if (Date.now() - lastFinalizeRef.current < 1500) return
    lastFinalizeRef.current = Date.now()
    finalizeExpiredBid(onBlock.id).then(() => refetch()).catch(() => {})
  }, [onBlock, expired, nowMs, refetch])

  // Likewise for a hold whose budget has run out — the server re-verifies
  // exhaustion, so early or duplicate calls can't cut a hold short.
  useEffect(() => {
    if (!onBlock || holdingTeam === null) return
    if (holdBudgetLeft === null || holdBudgetLeft > 0) return
    if (Date.now() - lastHoldReleaseRef.current < 1500) return
    lastHoldReleaseRef.current = Date.now()
    releaseExhaustedHold(onBlock.id).then(() => refetch()).catch(() => {})
  }, [onBlock, holdingTeam, holdBudgetLeft, nowMs, refetch])

  // Reset the staged bid and override inputs whenever a different player comes up.
  const onBlockId = onBlock?.id
  useEffect(() => { setStagedText(''); setOverrideAmount(''); setMsg(null) }, [onBlockId])

  function run(action: () => Promise<{ error?: string }>) {
    setMsg(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setMsg(res.error)
      await refetch()
    })
  }

  function submitBid(playerId: number, amount: number) {
    setMsg(null)
    startTransition(async () => {
      const res = await placeBid(playerId, amount)
      if (res.error) setMsg(res.error)
      else setStagedText('')
      await refetch()
    })
  }

  const queue = players.filter(p => p.status === 'pending')
  const unsoldList = players.filter(p => p.status === 'unsold')
  const soldList = players
    .filter(p => p.status === 'sold')
    .sort((a, b) => (b.sold_at ?? '').localeCompare(a.sold_at ?? ''))
  const statsByTeam = new Map<AuctionTeamId, TeamStats>(
    teams.map(t => [t.team, teamStats(players, t)])
  )

  const secondsLeft = remainingMs === null ? null : Math.max(0, Math.ceil(remainingMs / 1000))

  const phaseChip =
    phase === 'live' ? (
      <span className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
      </span>
    ) : phase === 'complete' ? (
      <span className="bg-gray-800 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Auction complete</span>
    ) : phase === 'between' ? (
      <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">Next player coming up…</span>
    ) : (
      <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-2.5 py-1 rounded-full">Starting soon</span>
    )

  return (
    <div className={`max-w-4xl mx-auto px-3 sm:px-4 py-6 ${captainOf ? 'pb-16 sm:pb-6' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold">⚽ Reunion Auction</h1>
        <div className="flex items-center gap-2">
          {stale && <span className="text-xs text-amber-600">reconnecting…</span>}
          {phaseChip}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {TEAM_LABELS.red} vs {TEAM_LABELS.blue} · live player auction · highest bid wins after a 10-second clock · captains can pause it with 10 minutes of hold time
        {captainOf && <span className="ml-2 font-semibold text-gray-700">— you captain {TEAM_LABELS[captainOf]}</span>}
      </p>

      {phase === 'not_ready' ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">
          The auction hasn’t been set up yet — check back soon.
        </div>
      ) : (
        <>
          {/* The block */}
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-6 text-center">
            {onBlock ? (
              <>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">On the block</p>
                <p className="text-2xl font-bold mb-2">{onBlock.name}</p>
                {onBlock.current_bid !== null && onBlock.current_bidder ? (
                  <div className="mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${TEAM_STYLES[onBlock.current_bidder].chip}`}>
                      {TEAM_LABELS[onBlock.current_bidder]}
                    </span>
                    <span className="text-3xl font-bold ml-2 tabular-nums">{onBlock.current_bid}</span>
                    {onBlock.bid_placed_at === null && (
                      <div className="mt-2">
                        <span className="inline-block text-sm font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          ⏸ Clock stopped — the next bid starts it
                        </span>
                      </div>
                    )}
                    {secondsLeft !== null && (
                      <div className="mt-2">
                        {holdingTeam ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            ⏸ {secondsLeft}s — {TEAM_LABELS[holdingTeam]} holding
                            {holdBudgetLeft !== null && (
                              <span className="text-xs font-semibold text-amber-600">({fmtMins(holdBudgetLeft)} left)</span>
                            )}
                          </span>
                        ) : expired ? (
                          <span className="text-sm font-bold text-gray-500 animate-pulse">🔨 Selling…</span>
                        ) : (
                          <span className={`inline-block text-sm font-bold tabular-nums px-2.5 py-0.5 rounded-full ${
                            secondsLeft <= 3 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600'
                          }`}>
                            ⏱ {secondsLeft}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-1">No bids yet · minimum bid {MIN_BID} · first bid starts the 10s clock</p>
                )}

                {/* Captain bidding — stage an amount, then confirm */}
                {captainOf && (() => {
                  const myStats = statsByTeam.get(captainOf)!
                  const myTeamRow = teams.find(t => t.team === captainOf)!
                  const myHoldLeft = nowMs > 0 ? holdRemainingMs(myTeamRow, onBlock, nowMs) : 0
                  const iHold = holdingTeam === captainOf
                  const canStartHold =
                    holdingTeam === null && onBlock.current_bid !== null &&
                    onBlock.bid_placed_at !== null && !expired && myHoldLeft >= 1000
                  const cap = maxBid(myStats)
                  const leading = onBlock.current_bidder === captainOf
                  const current = onBlock.current_bid ?? 0
                  const staged = /^\d+$/.test(stagedText.trim()) ? parseInt(stagedText.trim(), 10) : null
                  const stagedProblem =
                    staged === null ? null
                    : staged <= current && onBlock.current_bid !== null ? `Must beat the current bid of ${current}.`
                    : staged < MIN_BID ? `Minimum bid is ${MIN_BID}.`
                    : staged > cap ? `Your max bid is ${cap}.`
                    : null
                  const canConfirm = staged !== null && stagedProblem === null && !expired && !isPending
                  return (
                    <div className="mt-4 pt-4 border-t">
                      {/* Hold — freezes the sold-clock on this captain's own time budget */}
                      {(iHold || onBlock.current_bid !== null) && (
                        <div className="mb-3">
                          <button
                            onClick={() => run(() => toggleHold(onBlock.id))}
                            disabled={isPending || (!iHold && !canStartHold)}
                            title={
                              iHold ? 'Resume the clock — stops using your hold time'
                              : holdingTeam ? `${TEAM_LABELS[holdingTeam]} is holding`
                              : myHoldLeft < 1000 ? 'No hold time left'
                              : 'Pause the clock while you think — uses your hold time'
                            }
                            className={`text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40 ${
                              iHold
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            {iHold ? '▶ Resume clock' : `⏸ Hold (${fmtMins(myHoldLeft)} left)`}
                          </button>
                          {iHold && (
                            <p className="text-xs text-amber-600 mt-1">
                              Clock paused — your hold time is running. Bidding also resumes the clock.
                            </p>
                          )}
                          {!iHold && !canStartHold && (
                            <p className="text-xs text-gray-400 mt-1">
                              {holdingTeam ? `${TEAM_LABELS[holdingTeam]} is holding`
                                : myHoldLeft < 1000 ? 'No hold time left'
                                : onBlock.bid_placed_at === null ? 'Clock is stopped — nothing to hold'
                                : 'Hold unavailable right now'}
                            </p>
                          )}
                        </div>
                      )}
                      {leading ? (
                        <p className="text-sm font-semibold text-green-600">You’re the highest bidder ✓</p>
                      ) : myStats.rosterCount >= myStats.cap ? (
                        <p className="text-sm text-gray-400">Your squad is full — no more bids.</p>
                      ) : cap < Math.max(current + 1, MIN_BID) ? (
                        <p className="text-sm text-gray-400">You can’t afford to raise (max bid {cap}).</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                            {BID_INCREMENTS.map(inc => (
                              <button
                                key={inc}
                                onClick={() => setStagedText(String((staged !== null && staged > current ? staged : current) + inc))}
                                disabled={isPending || expired}
                                className="text-sm font-semibold border px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
                              >
                                +{inc}
                              </button>
                            ))}
                            <input
                              type="number" inputMode="numeric" min={MIN_BID} max={cap}
                              value={stagedText}
                              onChange={e => setStagedText(e.target.value)}
                              placeholder="Amount"
                              disabled={isPending || expired}
                              className="w-24 border rounded-lg px-2 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                          </div>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              onClick={() => staged !== null && submitBid(onBlock.id, staged)}
                              disabled={!canConfirm}
                              className={`text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40 ${TEAM_STYLES[captainOf].solid}`}
                            >
                              {expired ? 'Selling…' : staged !== null ? `Place bid ${staged}` : 'Place bid'}
                            </button>
                            {stagedText && (
                              <button
                                onClick={() => setStagedText('')}
                                disabled={isPending}
                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-2"
                              >
                                clear
                              </button>
                            )}
                          </div>
                          {stagedProblem && <p className="text-xs text-red-500 mt-2">{stagedProblem}</p>}
                        </>
                      )}
                      <p className="text-xs text-gray-400 mt-2">Your max bid: {cap}</p>
                    </div>
                  )
                })()}

                {/* Auctioneer backstop controls */}
                {isAdmin && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={() => run(() => hammerSold(onBlock.id, onBlock.current_bid!, onBlock.current_bidder!))}
                        disabled={isPending || onBlock.current_bid === null}
                        className="text-sm font-bold bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded transition-colors disabled:opacity-40"
                      >
                        🔨 Sold now{onBlock.current_bid !== null && onBlock.current_bidder
                          ? ` — ${TEAM_LABELS[onBlock.current_bidder]} ${onBlock.current_bid}`
                          : ''}
                      </button>
                      <button
                        onClick={() => run(() => markUnsold(onBlock.id))}
                        disabled={isPending}
                        className="text-sm text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Unsold
                      </button>
                      <button
                        onClick={() => run(() => clearAuctionBids(onBlock.id))}
                        disabled={isPending || onBlock.current_bid === null}
                        className="text-sm text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                      >
                        Clear bids
                      </button>
                    </div>

                    <details className="mt-3 text-left">
                      <summary className="cursor-pointer select-none text-xs text-gray-400 hover:text-gray-600 text-center">
                        More overrides
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {onBlock.bid_placed_at !== null ? (
                            <button
                              onClick={() => run(() => stopClock(onBlock.id))}
                              disabled={isPending || onBlock.current_bid === null}
                              className="text-xs text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                              title="Freeze the sold-clock without using any captain's hold time"
                            >
                              ⏸ Stop clock
                            </button>
                          ) : (
                            <button
                              onClick={() => run(() => restartClock(onBlock.id))}
                              disabled={isPending || onBlock.current_bid === null}
                              className="text-xs text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                              title="Start a fresh 10-second clock on the standing bid"
                            >
                              ▶ Restart clock (10s)
                            </button>
                          )}
                          {onBlock.bid_placed_at !== null && (
                            <button
                              onClick={() => run(() => restartClock(onBlock.id))}
                              disabled={isPending || onBlock.current_bid === null}
                              className="text-xs text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                              title="Reset the sold-clock to a fresh 10 seconds"
                            >
                              ↺ Fresh 10s
                            </button>
                          )}
                          {holdingTeam && (
                            <button
                              onClick={() => run(() => forceReleaseHold(onBlock.id))}
                              disabled={isPending}
                              className="text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded hover:bg-amber-50 transition-colors disabled:opacity-40"
                              title="End the active hold (charged for the time used)"
                            >
                              End {TEAM_LABELS[holdingTeam]}’s hold
                            </button>
                          )}
                          <button
                            onClick={() => run(() => returnToPool(onBlock.id))}
                            disabled={isPending}
                            className="text-xs text-gray-600 border px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                            title="Send this player back into the draw pool (unlike Unsold, they rejoin the first round)"
                          >
                            Back to pool
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">Set bid</span>
                          <select
                            value={overrideTeam}
                            onChange={e => setOverrideTeam(e.target.value as AuctionTeamId)}
                            disabled={isPending}
                            className="border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                          >
                            <option value="red">{TEAM_LABELS.red}</option>
                            <option value="blue">{TEAM_LABELS.blue}</option>
                          </select>
                          <input
                            type="number" inputMode="numeric" min={1}
                            value={overrideAmount}
                            onChange={e => setOverrideAmount(e.target.value)}
                            placeholder="Amount"
                            disabled={isPending}
                            className="w-20 border rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                          <button
                            onClick={() => {
                              const amt = parseInt(overrideAmount, 10)
                              if (!isNaN(amt)) run(() => adminSetBid(onBlock.id, overrideTeam, amt))
                            }}
                            disabled={isPending || !/^\d+$/.test(overrideAmount.trim())}
                            className="text-xs text-gray-600 border px-3 py-1 rounded hover:bg-gray-50 transition-colors disabled:opacity-40"
                            title="Overwrite the current bid (restarts a fresh 10-second clock)"
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </>
            ) : phase === 'complete' ? (
              <p className="text-sm text-gray-500 py-3">
                That’s a wrap — all players are settled. Final squads above. 🎉
              </p>
            ) : (
              <p className="text-sm text-gray-400 py-3">
                {phase === 'ready' ? 'Waiting for the auction to start…' : 'Waiting for the next player…'}
              </p>
            )}

            {/* Admin: draw the next player at random from the remaining pool */}
            {isAdmin && !onBlock && (queue.length > 0 || unsoldList.length > 0) && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => run(() => putRandomOnBlock())}
                  disabled={isPending}
                  className="text-sm font-bold bg-gray-800 hover:bg-gray-900 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  🎲 Next player{queue.length > 0
                    ? ` (${queue.length} in pool)`
                    : ` (${unsoldList.length} unsold back in the pool)`}
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  Drawn at random. No clock runs until the first bid.
                </p>
                <details className="mt-3 text-left">
                  <summary className="cursor-pointer select-none text-xs text-gray-400 hover:text-gray-600 text-center">
                    Pick a specific player instead
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2 justify-center">
                    {[...queue, ...unsoldList].map(p => (
                      <button
                        key={p.id}
                        onClick={() => run(() => putSpecificOnBlock(p.id))}
                        disabled={isPending}
                        className="text-xs border px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {p.name}
                        {p.status === 'unsold' && <span className="text-gray-400 ml-1">(unsold)</span>}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {msg && <p className="text-xs text-red-500 mt-3">{msg}</p>}
          </div>

          {/* Team cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {teams
              .slice()
              .sort(a => (a.team === 'red' ? -1 : 1))
              .map(t => {
                const s = statsByTeam.get(t.team)!
                const roster = players.filter(p => p.status === 'sold' && p.team === t.team)
                const leading = onBlock?.current_bidder === t.team
                return (
                  <div key={t.team} className={`rounded-xl border shadow-sm p-4 ${TEAM_STYLES[t.team].card}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <h2 className={`font-bold ${TEAM_STYLES[t.team].text}`}>
                        Team {TEAM_LABELS[t.team]}
                        {leading && <span className="ml-2 text-xs font-semibold animate-pulse">● leading</span>}
                      </h2>
                      <span className="text-xs text-gray-500">{s.rosterCount}/{s.cap} players</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Captain: <span className="font-medium text-gray-700">{t.captain_name ?? 'TBD'}</span>
                    </p>
                    <p className="text-sm mb-2">
                      <span className="font-bold text-gray-900">{s.remaining}</span>
                      <span className="text-xs text-gray-500"> / {s.purse} purse left</span>
                      {nowMs > 0 && (
                        <span className="text-xs text-gray-500 ml-2">
                          · ⏸ {fmtMins(holdRemainingMs(t, onBlock, nowMs))} hold left
                        </span>
                      )}
                    </p>
                    {roster.length > 0 && (
                      <ul className="text-xs text-gray-700 space-y-0.5">
                        {roster.map(p => (
                          <li key={p.id} className="flex justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            <span className="font-semibold tabular-nums shrink-0">{p.price}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
          </div>

          {/* Live feed */}
          {events.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm mb-6">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-1">
                Live feed
              </h3>
              <ul className="divide-y max-h-72 overflow-y-auto px-4 pb-2">
                {events.map(e => (
                  <li key={e.id} className={`flex items-baseline gap-2 py-1.5 text-sm ${e.type === 'sold' ? 'font-semibold' : ''}`}>
                    <span className="text-[10px] text-gray-400 tabular-nums shrink-0 w-14">
                      {nowMs > 0 ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''}
                    </span>
                    <span className="min-w-0">{feedLine(e)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Still to come */}
          {queue.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Still to come · {queue.length}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {queue.map(p => (
                  <span key={p.id} className="text-xs bg-white border rounded-full px-2.5 py-1 text-gray-600">
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Unsold */}
          {unsoldList.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Unsold</h3>
              <div className="flex flex-wrap gap-1.5">
                {unsoldList.map(p => (
                  <span key={p.id} className="text-xs bg-gray-100 border rounded-full px-2.5 py-1 text-gray-500">
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sale log */}
          {soldList.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm px-4 py-2 divide-y">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide py-2">Sold</h3>
              {soldList.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-medium flex-1 truncate">{p.name}</span>
                  {p.team && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${TEAM_STYLES[p.team].chip}`}>
                      {TEAM_LABELS[p.team]}
                    </span>
                  )}
                  <span className="font-bold tabular-nums w-12 text-right">{p.price}</span>
                  {isAdmin && (
                    <button
                      onClick={() => run(() => undoSold(p.id))}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Undo — back on the block with this bid standing and the clock stopped"
                    >
                      undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Captains on phones: pinned strip so the price and clock stay visible
          while scrolling (display only — controls are in the block card). */}
      {captainOf && onBlock && onBlock.current_bid !== null && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-gray-900/95 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm sm:hidden">
          <span className="truncate font-medium">{onBlock.name}</span>
          {onBlock.current_bidder && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${TEAM_STYLES[onBlock.current_bidder].chip}`}>
              {TEAM_LABELS[onBlock.current_bidder]} {onBlock.current_bid}
            </span>
          )}
          {holdingTeam ? (
            <span className="text-amber-300 font-bold shrink-0">⏸ held</span>
          ) : onBlock.bid_placed_at === null ? (
            <span className="text-gray-400 font-bold shrink-0">⏸</span>
          ) : expired ? (
            <span className="font-bold animate-pulse shrink-0">🔨</span>
          ) : secondsLeft !== null && (
            <span className={`font-bold tabular-nums shrink-0 ${secondsLeft <= 3 ? 'text-red-400' : ''}`}>
              ⏱ {secondsLeft}s
            </span>
          )}
        </div>
      )}
    </div>
  )
}
