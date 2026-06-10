'use client'

import { useState, useTransition } from 'react'
import { saveResult } from '@/app/actions'
import type { Match } from '@/lib/types'

export function AdminResultForm({ match }: { match: Match }) {
  const [home, setHome] = useState(match.home_score?.toString() ?? '')
  const [away, setAway] = useState(match.away_score?.toString() ?? '')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const h = parseInt(home)
    const a = parseInt(away)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setMsg({ text: 'Enter valid scores', ok: false })
      return
    }
    startTransition(async () => {
      const res = await saveResult(match.id, h, a)
      if (res.error) setMsg({ text: res.error, ok: false })
      else setMsg({ text: 'Saved!', ok: true })
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="number" min={0} max={99} value={home}
        onChange={e => setHome(e.target.value)}
        disabled={isPending}
        className="w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
        placeholder="H"
      />
      <span className="text-gray-400">–</span>
      <input
        type="number" min={0} max={99} value={away}
        onChange={e => setAway(e.target.value)}
        disabled={isPending}
        className="w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
        placeholder="A"
      />
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
  )
}
