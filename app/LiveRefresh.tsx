'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Silently re-fetches server components every 60 s when a match is live.
// Pauses while the tab is hidden (saves battery / server load) and refreshes
// immediately when the user returns to the tab so they never see stale scores.
// Renders nothing — pure behaviour component.
export function LiveRefresh({ hasLive }: { hasLive: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!hasLive) return
    const refresh = () => router.refresh()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    const t = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [hasLive, router])
  return null
}
