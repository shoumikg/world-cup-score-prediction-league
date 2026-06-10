# WC26 Predictor — FIFA World Cup 2026 Mini League

A private score-prediction league for friends. Built with Next.js 16 + Supabase + Tailwind, deployed on Vercel.

## How it works

- Friends sign up with a username + password + invite code
- Everyone predicts the scoreline of any match **before kickoff** (predictions lock automatically at kickoff)
- Admins enter final scores; predicted scores get colour-coded (green = exact, yellow = correct result, red = wrong)
- After kickoff you can see everyone else's picks too

---

## Deploy in 5 steps

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. **CRITICAL — disable email confirmation before anyone signs up:**
   Go to **Authentication → Email → Confirm email** → turn it **OFF**
   (If you skip this, signups will silently fail with no useful error.)

### 2. Run the migrations

In the Supabase SQL Editor, paste and run these files **in order**:

1. `supabase/migrations/0001_schema.sql` — creates all tables, RLS policies, and the auth trigger
2. `supabase/migrations/0002_seed_matches.sql` — inserts all 104 matches
3. `supabase/migrations/0003_feedback.sql` — creates the feedback table

### 3. Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New → Project → import your repo
3. Set these **Environment Variables** in Vercel:

   | Variable | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
   | `LEAGUE_INVITE_CODE` | Make up any passphrase, e.g. `worldcup2026` |

4. Deploy → wait ~1 minute

### 4. Make yourself admin

After signing up on the live site, run this in the Supabase SQL Editor:

```sql
update profiles set is_admin = true where username = 'your_username';
```

### 5. Share with friends

Share the site URL + the invite code (`LEAGUE_INVITE_CODE`) with your friends.

---

## Admin guide

Once you're an admin, the **Admin** link appears in the navbar.

### Entering results

After a match kicks off, go to Admin → "Enter / Update Results", type the final score, hit Save.

### Reading feedback

The 💬 Feedback button (every page, including login) saves messages to the `feedback` table. Read them in **Supabase → Table Editor → feedback**. Logged-in submissions carry the username; pre-login ones say `guest`.

### Filling in knockout teams

When you know who qualified for a knockout match, go to Admin → "Fill Knockout Teams", enter both team names. You can also adjust the kickoff time if it changed.

---

## Scoring

Colour coding is shown after results are entered:

| Result | Colour |
|---|---|
| Exact scoreline | Green |
| Correct match outcome (win/draw/loss) | Yellow |
| Wrong | Red |

A points leaderboard can be added later — all the data is already stored.

---

## Account recovery

Accounts use the synthetic email `username@league.local`, which can't receive emails. So Supabase's built-in "reset password" flow won't work — don't try it.

### Friend forgot their password

Go to **Supabase → Authentication → Users**, find their entry, click the three-dot menu → **Send password recovery** won't work — instead use **"Reset password"** directly in the dashboard to set a new one, then tell them via any channel.

Alternatively, from the Supabase SQL Editor:

```sql
-- returns the auth UUID you need
select id from auth.users where email = 'theirusername@league.local';
```

Then in **Authentication → Users** → find by that UUID → set a new password.

> **Do not delete the user to "start fresh"** — the `profiles` table and `predictions` table both cascade-delete when the auth user is removed. They'd lose every prediction they've saved.

### Invite code was leaked / shared too widely

Change `LEAGUE_INVITE_CODE` in Vercel → **Settings → Environment Variables**, then redeploy (Vercel → **Deployments → Redeploy**). Existing accounts are unaffected — the code is only checked at signup.

### Why password reset emails won't work

The `@league.local` addresses are synthetic and go nowhere. Supabase will silently "send" the email with no error, but it never arrives. All password changes must go through the Supabase dashboard.

---

## Local development

```bash
cp .env.example .env.local   # fill in your Supabase credentials
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The site redirects to /login — sign up with your invite code.

---

## Tech

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (Postgres + Auth + Row Level Security)
- **Vercel** (hosting, free tier)
- Prediction locks enforced by Postgres RLS (`kickoff_utc > now()`) — the UI cannot bypass them
