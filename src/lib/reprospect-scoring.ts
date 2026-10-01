// Lead scorer for re-prospecting the prior-prospects list (~8.35k brands DGA
// has already reached out to at some point). Pure functions, no DB or API
// calls — feed it the signals gathered during enrichment (Apollo org/people,
// job postings, TikTok Shop check) and it returns a qualify/disqualify
// decision, a 0-100 priority score, the "why now" trigger that drives the
// email angle, and the one or two people to target.
//
// We have no record of who was emailed or when — only the order brands were
// added to the list. That order stands in for "how long ago we reached out",
// and contact tenure stands in for "did this person likely see our first email".

export type ListOrder = "oldest-first" | "newest-first" | "unknown";

export type TtsStatus = "none" | "weak" | "active" | "strong" | "unknown";

export type CandidatePerson = {
  name: string;
  title: string;
  email?: string | null;
  emailStatus?: string | null; // "verified" | "guessed" | "unavailable" | ...
  startedCurrentRoleAt?: string | null; // ISO date
  linkedin?: string | null;
  apolloId?: string | null;
};

export type BrandSignals = {
  name: string;
  listIndex?: number; // 0-based row position in the prior-prospects list
  listSize?: number;

  domain?: string | null;
  matchConfidence?: "high" | "medium" | "low" | "none";
  sellsInUS?: boolean | null;
  isDefunct?: boolean | null;
  isPhysicalConsumerProduct?: boolean | null;
  parentCompany?: string | null;
  parentIsConglomerate?: boolean | null;

  estRevenueUsd?: number | null;
  employees?: number | null;
  headcountGrowth12mo?: number | null; // fraction, 0.15 = +15%

  category?: string | null; // free text, e.g. "skincare", "pet supplements"
  heroPriceUsd?: number | null;

  ttsStatus?: TtsStatus;
  ttsHasAgency?: boolean | null;

  openRoles?: string[]; // job posting titles
  people?: CandidatePerson[];
};

export type SizeBand = "small" | "mid" | "large" | "unknown";
export type Trigger = "new_leader" | "not_on_tts" | "weak_tts" | "hiring" | "general";
export type Framing = "first_touch" | "circling_back" | "neutral";

export type TargetContact = CandidatePerson & {
  roleBucket: RoleBucket;
  tenureMonths: number | null;
  framing: Framing;
};

export type ScoreResult = {
  name: string;
  domain: string | null;
  status: "qualified" | "disqualified" | "needs_review";
  reasons: string[]; // why disqualified / needs review
  score: number;
  breakdown: Record<string, { points: number; max: number; note: string }>;
  tier: "A" | "B" | "C" | "Hold" | "-";
  trigger: Trigger;
  sizeBand: SizeBand;
  cooldown: boolean;
  primary: TargetContact | null;
  secondary: TargetContact | null;
};

export type ScoringConfig = {
  listOrder: ListOrder;
  now: Date;
  weights: {
    newLeader: number;
    hiring: number;
    headcountGrowth: number;
    tts: number;
    fit: number;
    recency: number;
  };
  revenueRange: [number, number];
  maxEmployees: number;
  minEmployees: number;
  cooldownFraction: number; // most-recently-contacted slice of the list held back
  eligibleRows?: number; // if set, rows at or past this 0-based index are held back instead
  tiers: { A: number; B: number };
};

export const DEFAULT_CONFIG: ScoringConfig = {
  listOrder: "oldest-first", // row 1 = first brand ever contacted
  now: new Date(),
  weights: { newLeader: 25, hiring: 10, headcountGrowth: 10, tts: 25, fit: 20, recency: 10 },
  revenueRange: [2_000_000, 200_000_000],
  minEmployees: 5,
  maxEmployees: 1000,
  cooldownFraction: 0.1,
  tiers: { A: 65, B: 45 },
};

// ---------------------------------------------------------------------------
// Titles

export type RoleBucket =
  | "founder_exec" // CEO / founder / president / owner
  | "ecom_growth_leader" // VP/Head/Director of ecommerce, growth, marketing, digital
  | "marketplace_owner" // marketplaces / Amazon / social commerce / retail channels
  | "creator_social" // influencer, creator, affiliate, social media
  | "manager" // other ecommerce/marketing managers
  | "irrelevant";

const IRRELEVANT_TITLE =
  /\b(assistant|intern|coordinator|associate|recruit|talent|hr\b|human resources|people ops|accountant|finance|legal|counsel|engineer|developer|it\b|sales rep|account executive|customer (service|support|experience)|warehouse|logistics|supply chain|wholesale)\b/i;

