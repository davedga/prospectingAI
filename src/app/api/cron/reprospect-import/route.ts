import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeDomain, isRealDomain } from "@/lib/domain";
import { classifyDecisionRole } from "@/lib/prospecting";
import { REPROSPECT_MARKER, REPROSPECT_ANGLES, angleVariant } from "@/lib/reprospect";

export const maxDuration = 60;

// Loads a scored batch of re-prospect brands (built offline from the
// prior-prospects list — see scripts/score-reprospect.ts) as companies +
// contacts ready for the automation cycle to draft and send. Each batch is
// one DiscoveryRun tagged with REPROSPECT_MARKER.
//
// Never re-contacts anyone the app already knows: brands whose domain is
// already a Company, and people whose email is already a Contact, are skipped.

const contactSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  email: z.string().email(),
  emailStatus: z.string().nullish(),
  linkedin: z.string().nullish(),
  location: z.string().nullish(),
  apolloId: z.string().nullish(),
  selected: z.boolean(),
  angle: z.enum(REPROSPECT_ANGLES as [string, ...string[]]).nullish(),
});

const brandSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  ttsStatus: z.string().nullish(),
  estRevenue: z.string().nullish(),
  category: z.string().nullish(),
  heroSku: z.string().nullish(),
  score: z.number(),
  tier: z.string(),
  trigger: z.string(),
  signal: z.string().nullish(),
  priorListRow: z.number().nullish(),
  contacts: z.array(contactSchema).min(1),
});

const bodySchema = z.object({
  label: z.string().min(1),
  dryRun: z.boolean().optional(),
  brands: z.array(brandSchema).min(1),
});

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { label, dryRun, brands } = parsed.data;

  const domains = brands.map((b) => normalizeDomain(b.domain));
  const emails = brands.flatMap((b) => b.contacts.map((c) => c.email.toLowerCase()));

  const [existingCompanies, existingContacts] = await Promise.all([
    prisma.company.findMany({
      where: { OR: domains.map((d) => ({ domain: { equals: d, mode: "insensitive" as const } })) },
      select: { domain: true },
    }),
    prisma.contact.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { email: true },
    }),
  ]);
  const knownDomains = new Set(existingCompanies.map((c) => normalizeDomain(c.domain)));
  const knownEmails = new Set(existingContacts.map((c) => c.email!.toLowerCase()));

  const skipped: { name: string; reason: string }[] = [];
  const toCreate: (typeof brands)[number][] = [];
  for (const brand of brands) {
    const domain = normalizeDomain(brand.domain);
    if (!isRealDomain(domain)) {
      skipped.push({ name: brand.name, reason: "invalid domain" });
      continue;
    }
    if (knownDomains.has(domain)) {
      skipped.push({ name: brand.name, reason: "domain already in the app" });
      continue;
    }
    const contacts = brand.contacts.filter((c) => !knownEmails.has(c.email.toLowerCase()));
    if (!contacts.some((c) => c.selected)) {
      skipped.push({ name: brand.name, reason: "selected contact already in the app" });
      continue;
    }
    knownDomains.add(domain);
    toCreate.push({ ...brand, domain, contacts });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldCreateCompanies: toCreate.length,
      wouldCreateContacts: toCreate.reduce((n, b) => n + b.contacts.length, 0),
      wouldSelect: toCreate.reduce((n, b) => n + b.contacts.filter((c) => c.selected).length, 0),
      skipped,
    });
  }

  const run = await prisma.discoveryRun.create({
    data: { prompt: `${REPROSPECT_MARKER} ${label}` },
  });

  // Sequential, in the order given — the automation cycle drafts re-prospects
  // oldest-created first, so input order (score order) is send order.
  let contactsCreated = 0;
  for (const brand of toCreate) {
    const thesis = [
      brand.signal ? `Signal: ${brand.signal}` : null,
      `Re-prospect score ${brand.score} (tier ${brand.tier}), trigger: ${brand.trigger}.`,
      brand.category ? `Category: ${brand.category}.` : null,
      brand.priorListRow != null ? `Prior-prospects list row ${brand.priorListRow + 1}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await prisma.company.create({
      data: {
        name: brand.name,
        domain: brand.domain,
        websiteUrl: `https://${brand.domain}`,
        ttsStatus: brand.ttsStatus ?? null,
        estRevenue: brand.estRevenue ?? null,
        heroSku: brand.heroSku ?? null,
        accountThesis: thesis,
        status: "prospected",
        discoveryRunId: run.id,
        contacts: {
          create: brand.contacts.map((c) => ({
            name: c.name,
            title: c.title,
            email: c.email,
            emailStatus: c.emailStatus ?? "verified",
            linkedin: c.linkedin ?? null,
            location: c.location ?? null,
            apolloId: c.apolloId ?? null,
            decisionRole: classifyDecisionRole(c.title),
            selected: c.selected,
            variant: c.selected ? angleVariant((c.angle ?? "control") as (typeof REPROSPECT_ANGLES)[number]) : null,
          })),
        },
      },
    });
    contactsCreated += brand.contacts.length;
  }

  return NextResponse.json({
    discoveryRunId: run.id,
    companiesCreated: toCreate.length,
    contactsCreated,
    skipped,
  });
}
