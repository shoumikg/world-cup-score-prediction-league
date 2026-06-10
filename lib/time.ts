const IST = 'Asia/Kolkata'

export function formatKickoffIST(utc: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utc))
}

export function formatDateIST(utc: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(utc))
}

// Returns 'YYYY-MM-DD' in IST for grouping matches by day
export function istDateKey(utc: string): string {
  const d = new Date(utc)
  // IST = UTC + 5:30
  const offset = 5 * 60 + 30
  const local = new Date(d.getTime() + offset * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

export function isKickedOff(utc: string): boolean {
  return new Date(utc) <= new Date()
}

// setTimeout delays above 2^31 - 1 ms (~24.8 days) overflow and fire
// immediately, which would wrongly lock far-future matches
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/**
 * Delay for scheduling a client-side UI lock at kickoff.
 * 'past'  — kickoff already passed, lock immediately
 * number  — schedule the lock this many ms from now
 * null    — too far out for a timer; the page will be reloaded long before
 */
export function kickoffTimerDelay(
  utc: string,
  now: number = Date.now()
): number | 'past' | null {
  const ms = new Date(utc).getTime() - now
  if (ms <= 0) return 'past'
  if (ms > MAX_TIMEOUT_MS) return null
  return ms
}
