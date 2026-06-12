'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Silently re-fetches server components every 60 s when a match is live.
// Renders nothing — pure behaviour component.
export function LiveRefresh({ hasLive }: { hasLive: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!hasLive) return
    const t = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(t)
  }, [hasLive, router])
  return null
}
