'use client'

import { useState, useTransition } from 'react'
import { submitFeedback } from '@/app/actions'
import { FEEDBACK_MAX_LENGTH } from '@/lib/feedback'

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    startTransition(async () => {
      const res = await submitFeedback(text)
      if (res.error) {
        setStatus({ text: res.error, ok: false })
      } else {
        setText('')
        setStatus({ text: 'Thanks — feedback sent!', ok: true })
        setTimeout(() => {
          setStatus(null)
          setOpen(false)
        }, 1500)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-full shadow-lg transition-colors"
      >
        💬 Feedback
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 w-72 bg-white border rounded-xl shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">Send feedback</span>
        <button
          onClick={() => { setOpen(false); setStatus(null) }}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none px-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={FEEDBACK_MAX_LENGTH}
        rows={4}
        disabled={isPending}
        placeholder="Found a bug? Have a suggestion?"
        className="w-full border rounded-lg px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{text.length}/{FEEDBACK_MAX_LENGTH}</span>
        <button
          onClick={handleSend}
          disabled={isPending || !text.trim()}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {status && (
        <p className={`text-xs mt-2 ${status.ok ? 'text-green-600' : 'text-red-500'}`}>
          {status.text}
        </p>
      )}
    </div>
  )
}
