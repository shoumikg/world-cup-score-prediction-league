// Validation for admin-entered goal-scorer events (match_events). Mirrors the
// shape produced by the openfootball backfill (lib/openfootball.ts buildEventRows)
// so manual entries and synced entries are interchangeable. Pure + tested so the
// server action stays thin and the rules live in one place.

export const PLAYER_NAME_MAX = 80
export const EVENT_TYPES = ['goal', 'own_goal', 'penalty'] as const
export type EventType = (typeof EVENT_TYPES)[number]
export const EVENT_TEAMS = ['home', 'away'] as const
export type EventTeam = (typeof EVENT_TEAMS)[number]

export interface ValidMatchEvent {
  team: EventTeam
  type: EventType
  playerName: string
  minute: number | null
  extraTime: number | null
}

// "67" → { minute: 67, extraTime: null };  "45+2" → { minute: 45, extraTime: 2 };
// empty/blank → { minute: null, extraTime: null }. Returns null on a malformed
// value so the caller can reject it (vs. silently dropping the minute).
function parseMinuteInput(
  raw: string | null | undefined
): { minute: number | null; extraTime: number | null } | null {
  if (raw == null) return { minute: null, extraTime: null }
  const s = String(raw).trim()
  if (s === '') return { minute: null, extraTime: null }
  if (!/^\d{1,3}(\+\d{1,2})?$/.test(s)) return null
  const [base, extra] = s.split('+')
  const minute = parseInt(base, 10)
  const extraTime = extra != null ? parseInt(extra, 10) : null
  // Regulation + extra time tops out around 120'; allow a little slack.
  if (minute < 0 || minute > 130) return null
  if (extraTime != null && (extraTime < 0 || extraTime > 30)) return null
  return { minute, extraTime }
}

export function validateMatchEvent(
  team: string,
  type: string,
  rawPlayerName: string,
  rawMinute: string | null | undefined
): { value: ValidMatchEvent } | { error: string } {
  if (!EVENT_TEAMS.includes(team as EventTeam))
    return { error: 'Pick which team the goal counts for.' }
  if (!EVENT_TYPES.includes(type as EventType))
    return { error: 'Invalid goal type.' }

  const playerName = (rawPlayerName ?? '').trim()
  if (!playerName) return { error: 'Enter the scorer’s name.' }
  if (playerName.length > PLAYER_NAME_MAX)
    return { error: `Name must be ${PLAYER_NAME_MAX} characters or fewer.` }

  const parsed = parseMinuteInput(rawMinute)
  if (parsed === null) return { error: 'Minute must be like 67 or 45+2.' }

  return {
    value: {
      team: team as EventTeam,
      type: type as EventType,
      playerName,
      minute: parsed.minute,
      extraTime: parsed.extraTime,
    },
  }
}
