const IST = 'Asia/Kolkata'
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // UTC+5:30

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
  const local = new Date(new Date(utc).getTime() + IST_OFFSET_MS)
  return local.toISOString().slice(0, 10)
}

export function isKickedOff(utc: string): boolean {
  return new Date(utc) <= new Date()
}

// Returns the prediction deadline for a match's IST calendar day:
// 9 PM IST on the calendar day before. All matches on the same IST day share
// one deadline — predictions for the whole day close at once.
export function predictionDeadlineUTC(kickoff_utc: string): Date {
  const DAY_MS = 24 * 60 * 60 * 1000
  const istMs = new Date(kickoff_utc).getTime() + IST_OFFSET_MS
  const istMidnight = Math.floor(istMs / DAY_MS) * DAY_MS
  return new Date(istMidnight - 3 * 60 * 60 * 1000 - IST_OFFSET_MS)
}

export function isDeadlinePassed(kickoff_utc: string): boolean {
  return predictionDeadlineUTC(kickoff_utc) <= new Date()
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