export function classifyTitle(title: string): RoleBucket {
  const t = title.toLowerCase();
  if (/\b(ceo|chief executive|founder|co-founder|cofounder|president|owner)\b/.test(t)) {
    return "founder_exec";
  }
  if (IRRELEVANT_TITLE.test(t)) return "irrelevant";
  const senior = /\b(vp|vice president|head of|director|chief|cmo|cgo|gm|general manager)\b/.test(t);
  if (/\b(marketplace|amazon|social commerce|tiktok|retail channel|channel|omnichannel)\b/.test(t)) {
    return "marketplace_owner";
  }
  if (/\b(e-?commerce|dtc|d2c|digital|growth|marketing|brand)\b/.test(t)) {
    return senior ? "ecom_growth_leader" : "manager";
  }
  if (/\b(influencer|creator|affiliate|social media|partnerships)\b/.test(t)) {
    return "creator_social";
  }
  return senior ? "ecom_growth_leader" : "irrelevant";
}

// Who owns a new channel like TikTok Shop depends on brand size.
const TARGETING: Record<SizeBand, { primary: RoleBucket[]; secondary: RoleBucket[] }> = {
  small: {
    primary: ["founder_exec"],
    secondary: ["ecom_growth_leader", "marketplace_owner", "manager"],
  },
  mid: {
    primary: ["ecom_growth_leader", "marketplace_owner"],
    secondary: ["founder_exec", "creator_social", "manager"],
  },
  // The app's bot-filtered open data (api/stats/overview) has VPs with the best
  // genuine open rate and Directors/Managers trailing, so at larger brands a VP
  // over ecom/growth/marketplaces leads; seniority breaks ties (see rank below).
  large: {
    primary: ["ecom_growth_leader", "marketplace_owner"],
    secondary: ["founder_exec", "creator_social"],
  },
  unknown: {
    primary: ["ecom_growth_leader", "marketplace_owner", "founder_exec"],
    secondary: ["manager", "creator_social"],
  },
};

// ---------------------------------------------------------------------------
// Helpers

export function sizeBand(s: Pick<BrandSignals, "estRevenueUsd" | "employees">): SizeBand {
  if (s.estRevenueUsd != null) {
    if (s.estRevenueUsd < 10_000_000) return "small";
    if (s.estRevenueUsd < 50_000_000) return "mid";
    return "large";
  }
  if (s.employees != null) {
    if (s.employees < 30) return "small";
    if (s.employees < 150) return "mid";
    return "large";
  }
  return "unknown";
}

