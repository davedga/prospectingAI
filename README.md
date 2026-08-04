# DGA TikTok Shop Prospecting App

Internal admin tool for Dallas Global Agency's TikTok Shop brand-prospecting
pipeline: Discovery → Prospecting → Drafting → Approval → Sending →
Follow-ups. Single-admin, no public signup.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Prisma 7 +
Postgres · NextAuth (Auth.js) v5 credentials login · Anthropic API (Claude) ·
Apollo.io · Resend.

## Local development

```bash
npm install
```

Copy `.env.example` to `.env` and fill in every value (see below), then:

```bash
npx prisma migrate dev
npm run hash-password -- 'your-password-here'   # copy the printed hash into ADMIN_PASSWORD_HASH
npm run seed                                     # creates the Admin row + default Settings
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. `npx prisma dev` spins up a local one for development. |
| `NEXTAUTH_SECRET` | Random string (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` | `http://localhost:3000` locally; your production URL on Vercel. |
| `ADMIN_EMAIL` | The one admin login. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash — generate with `npm run hash-password -- '<password>'`. |
| `ANTHROPIC_API_KEY` | Used for discovery generation and email drafting. |
| `APOLLO_API_KEY` | Used for org/people search and enrichment in `lib/apollo.ts`. |
| `RESEND_API_KEY` | Used to send approved emails. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Verifies the inbound webhook signature (svix). |
| `CRON_SECRET` | Vercel Cron sends this as `Authorization: Bearer <value>`. |

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
   `npx prisma migrate deploy`. Then seed the admin user the same way as
   local (`npm run hash-password` + `npm run seed`, with prod `DATABASE_URL`
   and `ADMIN_*` vars set in your shell).
6. **Deploy.** Vercel picks up `vercel.json`, which registers the daily
   `/api/cron/send-followups` cron job automatically.
7. **Connect the Resend inbound webhook**: in the Resend dashboard, set the
   inbound webhook URL to `https://<your-domain>/api/webhooks/resend-inbound`
   and set the signing secret to match `RESEND_INBOUND_WEBHOOK_SECRET`.
8. **Verify the cron job** is registered under the Vercel project's Cron
   Jobs tab, and that `CRON_SECRET` matches what's in your env vars (Vercel
   sends it automatically as a Bearer token to routes protected this way).

## Notes

- Nothing sends automatically — every email (first touch and follow-ups,
  unless auto-approve is turned on in Settings) waits in the Review Queue
  for explicit approval.
- The exclusion list is checked (fuzzy, case-insensitive) on every Discovery
  run before a company can reach `selected` status.
