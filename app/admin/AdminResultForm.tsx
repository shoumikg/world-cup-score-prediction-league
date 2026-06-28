'use client'

import { useState, useTransition } from 'react'
import { saveResult } from '@/app/actions'
import type { Match } from '@/lib/types'

const SCORE_INPUT =
  'w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400'

export function AdminResultForm({ match }: { match: Match }) {
  const isKnockout = match.stage !== 'group'
  const [home, setHome] = useState(match.home_score?.toString() ?? '')
  const [away, setAway] = useState(match.away_score?.toString() ?? '')
  const [resultType, setResultType] = useState<'ft' | 'aet' | 'pen'>(
    match.status === 'aet' || match.status === 'pen' ? match.status : 'ft'
  )
  // 90-minute score (knockout grading); pre-filled to the recorded reg score or the full score.
  const [reg90Home, setReg90Home] = useState((match.reg_home_score ?? match.home_score)?.toString() ?? '')
  const [reg90Away, setReg90Away] = useState((match.reg_away_score ?? match.away_score)?.toString() ?? '')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Only ET / penalty matches need a separate 90-minute score; a full-time
  // result is graded on the score shown.
  const showReg = isKnockout && resultType !== 'ft'

  function handleSave() {
    const h = parseInt(home)
    const a = parseInt(away)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setMsg({ text: 'Enter valid scores', ok: false })
      return
    }

    let opts: { status?: 'ft' | 'aet' | 'pen'; regHome?: number; regAway?: number } = {}
    if (isKnockout) {
      let regH = h
      let regA = a
      if (resultType !== 'ft') {
        regH = parseInt(reg90Home)
        regA = parseInt(reg90Away)
        if (isNaN(regH) || isNaN(regA) || regH < 0 || regA < 0) {
          setMsg({ text: 'Enter a valid 90-minute score', ok: false })
          return
        }
      }
      opts = { status: resultType, regHome: regH, regAway: regA }
    }

    startTransition(async () => {
      const res = await saveResult(match.id, h, a, opts)
      if (res.error) setMsg({ text: res.error, ok: false })
      else setMsg({ text: 'Saved!', ok: true })
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number" min={0} max={99} value={home}
          onChange={e => setHome(e.target.value)} disabled={isPending}
          className={SCORE_INPUT} placeholder="H"
        />
        <span className="text-gray-400">–</span>
        <input
          type="number" min={0} max={99} value={away}
          onChange={e => setAway(e.target.value)} disabled={isPending}
          className={SCORE_INPUT} placeholder="A"
        />
        {isKnockout && (
          <select
            value={resultType}
            onChange={e => setResultType(e.target.value as 'ft' | 'aet' | 'pen')}
            disabled={isPending}
            className="border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            title="How the match was decided"
          >
            <option value="ft">Full time</option>
            <option value="aet">After extra time</option>
            <option value="pen">Penalties</option>
          </select>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
        >
          {isPending ? '…' : 'Save result'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
        )}
      </div>

      {showReg && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Score at 90′ <span className="text-gray-400">(grades predictions)</span></span>
          <input
            type="number" min={0} max={99} value={reg90Home}
            onChange={e => setReg90Home(e.target.value)} disabled={isPending}
            className={SCORE_INPUT} placeholder="H"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number" min={0} max={99} value={reg90Away}
            onChange={e => setReg90Away(e.target.value)} disabled={isPending}
            className={SCORE_INPUT} placeholder="A"
          />
        </div>
      )}
    </div>
  )
}