export function tenureMonths(startedAt: string | null | undefined, now: Date): number | null {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

// 0 = most recently contacted, 1 = contacted longest ago. null if order unknown.
export function contactAge(s: BrandSignals, order: ListOrder): number | null {
  if (order === "unknown" || s.listIndex == null || !s.listSize || s.listSize < 2) return null;
  const pos = s.listIndex / (s.listSize - 1);
  return order === "oldest-first" ? 1 - pos : pos;
}

const HIGH_FIT_CATEGORY =
  /(beauty|skin|cosmetic|makeup|hair|nail|fragrance|supplement|vitamin|wellness|protein|pet|dog|cat|snack|food|beverage|drink|coffee|tea|candy|chocolate|home|kitchen|cookware|candle|apparel|fashion|clothing|activewear|swim|lingerie|accessor|jewelry|bag|fitness|baby|kids)/i;
const MEDIUM_FIT_CATEGORY =
  /(outdoor|toy|game|gadget|electronic|phone|tech accessor|stationery|craft|garden|auto|sport|footwear|shoe|sleep|bedding)/i;

const RELEVANT_ROLE =
  /(e-?commerce|social|tiktok|marketplace|amazon|creator|influencer|affiliate|growth|digital marketing|content)/i;

function isVerified(p: CandidatePerson) {
  return !!p.email && (p.emailStatus ?? "").toLowerCase() === "verified";
}

// ---------------------------------------------------------------------------
// Contact selection

export function pickContacts(
  s: BrandSignals,
  band: SizeBand,
  cfg: Pick<ScoringConfig, "now">,
  recentlyContactedBrand: boolean
): { primary: TargetContact | null; secondary: TargetContact | null } {
  const plan = TARGETING[band];

  const candidates = (s.people ?? [])
    .filter(isVerified)
    .map((p) => {
      const roleBucket = classifyTitle(p.title);
      const tenure = tenureMonths(p.startedCurrentRoleAt, cfg.now);
      // New in role → almost certainly never saw our first email, and new
      // leaders are the ones who open new channels. Long tenure → assume they did.
      let framing: Framing = "neutral";
      if (tenure != null && tenure <= 18) framing = "first_touch";
      else if (tenure != null && tenure > 24) framing = "circling_back";
      else if (tenure == null && recentlyContactedBrand) framing = "circling_back";
      return { ...p, roleBucket, tenureMonths: tenure, framing };
    })
    .filter((p) => p.roleBucket !== "irrelevant");

  const rank = (p: TargetContact, buckets: RoleBucket[]) => {
    const bucketIdx = buckets.indexOf(p.roleBucket);
    let r = (buckets.length - bucketIdx) * 100;
    if (/\b(vp|vice president|cmo|chief)\b/i.test(p.title)) r += 30;
    else if (/\bhead of\b/i.test(p.title)) r += 20;
    else if (/\bdirector\b/i.test(p.title)) r += 10;
    if (p.tenureMonths != null && p.tenureMonths <= 12) r += 40;
    else if (p.tenureMonths != null && p.tenureMonths <= 18) r += 20;
    return r;
  };

  const best = (buckets: RoleBucket[], exclude?: TargetContact | null) =>
    candidates
      .filter((p) => buckets.includes(p.roleBucket) && p !== exclude)
      .sort((a, b) => rank(b, buckets) - rank(a, buckets))[0] ?? null;

  let primary = best(plan.primary);
  let secondary = best(plan.secondary, primary);
  if (!primary && secondary) {
    primary = secondary;
    secondary = best([...plan.primary, ...plan.secondary], primary);
  }
  return { primary, secondary };
}

// ---------------------------------------------------------------------------
// Scoring

export function scoreBrand(s: BrandSignals, config: Partial<ScoringConfig> = {}): ScoreResult {
  const cfg: ScoringConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
    tiers: { ...DEFAULT_CONFIG.tiers, ...config.tiers },
  };
  const w = cfg.weights;
  const band = sizeBand(s);
  const reasons: string[] = [];
  let reviewOnly = true;

  // --- hard filters -------------------------------------------------------
  const disqualify = (reason: string) => {
    reasons.push(reason);
    reviewOnly = false;
  };

  if (!s.domain || s.matchConfidence === "none") {
    reasons.push("Could not match brand name to a company");
  } else if (s.matchConfidence === "low") {
    reasons.push("Low-confidence company match — verify before outreach");
  }
  if (s.isDefunct) disqualify("Brand appears defunct");
  if (s.sellsInUS === false) disqualify("Not selling in the US");
  if (s.isPhysicalConsumerProduct === false) disqualify("Not a physical consumer product");
  if (s.parentIsConglomerate) {
    disqualify(`Owned by a large parent${s.parentCompany ? ` (${s.parentCompany})` : ""}`);
  }
  if (s.estRevenueUsd != null) {
    if (s.estRevenueUsd < cfg.revenueRange[0]) disqualify("Revenue below range");
    if (s.estRevenueUsd > cfg.revenueRange[1]) disqualify("Revenue above range");
  } else if (s.employees != null) {
    if (s.employees < cfg.minEmployees) disqualify("Too few employees");
    if (s.employees > cfg.maxEmployees) disqualify("Too many employees");
  }
  if (s.ttsStatus === "strong") disqualify("Already performing well on TikTok Shop");
  if (s.ttsHasAgency) disqualify("Already working with a TikTok Shop agency");

  // --- scoring ------------------------------------------------------------
  const breakdown: ScoreResult["breakdown"] = {};

  // New leader in an ecom/marketing/marketplace seat
  const leaders = (s.people ?? [])
    .filter((p) => ["ecom_growth_leader", "marketplace_owner"].includes(classifyTitle(p.title)))
    .map((p) => ({ p, t: tenureMonths(p.startedCurrentRoleAt, cfg.now) }))
    .filter((x): x is { p: CandidatePerson; t: number } => x.t != null)
    .sort((a, b) => a.t - b.t);
  const newest = leaders[0];
  let newLeaderPts = 0;
  let newLeaderNote = "No ecom/marketing leader with a known start date";
  if (newest && newest.t <= 12) {
    newLeaderPts = w.newLeader;
    newLeaderNote = `${newest.p.name} (${newest.p.title}) started ~${Math.round(newest.t)} mo ago`;
  } else if (newest && newest.t <= 18) {
    newLeaderPts = Math.round(w.newLeader * 0.5);
    newLeaderNote = `${newest.p.name} (${newest.p.title}) started ~${Math.round(newest.t)} mo ago`;
  } else if (newest) {
    newLeaderNote = `Newest leader started ~${Math.round(newest.t)} mo ago`;
  }
  breakdown.newLeader = { points: newLeaderPts, max: w.newLeader, note: newLeaderNote };

  // Hiring for relevant roles
  const relevantRoles = (s.openRoles ?? []).filter((r) => RELEVANT_ROLE.test(r));
  const tiktokRole = relevantRoles.find((r) => /tiktok|social commerce|creator|affiliate/i.test(r));
  const hiringPts = tiktokRole ? w.hiring : relevantRoles.length ? Math.round(w.hiring * 0.7) : 0;
  breakdown.hiring = {
    points: hiringPts,
    max: w.hiring,
    note: relevantRoles.length ? `Hiring: ${relevantRoles.slice(0, 3).join("; ")}` : "No relevant open roles",
  };

  // Headcount growth
  const g = s.headcountGrowth12mo;
  const growthPts =
    g == null ? 0 : g >= 0.2 ? w.headcountGrowth : g >= 0.1 ? Math.round(w.headcountGrowth * 0.6) : g > 0 ? Math.round(w.headcountGrowth * 0.3) : 0;
  breakdown.headcountGrowth = {
    points: growthPts,
    max: w.headcountGrowth,
    note: g == null ? "Unknown" : `${g >= 0 ? "+" : ""}${Math.round(g * 100)}% headcount (12 mo)`,
  };

  // TikTok Shop opportunity
  const tts = s.ttsStatus ?? "unknown";
  const ttsFactor: Record<TtsStatus, number> = { none: 1, weak: 0.75, unknown: 0.4, active: 0.2, strong: 0 };
  breakdown.tts = {
    points: Math.round(w.tts * ttsFactor[tts]),
    max: w.tts,
    note: `TikTok Shop: ${tts}`,
  };

  // Category + price-point fit
  const cat = s.category ?? "";
  const catPts = HIGH_FIT_CATEGORY.test(cat) ? 1 : MEDIUM_FIT_CATEGORY.test(cat) ? 0.5 : cat ? 0.1 : 0.3;
  const price = s.heroPriceUsd;
  const pricePts =
    price == null ? 0.5 : price >= 15 && price <= 80 ? 1 : (price >= 8 && price < 15) || (price > 80 && price <= 150) ? 0.5 : 0.1;
  breakdown.fit = {
    points: Math.round(w.fit * (catPts * 0.6 + pricePts * 0.4)),
    max: w.fit,
    note: `${cat || "category unknown"}; hero ${price != null ? `$${price}` : "price unknown"}`,
  };

  // Time since first outreach (proxy from list order)
  const age = contactAge(s, cfg.listOrder);
  breakdown.recency = {
    points: age == null ? Math.round(w.recency * 0.5) : Math.round(w.recency * age),
    max: w.recency,
    note:
      age == null
        ? "List order unknown — neutral"
        : `Contacted ${age > 0.66 ? "long ago" : age > 0.33 ? "a while ago" : "recently"} (row ${(s.listIndex ?? 0) + 1}/${s.listSize})`,
  };

  const score = Object.values(breakdown).reduce((sum, b) => sum + b.points, 0);
  const cooldown =
    cfg.eligibleRows != null && s.listIndex != null
      ? s.listIndex >= cfg.eligibleRows
      : age != null && age < cfg.cooldownFraction;

  // --- trigger: which "why now" the email opens on -------------------------
  let trigger: Trigger = "general";
  if (newLeaderPts >= Math.round(w.newLeader * 0.5)) trigger = "new_leader";
  else if (tts === "none") trigger = "not_on_tts";
  else if (tts === "weak") trigger = "weak_tts";
  else if (hiringPts > 0) trigger = "hiring";

  const { primary, secondary } = pickContacts(s, band, cfg, age != null && age < 0.33);

  const status: ScoreResult["status"] =
    reasons.length === 0 ? "qualified" : reviewOnly ? "needs_review" : "disqualified";
  if (status === "qualified" && !primary) reasons.push("No verified contact in a target role");

  const tier: ScoreResult["tier"] =
    status !== "qualified"
      ? "-"
      : cooldown
        ? "Hold"
        : score >= cfg.tiers.A
          ? "A"
          : score >= cfg.tiers.B
            ? "B"
            : "C";

  return {
    name: s.name,
    domain: s.domain ?? null,
    status,
    reasons,
    score,
    breakdown,
    tier,
    trigger,
    sizeBand: band,
    cooldown,
    primary,
    secondary,
  };
}

export function scoreBrands(list: BrandSignals[], config: Partial<ScoringConfig> = {}) {
  const tierRank = { A: 0, B: 1, C: 2, Hold: 3, "-": 4 };
  return list
    .map((s) => scoreBrand(s, config))
    .sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.score - a.score);
}
