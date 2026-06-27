'use client'

import { useState, useTransition } from 'react'
import { runKnockoutAutofill } from '@/app/actions'

export function AdminKnockoutAutofill() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRun() {
    startTransition(async () => {
      const res = await runKnockoutAutofill()
      if (res.error) setMsg({ text: res.error, ok: false })
      else setMsg({
        text: res.filled ? `Filled ${res.filled} match${res.filled !== 1 ? 'es' : ''}.` : 'Nothing new to fill.',
        ok: true,
      })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleRun}
        disabled={isPending}
        className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
      >
        {isPending ? 'Filling…' : 'Auto-fill knockout teams'}
      </button>
      <span className="text-xs text-gray-400">
        Fills empty slots from completed groups and earlier results — never overwrites a team you set.
      </span>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
      )}
    </div>
  )
}
