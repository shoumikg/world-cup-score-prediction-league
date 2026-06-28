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
          Scores are fetched automatically while matches are being played, and once a result is in,
          your prediction gets colour-coded based on how close you were.
        </p>
      </Section>

      <Section title="Submitting a prediction">
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>Open the Schedule page (the default page after logging in).</li>
          <li>Find the match you want to predict — matches are grouped by date in IST.</li>
          <li>Set each team's score with the <strong>−</strong> and <strong>+</strong> buttons —
              home team on the left, away team on the right.</li>
          <li>Hit <strong>Save</strong>. You'll see a brief "Saved!" confirmation, and a
              <strong> ✓ Recorded</strong> marker stays next to the match.</li>
          <li>You can come back and change it any number of times before the deadline. If you
              change the numbers, the marker disappears until you save again — if you see
              ✓ Recorded, the score currently shown is what counts.</li>
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
          fixtures at once — not per match. The score controls disappear and are replaced by your
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
        <p className="mb-3">Once a match has a result, your prediction chip changes colour:</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <span className="px-2 py-0.5 rounded bg-green-700 text-white font-semibold text-xs w-24 text-center shrink-0 mt-0.5">2 – 1</span>
            <span><strong>Exact score</strong> — you predicted the precise scoreline. <span className="text-gray-500">(10 pts group · 15 pts knockout)</span></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-semibold text-xs w-24 text-center shrink-0 mt-0.5">3 – 2</span>
            <span><strong>Correct goal difference</strong> — right result and right margin, wrong scoreline. (e.g. predict 2–1, actual 3–2; or predict 1–1, actual 2–2.) <span className="text-gray-500">(5 pts group · 8 pts knockout)</span></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold text-xs w-24 text-center shrink-0 mt-0.5">1 – 0</span>
            <span><strong>Correct result</strong> — right winner or draw, wrong goal difference. <span className="text-gray-500">(3 pts group · 5 pts knockout)</span></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-xs w-24 text-center shrink-0 mt-0.5">0 – 2</span>
            <span><strong>Wrong</strong> — the result went the other way. <span className="text-gray-500">(0 pts)</span></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold text-xs w-24 text-center shrink-0 mt-0.5">2 – 1</span>
            <span><strong>No result yet</strong> — the match has kicked off but no score is available yet.</span>
          </div>
        </div>
      </Section>

      <Section title="Live scores">
        <p>
          While a match is being played, its score is fetched automatically and shown on the
          Schedule page as a <strong className="inline-flex items-center gap-1 bg-green-600 text-white rounded px-1.5 py-0.5 text-xs align-middle"><span className="w-1.5 h-1.5 rounded-full bg-white" />LIVE 1–0</strong> chip.
          The page refreshes itself every minute during live matches — no need to reload. When the
          match ends, the chip turns dark and shows <strong>FT</strong> (full time),
          <strong> AET</strong> (after extra time) or <strong>PEN</strong> (decided on penalties).
        </p>
        <p className="mt-2">
          Group tables also update live — a team currently playing shows a pulsing green dot next
          to its name, and the standings already include the in-progress score.
        </p>
        <Note>
          Live scores come from an external data feed, with the admin able to enter or correct any
          result manually as a failsafe. Group predictions are scored on the final result; knockout
          predictions are scored on the 90-minute result (see <strong>Knockout matches</strong> below).
        </Note>
      </Section>

      <Section title="Seeing other people's picks">
        <p>
          Other players' predictions are hidden until the prediction deadline passes (9:00 PM IST
          the day before). Once the deadline closes, expand the <strong>Everyone's picks</strong>
          section under any locked match to see who predicted what — including who didn't submit
          a pick. This prevents copying: predictions are already locked before they're revealed.
        </p>
        <Note>
          The Schedule page shows your own predictions alongside everyone else's (after deadline).
          The <strong>Leaderboard</strong> shows how everyone's predictions have scored so far.
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
        <Note>
          Knockout predictions are scored on the scoreline at the <strong>end of 90 minutes</strong> —
          before any extra time or penalties. A match decided later shows its 90-minute score with an
          <strong> AET</strong> or <strong>PEN</strong> badge, and that 90-minute score is what your
          prediction is graded against.
        </Note>
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
          wins, draws, losses, goals and points. It updates automatically as results come in,
          including matches still in progress. Top two in each group qualify for the Round of 32,
          along with the eight best third-placed teams. Tap any team name to filter the Schedule
          page to just that team's matches.
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
        <p className="mb-3">
          Every prediction scores points once the admin enters the result. Points depend on
          how close your prediction was <em>and</em> which stage the match is in — knockout
          matches are worth more.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left font-medium px-3 py-2 border border-gray-200">Outcome</th>
                <th className="text-left font-medium px-3 py-2 border border-gray-200">Condition</th>
                <th className="text-center font-medium px-3 py-2 border border-gray-200">Group pts</th>
                <th className="text-center font-medium px-3 py-2 border border-gray-200">Knockout pts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 border border-gray-200">
                  <span className="px-1.5 py-0.5 rounded bg-green-700 text-white font-semibold">Dark green</span>
                </td>
                <td className="px-3 py-2 border border-gray-200">Exact score</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">10</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">15</td>
              </tr>
              <tr className="bg-gray-50/50 dark:bg-white/5">
                <td className="px-3 py-2 border border-gray-200">
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-semibold">Light green</span>
                </td>
                <td className="px-3 py-2 border border-gray-200">Correct GD, correct result direction, wrong score</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">5</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">8</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200">
                  <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">Yellow</span>
                </td>
                <td className="px-3 py-2 border border-gray-200">Correct result direction, wrong GD</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">3</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold">5</td>
              </tr>
              <tr className="bg-gray-50/50 dark:bg-white/5">
                <td className="px-3 py-2 border border-gray-200">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Red</span>
                </td>
                <td className="px-3 py-2 border border-gray-200">Wrong result direction</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold text-gray-400">0</td>
                <td className="px-3 py-2 border border-gray-200 text-center font-semibold text-gray-400">0</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-3">
          <strong>Bonus predictions</strong> on the Bonus page score <strong>25 pts</strong> each
          for group stage questions and <strong>30 pts</strong> each for knockout stage questions.
          The admin manually grades each bonus answer after the deadline passes — you'll see the
          result reflected in your Bonus column on the leaderboard. Missed predictions score nothing
          and don't count against you.
        </p>

        <p className="mt-2">
          The <strong>Leaderboard</strong> shows each player's tally broken down by category —
          Exact, GD, Result, Wrong, and Bonus — plus a <strong>Pts</strong> column showing your
          total. Players appear by their <strong>display name</strong>, never their username.
        </p>

        <p className="mt-2">
          <strong>Ranking and tie-breaks:</strong> players are ranked by total points. When totals
          are equal, ties are broken in this order — more <strong>bonus points</strong>, more
          <strong> exact scores</strong>, more <strong>correct GD</strong> predictions, more
          <strong> correct results</strong>, and finally fewer <strong>wrong</strong> predictions.
          Players who are equal on <em>all</em> of these share the same rank, and the next rank is
          skipped (two players tied at #1 means the next player is #3).
        </p>

        <p className="mt-2">
          Tap any other player's name on the leaderboard to open a <strong>head-to-head
          comparison</strong> of their predictions against yours, match by match.
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
