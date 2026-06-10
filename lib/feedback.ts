export const FEEDBACK_MAX_LENGTH = 1000

export function validateFeedback(
  raw: string | null | undefined
): { message: string } | { error: string } {
  const message = (raw ?? '').trim()
  if (!message) return { error: 'Feedback cannot be empty.' }
  if (message.length > FEEDBACK_MAX_LENGTH)
    return { error: `Feedback must be ${FEEDBACK_MAX_LENGTH} characters or fewer.` }
  return { message }
}
