# DGA TikTok Shop Prospecting App

Internal admin tool for Dallas Global Agency's TikTok Shop brand-prospecting
pipeline: Discovery → Prospecting → Drafting → Approval → Sending →
Follow-ups. Single-admin, no public signup.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Prisma 7 +
Postgres · NextAuth (Auth.js) v5 (email-only session, no password check) ·
Anthropic API (Claude) · Apollo.io · Gmail API for sending.

## Local development

```bash
npm install
```

Copy `.env.example` to `.env` and fill in every value (see below), then:

```bash
npx prisma migrate dev
npm run seed   # creates default Settings row
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Any email
gets you in; there's no password.

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. `npx prisma dev` spins up a local one for development. |
| `NEXTAUTH_SECRET` | Random string (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` | `http://localhost:3000` locally; your production URL on Vercel. |
| `ADMIN_EMAIL` | Used as the "from" address when sending via Gmail. |
| `ADMIN_PASSWORD_HASH` | Unused — login has no password check, kept for reference only. |
| `ANTHROPIC_API_KEY` | Used for discovery generation and email drafting. |
| `APOLLO_API_KEY` | Used for org/people search and enrichment in `lib/apollo.ts`. |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | OAuth credentials for sending as `ADMIN_EMAIL` via the Gmail API — see setup below. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Only relevant if you wire up Resend-based reply detection later — not currently connected to anything, since sending moved to Gmail. |
| `CRON_SECRET` | Vercel Cron sends this as `Authorization: Bearer <value>`. |
| `APP_URL` | Your deployed origin (e.g. `https://prospecting-ai-seven.vercel.app`), no trailing slash. Used to build the open-tracking pixel and click-tracking links embedded in sent HTML emails. Leave blank locally — tracking is skipped (no wrapping/pixel) when unset, since `localhost` URLs aren't reachable by recipients anyway. |

### Gmail API setup (for `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create
   (or select) a project.
2. **APIs & Services → Library** → search "Gmail API" → Enable.
3. **APIs & Services → OAuth consent screen** → configure it (app name, your
   email as support/developer contact). If using External + Testing mode,
   add the sending account's email under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**. Add
   `https://developers.google.com/oauthplayground` as an authorized redirect
   URI. Save the Client ID and Client Secret.
5. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground):
   - Gear icon (top right) → check "Use your own OAuth credentials" → paste
     the Client ID/Secret from step 4.
   - In the scopes list on the left, find and select
     `https://www.googleapis.com/auth/gmail.send`, then **Authorize APIs**.
   - Sign in with the Gmail/Workspace account that should send the outreach
     emails, and grant access.
   - Click **Exchange authorization code for tokens** — copy the
     **Refresh token** shown. That's `GMAIL_REFRESH_TOKEN`.
