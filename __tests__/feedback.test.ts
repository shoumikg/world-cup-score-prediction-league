import { describe, it, expect } from 'vitest'
import { validateFeedback, FEEDBACK_MAX_LENGTH } from '../lib/feedback'

describe('validateFeedback', () => {
  it('rejects empty input', () => {
    expect(validateFeedback('')).toEqual({ error: 'Feedback cannot be empty.' })
  })

  it('rejects whitespace-only input', () => {
    expect(validateFeedback('   \n\t  ')).toEqual({ error: 'Feedback cannot be empty.' })
  })

  it('rejects null and undefined', () => {
    expect(validateFeedback(null)).toEqual({ error: 'Feedback cannot be empty.' })
    expect(validateFeedback(undefined)).toEqual({ error: 'Feedback cannot be empty.' })
  })

  it('trims surrounding whitespace from valid input', () => {
    expect(validateFeedback('  great app!  ')).toEqual({ message: 'great app!' })
  })

  it('accepts a message of exactly the max length', () => {
    const max = 'x'.repeat(FEEDBACK_MAX_LENGTH)
    expect(validateFeedback(max)).toEqual({ message: max })
  })

  it('rejects a message one character over the max length', () => {
    const over = 'x'.repeat(FEEDBACK_MAX_LENGTH + 1)
    expect(validateFeedback(over)).toEqual({
      error: `Feedback must be ${FEEDBACK_MAX_LENGTH} characters or fewer.`,
    })
  })

  it('measures length after trimming (padded max-length input passes)', () => {
    const max = 'x'.repeat(FEEDBACK_MAX_LENGTH)
    expect(validateFeedback(`  ${max}  `)).toEqual({ message: max })
  })
})
