'use client'

import { useEffect, useState } from 'react'

function formatRemaining(ms: number): string {
  if (ms <= 0) return ''
  const totalSecs = Math.floor(ms / 1000)
  const days  = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins  = Math.floor((totalSecs % 3600) / 60)
  const secs  = totalSecs % 60
  if (days > 0)  return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  if (mins > 0)  return `${mins}m ${secs.toString().padStart(2, '0')}s left`
  return `${secs}s left`
}

export function DeadlineCountdown({ deadlineISO }: { deadlineISO: string }) {
  const [msLeft, setMsLeft] = useState(0)

  useEffect(() => {
    const deadline = new Date(deadlineISO).getTime()
    function tick() { setMsLeft(Math.max(0, deadline - Date.now())) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadlineISO])

  const label = formatRemaining(msLeft)
  if (!label) return null

  const urgencyClass =
    msLeft < 3_600_000  ? 'text-red-500 font-medium' :
    msLeft < 21_600_000 ? 'text-orange-500' : ''

  return <span className={urgencyClass}> · {label}</span>
}
