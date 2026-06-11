export default function GuidePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-1">How to play</h1>
        <p className="text-sm text-gray-500">Everything you need to know to use WC26 Predictor.</p>
      </div>

      <Section title="The basics">
        <p>
          Before each match kicks off, you predict the final scoreline — not just who wins, but the
          exact score. After kickoff, your prediction locks and you can see what everyone else picked.
          Once the admin enters the real result, your prediction gets colour-coded based on how close
          you were.
        </p>
      </Section>

      <Section title="Submitting a prediction">
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>Open the Schedule page (the default page after logging in).</li>
          <li>Find the match you want to predict — matches are grouped by date in IST.</li>
          <li>Type the home score in the left box and the away score in the right box.</li>
          <li>Hit <strong>Save</strong>. You'll see a brief "Saved!" confirmation, and a
              <strong> ✓ Recorded</strong> marker stays next to the match.</li>
          <li>You can come back and change it any number of times before kickoff. If you edit
              the numbers, the marker disappears until you save again — if you see
              ✓ Recorded, what's in the boxes is what counts.</li>
        </ol>
        <Note>
          The <strong>Jump to next match →</strong> link at the top of the page scrolls straight
          to the first match that hasn't kicked off yet — useful during the group stage when there
          are many matches per day.
        </Note>
      </Section>

      <Section title="Prediction deadline">
        <p>
          Each day at <strong>9:00 PM IST</strong>, predictions for all matches taking place the
          following calendar day (IST) are locked. The deadline applies to the entire day's
          fixtures at once — not per match. The input boxes disappear and are replaced by your
          saved pick (shown as a chip). If you haven't submitted anything by then, you get no
          score for those matches.
        </p>
        <p className="mt-2">
          The deadline is shown in each day's section header on the Schedule page — it turns red
          once it has passed. It is enforced in the database, not just the UI, so there is no way
          to submit a late prediction.
        </p>
      </Section>

      <Section title="Colour coding">
        <p className="mb-3">After the admin enters a result, your prediction chip changes colour:</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-semibold text-xs w-24 text-center shrink-0">2 – 1</span>
            <span><strong>Exact score</strong> — you predicted the precise scoreline.</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold text-xs w-24 text-center shrink-0">1 – 0</span>
            <span><strong>Correct result</strong> — you got the winner (or draw) right but not the exact score.</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-xs w-24 text-center shrink-0">0 – 2</span>
            <span><strong>Wrong</strong> — the result went the other way.</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold text-xs w-24 text-center shrink-0">2 – 1</span>
            <span><strong>No result yet</strong> — the match has kicked off but the score hasn't been entered yet.</span>
          </div>
        </div>
      </Section>

      <Section title="Seeing other people's picks">
        <p>
          Other players' predictions are hidden until a match kicks off. The moment kickoff passes,
          everyone's picks for that match become visible to everyone else. This prevents copying —
          you can only compare after the fact.
        </p>
        <Note>
          The Schedule page shows your own predictions; the <strong>Leaderboard</strong> shows
          how everyone's predictions have scored so far.
        </Note>
      </Section>

      <Section title="Knockout matches">
        <p>
          Knockout matches (Round of 32 onwards) start with placeholder labels like
          <em> "Winner C"</em> or <em>"Runner-up F"</em> instead of team names. Once the group
          stage determines who qualified, the admin fills in the actual teams — after which you can
          predict those matches just like any other.
        </p>
        <p className="mt-2">
          You can predict a knockout match as soon as the teams are filled in, up until its kickoff.
        </p>
      </Section>

      <Section title="Times and dates">
        <p>
          All times on this site are shown in <strong>IST (India Standard Time, UTC+5:30)</strong>.
          Matches are grouped by their IST calendar date, so a match at midnight IST appears under
          the day it falls in India — even if it's still the previous calendar day elsewhere.
        </p>
      </Section>

      <Section title="Group tables">
        <p>
          The <strong>Groups</strong> page shows live standings for all 12 groups — matches played,
          wins, draws, losses, goals and points. It updates automatically as results are entered.
          Top two in each group qualify for the Round of 32, along with the eight best
          third-placed teams.
        </p>
      </Section>

      <Section title="Your profile">
        <p>
          Tap your username in the top-right corner to open your profile. There you can set a
          <strong> display name</strong> — that's what other players see instead of your username —
          and optionally pick a favourite team to show its flag next to your name.
        </p>
      </Section>

      <Section title="Found a bug? Have a suggestion?">
        <p>
          Use the <strong>💬 Feedback</strong> button at the bottom-right of any page — it works
          even before you log in. Type your message (up to 1000 characters) and hit Send.
        </p>
      </Section>

      <Section title="Scoring and leaderboard">
        <p>
          The <strong>Leaderboard</strong> page shows every player's running tally in the same
          three categories: exact scores (green), correct results (yellow), and wrong picks
          (red). It's sorted by exact scores first, then correct results. Missed predictions
          don't count against you — they simply score nothing.
        </p>
        <p className="mt-2">
          Players appear by their <strong>display name</strong> (set on your profile page),
          never their username. A points system may come later.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3 pb-1 border-b">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs text-gray-500 bg-gray-50 border rounded px-3 py-2 leading-relaxed">
      {children}
    </p>
  )
}
