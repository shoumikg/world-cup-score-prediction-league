'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const prevPathname = useRef(pathname)
  // Fallback timeout so the bar never gets stuck if navigation fails
  const failsafeRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Navigation completed: new pathname received from the router
  useEffect(() => {
    if (prevPathname.current === pathname) return
    prevPathname.current = pathname
    clearTimeout(failsafeRef.current)
    setLoading(false)
  }, [pathname])

  // Detect navigation start by intercepting <a> clicks before the router fires
  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null
      if (!a) return
      // Let the browser handle modifier-key variants normally (open in tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (a.target === '_blank' || a.download) return
      try {
        const url = new URL(a.href, location.href)
        if (url.origin !== location.origin) return
        // No-op for same page (including hash-only changes)
        if (url.pathname + url.search === location.pathname + location.search) return
        clearTimeout(failsafeRef.current)
        setLoading(true)
        // 10-second failsafe in case navigation fails silently
        failsafeRef.current = setTimeout(() => setLoading(false), 10_000)
      } catch {
        // ignore malformed hrefs
      }
    }
    document.addEventListener('click', onLinkClick)
    return () => document.removeEventListener('click', onLinkClick)
  }, [])

  if (!loading) return null

  return (
    <div className="fixed top-0 inset-x-0 h-0.5 z-50 overflow-hidden pointer-events-none">
      <div className="h-full bg-green-500 w-2/3 animate-[nav-loading_1.2s_linear_infinite]" />
    </div>
  )
}
