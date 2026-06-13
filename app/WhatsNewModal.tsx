'use client'

import { useState, useTransition } from 'react'
import { markWhatsNewSeen } from '@/app/actions'
import type { ChangelogEntry } from '@/lib/changelog'

interface Props {
  entries: ChangelogEntry[]
}

export function WhatsNewModal({ entries }: Props) {
  const [open, setOpen] = useState(true)
  const [isPending, startTransition] = useTransition()

  if (!open || entries.length === 0) return null

  function handleDismiss() {
    startTransition(async () => {
      await markWhatsNewSeen()
      setOpen(false)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleDismiss} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-0.5">
              What&rsquo;s New
            </p>
            <h2 className="text-base font-bold text-gray-900">
              {entries.length === 1 ? '1 update' : `${entries.length} updates`} since you last visited
            </h2>
          </div>
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-lg leading-none ml-4"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {entries.map(entry => (
            <div key={entry.id}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className="text-sm font-semibold text-gray-900">{entry.title}</p>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <ul className="space-y-1">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500 shrink-0 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t shrink-0">
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            {isPending ? 'Marking as seen…' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  )
}
