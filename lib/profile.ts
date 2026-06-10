import { TEAM_NAMES } from './flags'

export const DISPLAY_NAME_MAX = 30

export function validateDisplayName(
  raw: string | null | undefined
): { value: string } | { error: string } {
  const value = (raw ?? '').trim()
  if (!value) return { error: 'Display name cannot be empty.' }
  if (value.length > DISPLAY_NAME_MAX)
    return { error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.` }
  return { value }
}

// Empty selection is allowed (stored as null); otherwise must be a real team
export function validateFavoriteTeam(
  raw: string | null | undefined
): { value: string | null } | { error: string } {
  const value = (raw ?? '').trim()
  if (!value) return { value: null }
  if (!TEAM_NAMES.includes(value)) return { error: 'Unknown team.' }
  return { value }
}
