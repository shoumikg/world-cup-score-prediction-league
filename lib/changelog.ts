export interface ChangelogEntry {
  id: number      // monotonic, append-only — never reorder or reuse
  date: string    // YYYY-MM-DD, display only
  title: string
  items: string[]
}

// Newest entries first. id must be strictly increasing; never reuse or reorder.
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: 1,
    date: '2026-06-13',
    title: 'Goal scorers, squads & bonus grading',
    items: [
      'Match detail pages now show goal scorers with minute and type (goal / own goal / penalty).',
      'Tap any team name to see their full squad (squad is available on the team filter view).',
      'Admin can now grade Q1 bonus answers by mapping each entry to a real player from the squad.',
    ],
  },
  {
    id: 2,
    date: '2026-06-13',
    title: 'Popular picks, form guide & more',
    items: [
      'After the prediction deadline, each match row shows how everyone split their picks (home / draw / away).',
      'Your last 5 scored predictions appear as coloured squares on the leaderboard.',
      'New head-to-head Compare page — compare your predictions side-by-side with any other player.',
      'New Bracket page showing the full knockout draw.',
    ],
  },
  {
    id: 3,
    date: '2026-06-13',
    title: 'Live bonus tracker & auto-scoring',
    items: [
      'Bonus questions now score automatically from live match data — no manual grading needed for Q2 and Q3.',
      'Q1 now shows the admin-confirmed player name instead of raw typed text.',
      'Live tracker on the Bonus page shows current leaders and each participant\'s pick status (Leading, Correct, Behind, or Pending).',
    ],
  },
  {
    id: 4,
    date: '2026-06-14',
    title: 'Live matches page',
    items: [
      'New Live page shows every match that\'s in progress right now, with the running score and minute.',
      'A pulsing green Live pill appears in the nav whenever matches are underway, and disappears when none are live.',
      'The page refreshes on its own, so scores and newly-started matches show up without a manual reload.',
    ],
  },
  {
    id: 5,
    date: '2026-06-14',
    title: 'My Stats page',
    items: [
      'New My Stats page with your current rank, total points, and a breakdown of your prediction outcomes.',
      'A points-over-time chart tracks how your score has grown, with each result coloured by how close your pick was.',
      'See your accuracy split across group and knockout stages, your bonus-answer status, and a full history of every match you predicted.',
    ],
  },
  {
    id: 6,
    date: '2026-06-14',
    title: 'Live match experience',
    items: [
      'The leaderboard, Live page, match detail, and My Stats all auto-refresh while matches are in progress — no more stale scores.',
      'Provisional ⚡ points show what you\'re earning right now against the live score, with clear "if it ends now" labels so nothing looks final until it is.',
      'Leaderboard and My Stats show projected ▲/▼ rank movement based on in-progress results vs. a finished-only baseline.',
      'Match detail lists how many points each player\'s pick is earning live; My Stats splits your tally into final, live, and pending and draws live matches as hollow pulsing dots on the chart.',
    ],
  },
  {
    id: 7,
    date: '2026-06-28',
    title: 'Knockout bonus: predict the finalists',
    items: [
      'New Finalists bonus on the Bonus page — pick the two teams you think will reach the final.',
      'Score 25 points for each correct finalist: 50 if you nail both, 25 for one, 0 for none. Graded automatically from the final.',
      'Pick any two of the Round of 32 teams — they just can’t be the same team.',
      'Picks lock at 9 PM IST the night before the first knockout match, so get them in before the Round of 32 kicks off.',
    ],
  },
  {
    id: 8,
    date: '2026-06-28',
    title: 'Knockouts scored at 90 minutes',
    items: [
      'Knockout predictions are now scored on the scoreline at the end of 90 minutes — before any extra time or penalties.',
      'A match decided later shows its 90-minute score with an AET or PEN badge; that 90-minute score is what your pick is graded against.',
      'Group matches are unchanged. The knockout bracket still advances the team that actually went through.',
    ],
  },
]

export const LATEST_CHANGELOG_ID = Math.max(0, ...CHANGELOG.map(e => e.id))

export function unseenEntries(seenId: number): ChangelogEntry[] {
  return CHANGELOG.filter(e => e.id > seenId)
}
