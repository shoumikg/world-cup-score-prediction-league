'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

// Reads the theme the no-flash script already applied to <html>. On the server
// this returns 'light'; the button is rendered with suppressHydrationWarning so
// the icon can correct itself on the client without a hydration error.
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  // Re-sync on mount in case this instance hydrated before the script ran, or
  // after a soft navigation.
  useEffect(() => { setTheme(currentTheme()) }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.toggle('dark', next === 'dark')
    root.style.colorScheme = next
    try { localStorage.setItem('theme', next) } catch { /* storage may be blocked */ }
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      suppressHydrationWarning
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex items-center justify-center h-6 w-6 rounded-md text-sm leading-none text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      <span suppressHydrationWarning>{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  )
}
