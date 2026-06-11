'use client'

import { useEffect, useState } from 'react'

function formatRemaining(ms: number): string {
  if (ms <= 0) return ''
  const totalSecs = Math.floor(ms / 1000)
  const days  = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins  = Math.floor((totalSecs % 3600) / 60)
  if (days > 0)  return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  if (mins > 0)  return `${mins}m left`
  return '< 1m left'
}

export function DeadlineCountdown({ deadlineISO }: { deadlineISO: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const deadline = new Date(deadlineISO).getTime()

    function tick() {
      const remaining = deadline - Date.now()
      setLabel(formatRemaining(remaining))
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadlineISO])

  if (!label) return null
  return <span> · {label}</span>
}
