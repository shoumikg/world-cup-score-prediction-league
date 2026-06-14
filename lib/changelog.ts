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
]

export const LATEST_CHANGELOG_ID = Math.max(0, ...CHANGELOG.map(e => e.id))

export function unseenEntries(seenId: number): ChangelogEntry[] {
  return CHANGELOG.filter(e => e.id > seenId)
}
