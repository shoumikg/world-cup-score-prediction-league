import { teamDisplay } from '@/lib/flags'

// Renders a team name (flag + label) as a link to that team's filtered
// schedule (/?team=…), matching the clickable behaviour of group names and
// player names elsewhere in the app. Falls back to a plain span for an unknown
// team — a knockout placeholder like "Winner M37" isn't a real team, so it
// isn't linkable.
export function TeamLink({
  team,
  fallback = 'TBD',
  className = '',
}: {
  team: string | null | undefined
  fallback?: string
  className?: string
}) {
  const label = teamDisplay(team ?? null, fallback)
  if (!team) return <span className={className}>{label}</span>
  return (
    <a
      href={`/?team=${encodeURIComponent(team)}`}
      className={`hover:underline decoration-gray-300 ${className}`}
    >
      {label}
    </a>
  )
}
