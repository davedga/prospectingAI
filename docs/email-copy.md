# Outreach email copy — what the bot actually sends

_Last updated: 2026-11-02 (rev 2). Source of truth: `src/lib/drafting.ts` (first touch) and `src/lib/followup-content.ts` (follow-ups). Hand-written from those templates so the team can review the real copy without reading code._

## How the copy is produced

Every email is **generated per-contact by Claude**, following a fixed structure + a long list of hard constraints (`CLAIMS_DISCIPLINE` in `drafting.ts`). The samples below are **representative** — exact words vary per brand, but the shape, length, and framing are locked.

Guardrails enforced on every email:

- **Simple, not over-personalized.** The first touch is 3 short paragraphs with no hero-SKU / press / retail detail. The follow-ups are short, human nudges — **no brand-specific stat-digging and no hero-SKU name-drops** (changed 2026-11-02).
- Never fabricate a number; prospect-specific figures (GMV, revenue, COGS) only if already in the record. The only general number allowed is DGA's own track-record range.
- One observation, one question mark per email. Greeting always "Hey [First name],". Subject: **"[Brand] x DGA (TikTok Shop)"**.
- **Timing words auto-adjust to the season** (changed 2026-11-02) — the copy no longer hardcodes "Q4". It pulls the current phrasing from `currentTimeframe()`, so today (November) it says "Heading into the holidays" / "this holiday season"; in Jul–Sep it says "Ahead of Q4" / "going into Q4"; off-season it falls back to "this year".
- A signature block is appended automatically (configurable in Settings) — the model writes only up to "Best,".

## The sequence

First touch + up to three follow-ups (`sequenceLength` in Settings). Samples below use the **current (November)** timing words.

---

### Touch 0 — First touch (~60–80 words)

**Case A — not on TikTok Shop (senior contact):**

> Subject: Nodpod x DGA (TikTok Shop)
>
> Hey Sarah,
>
> I'm David - my team and I partner with TikTok to help identify and scale brands to six and seven-figure monthly GMV on TikTok Shop.
>
> Heading into the holidays, I've been looking closely at the Sleep and Wellness category and noticed Nodpod isn't on the platform.
>
> Is scaling on Shop currently on your radar this holiday season?
>
> Best,

**Case B — on TikTok Shop, real GMV figure known (junior contact):**

> Hey Jordan,
>
> I'm David - my team and I partner with TikTok to help identify and scale brands on TikTok Shop.
>
> Heading into the holidays, I've been looking closely at the Skincare category and noticed Osea is doing $150k in monthly GMV on the platform.
>
> Is scaling to six and seven-figure monthly GMV currently on the team's radar this holiday season?
>
> Best,

**Case C — on TikTok Shop, no GMV figure known:**

> Hey Alex,
>
> I'm David - my team and I partner with TikTok to help identify and scale brands to six and seven-figure monthly GMV on TikTok Shop.
>
> Heading into the holidays, I've been looking closely at the Coffee category and noticed Cometeer is on the platform.
>
> Is scaling on Shop something the team's explored this holiday season?
>
> Best,

---

### Touch 1 — Follow-up 1 (~70–90 words) — _simplified 2026-11-02_

No researched stat / competitor name-drop anymore — just a plain credibility line and a soft ask.

> Hey Sarah,
>
> A little more context on why I reached out:
>
> For the right brands, we've seen TikTok Shop become a meaningful six and seven-figure monthly revenue channel in a matter of months.
>
> Heading into the holidays, I think Nodpod has a real opportunity to establish itself in this category, and I'd love to walk you through how we'd approach it.
>
> Would you be open to a quick 15 minutes this Thursday or Friday?
>
> Best,

---

### Touch 2 — Follow-up 2 (~35–50 words)

> Hey Sarah,
>
> We're onboarding our last few clients this holiday season.
>
> We're confident TikTok Shop can become a meaningful channel for Nodpod this holiday season.
>
> Is scaling on TikTok Shop a priority for the team this holiday season?
>
> Best,

---

### Touch 3 — Final touch (~45–65 words)

**Junior/operational contact (ends with a routing question):**

> Hey Sarah,
>
> Last note from me on this.
>
> I think Nodpod has a meaningful opportunity to scale on TikTok Shop this holiday season, and I'd love to connect with the team to discuss how we'd approach it.
>
> If this falls outside your scope, is there someone else on the team who would be better to speak with about this opportunity?
>
> Best,

**Senior/economic buyer (ends with a statement, no question):**

> ...If this sits with someone else on your team, I'd love the opportunity to discuss this with them.

---

## Changelog — 2026-11-02

- **Q4 wording fixed.** "Ahead of Q4" / "going into Q4" are no longer hardcoded; all timing phrases now come from `currentTimeframe()` and stay correct year-round.
- **Follow-ups simplified.** Follow-up 1 dropped the mandatory researched stat and the separate GMV line; it's now a short credibility + soft ask (~70–90 words vs 100–130). Hero-SKU context removed from the follow-up prompt entirely.
- **Frontend sync.** The Drafting board now has a "Regenerate drafts to current copy" button that re-drafts stale draft-status emails with the current templates (approved/sent emails are left untouched), so what's shown matches what sends.