6. Set all three (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`) in your env.

No DNS/domain verification needed — you're sending through Gmail's own
infrastructure as that account.

**Known gap:** reply detection isn't wired up for Gmail-sent mail. The
`/api/webhooks/resend-inbound` route still exists but only fires if you
separately connect Resend's inbound webhook, which won't see replies to
Gmail-sent emails at all. Building real reply detection for this setup means
polling or watching the Gmail inbox via the Gmail API — not yet built.

## Deploying to Vercel

I can't complete this part for you — it requires your own Vercel and GitHub
accounts. Steps:

1. **Push this repo to GitHub** (`git remote add origin ...` then `git push`).
2. **Import the repo in Vercel** → New Project → select the repo. Vercel
   auto-detects Next.js.
3. **Add a Postgres database.** Vercel Postgres, Neon, or Supabase all work —
   copy the connection string into `DATABASE_URL` in the Vercel project's
   Environment Variables.
4. **Set every env var** from the table above in Vercel's Environment
   Variables settings (Production + Preview as needed). Set `NEXTAUTH_URL` to
   your deployed domain.
5. **Run the migration against the production database** once, e.g. from
   your machine with `DATABASE_URL` pointed at prod:
   `npx prisma migrate deploy`. Then `npm run seed` the same way, with prod
   `DATABASE_URL` set in your shell.
6. **Deploy.** Vercel picks up `vercel.json`, which registers the daily
   `/api/cron/send-followups` cron job automatically.
7. **Verify the cron job** is registered under the Vercel project's Cron
   Jobs tab, and that `CRON_SECRET` matches what's in your env vars (Vercel
   sends it automatically as a Bearer token to routes protected this way).

## Email open/click tracking

Every sent email's HTML body gets a 1x1 tracking pixel (`/api/track/open/[emailId]`)
and all `href` links get rewritten through a redirect (`/api/track/click/[emailId]`),
recording `openedAt`/`openCount`/`clickedAt`/`clickCount` on the `Email` row. Both
routes are exempted from the login middleware in `src/proxy.ts` since recipients'
mail clients hit them with no session. Aggregated counts per company show up in the
Brands page's "Engagement" column. Requires `APP_URL` to be set — see above.

## Send window, daily limits, and A/B testing

All configured in Settings (`prisma/schema.prisma`'s `Settings` model), and
all gate automated activity only — the daily cron and the autonomous-mode
toggles (`autoRunDiscovery`/`autoSelectDiscovered`/`autoProspectSelected`/
auto-send). Manual actions taken in the UI are never blocked by these.

### The 60-second ceiling (read this if daily volume looks low)

Vercel's free Hobby plan hard-kills any function (including the cron route
and the Settings-save "run now" trigger) at 60 seconds. A real daily target
— 15+ brands with retries, prospecting, 50-60+ first emails — genuinely
doesn't fit in one 60s invocation: Discovery retries alone can burn the
whole budget on slow Claude calls, starving prospecting/drafting/sending
in that same run and leaving `standingBriefAutoTunedAt` never firing.

The fix isn't "try harder in one run" — it's **many short runs**. Every
stage in `src/lib/auto-pipeline.ts` and `src/lib/run-automation-cycle.ts`
now shares one wall-clock `Deadline` (`src/lib/time-budget.ts`,
`createDeadline()`, ~50s budget leaving buffer under the 60s ceiling) and
checks it before starting each new unit of work — each retry attempt, each
company, each batch of drafts/sends. If time runs out, the stage stops
cleanly (nothing left mid-write) and whatever didn't get to run waits for
the *next* invocation. Both the cron route and the Settings page set
`maxDuration = 60` (the Hobby ceiling) so each invocation gets the most
time possible.

**This means the built-in daily Vercel cron (`vercel.json`, once/day) is
not enough on its own to hit real volume — it only gets you one slice of
progress per day.** To actually reach your daily targets, point a free
external scheduler (e.g. [cron-job.org](https://cron-job.org)) at
`/api/cron/send-followups` every 5-10 minutes with header
`Authorization: Bearer <CRON_SECRET>` — the daily total accumulates across
many short runs instead of needing one long one. Upgrading to Vercel Pro
(removes the 60s ceiling almost entirely) is the alternative if you'd
rather not run an external scheduler.

- **Send window** (`sendWindowStartHour`/`sendWindowEndHour`/`sendTimezone`,
  checked in `src/lib/send-window.ts`) — automated sends only actually fire
  via the Gmail API within this local-time window; runs outside it skip
  sending (drafting/discovery/prospecting still happen).
- **Daily limits** (`dailyDiscoveryLimit`/`dailyProspectLimit`/
  `dailyFirstEmailLimit`/`dailyFollowUpLimit`, checked in
  `src/lib/daily-limits.ts`) — caps brands auto-discovered, POCs
  auto-prospected, first emails auto-sent, and follow-ups auto-sent per
  calendar day in `sendTimezone`. First emails and follow-ups have separate
  budgets so a busy follow-up day can't crowd out new outreach volume.
- **Minimum discovery per run** (`minDiscoveryPerRun`, in
  `src/lib/run-discovery.ts`) — a soft target under the daily max above. If
  Claude's first batch comes up short of non-excluded candidates, Discovery
  automatically retries (up to 3 attempts, bounded further by the shared
  deadline above) with an auto-broadened brief (wider categories/revenue
  range/TTS-maturity), using a random sample of already-excluded brands as
  "similar profile, not these exact companies" reference material via
  `getExcludedBrandSample()`. If it's still short after retrying,
  `src/lib/discovery.ts`'s `proposeBroadenedBrief()` gets called once to
  permanently rewrite `standingDiscoveryBrief` itself (e.g. beauty → beauty
  + food & bev, a $3M revenue floor → $5M) so the next run starts from a
  wider net — capped to roughly once/day via `standingBriefAutoTunedAt` so
  it doesn't drift on every single run when an external scheduler is
  triggering every few minutes. Each auto-tune is logged as a `Feedback`
  row (scope `discovery`) for an audit trail.
- **A/B testing** (`abTestingEnabled`/`abVariantAHint`/`abVariantBHint`) —
  when on, each contact is randomly assigned variant A or B the first time
  a first-touch email is drafted for them (`Contact.variant`), reused for
  their whole sequence including follow-ups. The matching hint gets passed
  into the drafting prompt as the angle to take. Open rate per variant
  (aggregated across all contacts) shows up at the top of the Brands page.

## Notes

- Nothing sends automatically — every email (first touch and follow-ups,
  unless auto-approve is turned on in Settings) waits in the Review Queue
  for explicit approval.
- The exclusion list is checked (fuzzy, case-insensitive) on every Discovery
  run before a company can reach `selected` status.
- Login currently has no password check by design (see `src/auth.ts`) — any
  email typed in gets a session. This app has no public signup, but the
  login screen itself will let anyone with the URL in.
