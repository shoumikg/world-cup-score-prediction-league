'use client'

// Icons are CSS-driven by the .dark class on <html> (set by the no-flash script
// in layout.tsx before first paint). No React state or suppressHydrationWarning
// needed — the correct icon is always visible before hydration.
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement
    const isDark = root.classList.contains('dark')
    root.classList.toggle('dark', !isDark)
    root.style.colorScheme = isDark ? 'light' : 'dark'
    try { localStorage.setItem('theme', isDark ? 'light' : 'dark') } catch { /* storage may be blocked */ }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle colour scheme"
      title="Toggle colour scheme"
      className="inline-flex items-center justify-center h-6 w-6 rounded-md text-sm leading-none text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      <span className="dark:hidden" aria-hidden="true">🌙</span>
      <span className="hidden dark:inline" aria-hidden="true">☀️</span>
    </button>
  )
}
