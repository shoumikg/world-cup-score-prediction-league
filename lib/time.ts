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
