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

- **Send window** (`sendWindowStartHour`/`sendWindowEndHour`/`sendTimezone`,
  checked in `src/lib/send-window.ts`) — automated sends only actually fire
  via the Gmail API within this local-time window. Vercel's free Hobby plan
  only fires the daily cron once, so in practice this mostly decides whether
  that single run is allowed to send at all; if it lands outside the window,
  drafted/approved emails wait for the next run. For real intra-day spread,
  either upgrade to Vercel Pro (more frequent cron) or point a free external
  scheduler (e.g. cron-job.org) at `/api/cron/send-followups` hourly with
  the `Authorization: Bearer <CRON_SECRET>` header.
- **Daily limits** (`dailyDiscoveryLimit`/`dailyProspectLimit`/
  `dailyEmailLimit`, checked in `src/lib/daily-limits.ts`) — caps brands
  auto-discovered, POCs auto-prospected, and emails auto-sent per calendar
  day in `sendTimezone`. Enforced inside `src/lib/auto-pipeline.ts` and the
  cron's follow-up loop.
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
