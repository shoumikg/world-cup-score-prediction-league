'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  auctionPhase, bidRemainingMs, maxBid, teamStats,
  MIN_BID, BID_INCREMENTS, TEAM_LABELS,
  type AuctionPlayer, type AuctionTeamRow, type AuctionTeamId, type TeamStats,
} from '@/lib/auction'
import {
  placeBid, putOnBlock, hammerSold, markUnsold, clearAuctionBids, undoSold, finalizeExpiredBid,
} from './actions'

const POLL_MS = 3000
const POLL_TIMED_MS = 1500 // faster while a sold-timer is running
const STALE_MS = 15000

const TEAM_STYLES: Record<AuctionTeamId, { card: string; chip: string; text: string; solid: string }> = {
  red:  { card: 'border-red-200 bg-red-50',  chip: 'bg-red-100 text-red-700',  text: 'text-red-700',  solid: 'bg-red-600 hover:bg-red-700' },
  blue: { card: 'border-blue-200 bg-blue-50', chip: 'bg-blue-100 text-blue-700', text: 'text-blue-700', solid: 'bg-blue-600 hover:bg-blue-700' },
}

interface Props {
  initialPlayers: AuctionPlayer[]
  initialTeams: AuctionTeamRow[]
  isAdmin: boolean
  captainOf: AuctionTeamId | null
  isLoggedIn: boolean
}

export function AuctionLive({ initialPlayers, initialTeams, isAdmin, captainOf, isLoggedIn }: Props) {
  const [players, setPlayers] = useState(initialPlayers)
  const [teams, setTeams] = useState(initialTeams)
  const [stale, setStale] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [stagedText, setStagedText] = useState('')
  const [nowMs, setNowMs] = useState(0) // 0 until mounted — avoids SSR/client clock mismatch
  const [isPending, startTransition] = useTransition()
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const lastOkRef = useRef(Date.now())
  const lastFinalizeRef = useRef(0)

  const refetch = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    const supabase = supabaseRef.current
    const [{ data: p, error: pe }, { data: t, error: te }] = await Promise.all([
      supabase.from('auction_players').select('*').order('id'),
      supabase.from('auction_teams').select('*'),
    ])
    if (!pe && p) setPlayers(p as AuctionPlayer[])
    if (!te && t) setTeams(t as AuctionTeamRow[])
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

  // Poll — faster while the sold-timer is running, paused when the tab is hidden.
  useEffect(() => {
    const tick = () => { if (!document.hidden) refetch() }
    const id = setInterval(tick, hasTimedBid ? POLL_TIMED_MS : POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refetch, hasTimedBid])

  // Local clock for the countdown (only ticks while a timed bid is live).
  useEffect(() => {
    setNowMs(Date.now())
    if (!hasTimedBid) return
    const id = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(id)
  }, [hasTimedBid])

  const remainingMs = onBlock && nowMs > 0 ? bidRemainingMs(onBlock, nowMs) : null
  const expired = remainingMs !== null && remainingMs <= 0

  // When the countdown runs out, any logged-in viewer's client closes the sale.
  // The server re-verifies expiry and optimistic-locks the write, so early or
  // duplicate calls are harmless no-ops.
  useEffect(() => {
    if (!isLoggedIn || !onBlock || !expired) return
    if (Date.now() - lastFinalizeRef.current < 1500) return
    lastFinalizeRef.current = Date.now()
    finalizeExpiredBid(onBlock.id).then(() => refetch()).catch(() => {})
  }, [isLoggedIn, onBlock, expired, nowMs, refetch])

  // Reset the staged bid whenever a different player comes up.
  const onBlockId = onBlock?.id
  useEffect(() => { setStagedText(''); setMsg(null) }, [onBlockId])

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
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold">⚽ Reunion Auction</h1>
        <div className="flex items-center gap-2">
          {stale && <span className="text-xs text-amber-600">reconnecting…</span>}
          {phaseChip}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {TEAM_LABELS.red} vs {TEAM_LABELS.blue} · live player auction · highest bid wins after a 10-second clock
        {captainOf && <span className="ml-2 font-semibold text-gray-700">— you captain {TEAM_LABELS[captainOf]}</span>}
      </p>

      {phase === 'not_ready' ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">
          The auction hasn’t been set up yet — check back soon.
        </div>
      ) : (
        <>
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
                    {secondsLeft !== null && (
                      <div className="mt-2">
                        {expired ? (
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
                                className="text-sm font-semibold border px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
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
                              className="w-24 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                          </div>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              onClick={() => staged !== null && submitBid(onBlock.id, staged)}
                              disabled={!canConfirm}
                              className={`text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors disabled:opacity-40 ${TEAM_STYLES[captainOf].solid}`}
                            >
                              {expired ? 'Selling…' : staged !== null ? `Place bid ${staged}` : 'Place bid'}
                            </button>
                            {stagedText && (
                              <button
                                onClick={() => setStagedText('')}
                                disabled={isPending}
                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                  <div className="mt-4 pt-4 border-t flex items-center justify-center gap-2 flex-wrap">
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

            {/* Admin: choose who goes on the block next */}
            {isAdmin && !onBlock && (queue.length > 0 || unsoldList.length > 0) && (
              <div className="mt-4 pt-4 border-t text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Put on the block</p>
                <div className="flex flex-wrap gap-2">
                  {[...queue, ...unsoldList].map(p => (
                    <button
                      key={p.id}
                      onClick={() => run(() => putOnBlock(p.id))}
                      disabled={isPending}
                      className="text-sm border px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {p.name}
                      {p.status === 'unsold' && <span className="text-xs text-gray-400 ml-1">(unsold)</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msg && <p className="text-xs text-red-500 mt-3">{msg}</p>}
          </div>

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
                      title="Undo — puts the player back on the block with this bid standing"
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
    </div>
  )
}
