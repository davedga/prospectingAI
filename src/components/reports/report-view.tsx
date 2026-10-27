import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  pct,
  type FunnelCounts,
  type ReportData,
  type CountRow,
  type SegmentRow,
  type PersonActivity,
} from "@/lib/reports";

const DATASETS: { key: string; label: string }[] = [
  { key: "brands", label: "Brands" },
  { key: "contacts", label: "Contacts" },
  { key: "emails", label: "Emails" },
  { key: "cmos", label: "CMOs" },
  { key: "cmo-brands", label: "CMO client brands" },
  { key: "ig-leads", label: "IG DM leads" },
];

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-neutral-400">{sub}</p> : null}
    </div>
  );
}

function FunnelTable({ counts }: { counts: FunnelCounts }) {
  const stages: { label: string; value: number; rate?: string }[] = [
    { label: "Sent", value: counts.sent },
    {
      label: "Delivered",
      value: counts.delivered,
      rate: `${pct(counts.delivered, counts.sent)}%`,
    },
    {
      label: "Opened (genuine ≥60s)",
      value: counts.genuineOpened,
      rate: `${pct(counts.genuineOpened, counts.sent)}%`,
    },
    {
      label: "Opened (raw pixel)",
      value: counts.opened,
      rate: `${pct(counts.opened, counts.sent)}%`,
    },
    {
      label: "Replied",
      value: counts.replied,
      rate: `${pct(counts.replied, counts.sent)}%`,
    },
    {
      label: "Bounced",
      value: counts.bounced,
      rate: `${pct(counts.bounced, counts.sent)}%`,
    },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Stage</TableHead>
          <TableHead className="text-right">Count</TableHead>
          <TableHead className="text-right">% of sent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stages.map((s) => (
          <TableRow key={s.label}>
            <TableCell>{s.label}</TableCell>
            <TableCell className="text-right tabular-nums">{s.value}</TableCell>
            <TableCell className="text-right tabular-nums text-neutral-500">
              {s.rate ?? "—"}
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="text-neutral-500">
            First touches / follow-ups
          </TableCell>
          <TableCell className="text-right tabular-nums" colSpan={2}>
            {counts.firstTouches} / {counts.followUps}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function CountTable({
  rows,
  head,
}: {
  rows: CountRow[];
  head: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{head}</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={2} className="text-neutral-400">
              No data yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.slice(0, 15).map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-right tabular-nums">{r.count}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function SegmentTable({ rows, head }: { rows: SegmentRow[]; head: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{head}</TableHead>
          <TableHead className="text-right">Companies</TableHead>
          <TableHead className="text-right">Replied</TableHead>
          <TableHead className="text-right">Reply %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-neutral-400">
              No data yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.slice(0, 15).map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.companies}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.replied}
              </TableCell>
              <TableCell className="text-right tabular-nums text-neutral-500">
                {pct(r.replied, r.companies)}%
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function PeopleTable({ people }: { people: PersonActivity[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Company</TableHead>
          <TableHead className="text-right">Step</TableHead>
          <TableHead className="text-right">When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-neutral-400">
              No activity yet.
            </TableCell>
          </TableRow>
        ) : (
          people.map((p, i) => (
            <TableRow key={`${p.company}-${p.name}-${i}`}>
              <TableCell>
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-neutral-500">{p.title}</span>
              </TableCell>
              <TableCell>{p.company}</TableCell>
              <TableCell className="text-right tabular-nums">
                {p.step === 0 ? "First" : `FU ${p.step}`}
              </TableCell>
              <TableCell className="text-right text-xs text-neutral-500">
                {p.at ? p.at.toLocaleDateString() : "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? (
          <p className="text-xs text-neutral-500">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

export function ReportView({
  data,
  exportHref,
  readOnly = false,
}: {
  data: ReportData;
  /** Builds the CSV download URL for a dataset (lets the share page append its token). */
  exportHref: (dataset: string) => string;
  readOnly?: boolean;
}) {
  const { counts, overall } = data;
  const latest = data.trend[data.trend.length - 1];
  const prev = data.trend.length > 1 ? data.trend[data.trend.length - 2] : null;
  const delta = (cur?: number, old?: number) =>
    cur != null && old != null
      ? `${cur - old >= 0 ? "+" : ""}${Math.round((cur - old) * 10) / 10}`
      : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Prospecting Report
          </h1>
          <p className="text-sm text-neutral-500">
            All tracks — brand email outreach, fractional CMOs, and IG DM leads.
            Generated {data.generatedAt.toLocaleString()}.
            {readOnly ? " Read-only share view." : ""}
          </p>
        </div>
        <Badge variant="secondary">
          {latest ? `As of ${latest.date}` : "Live"}
        </Badge>
      </div>

      {/* One-click downloads */}
      <div className="flex flex-wrap gap-2">
        {DATASETS.map((d) => (
          <a
            key={d.key}
            href={exportHref(d.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
              "bg-card ring-1 ring-foreground/10 transition-colors hover:ring-foreground/30"
            )}
          >
            ↓ {d.label} CSV
          </a>
        ))}
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Brands prospected" value={counts.brandsProspected} sub={`${counts.brands} total in DB`} />
        <Tile label="Contacts (POCs)" value={counts.contacts} />
        <Tile
          label="Fractional CMOs"
          value={counts.cmos}
          sub={`${counts.cmosWithEmail} with email`}
        />
        <Tile
          label="IG DM leads"
          value={counts.igLeads}
          sub={`${counts.igContacted} DM'd`}
        />
        <Tile
          label="Open rate (genuine)"
          value={`${pct(overall.genuineOpened, overall.sent)}%`}
          sub={delta(latest?.openRate, prev?.openRate) ? `${delta(latest?.openRate, prev?.openRate)} vs prev` : undefined}
        />
        <Tile
          label="Reply rate"
          value={`${pct(overall.replied, overall.sent)}%`}
          sub={delta(latest?.replyRate, prev?.replyRate) ? `${delta(latest?.replyRate, prev?.replyRate)} vs prev` : undefined}
        />
      </div>

      {/* Email funnel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Email funnel — all">
          <FunnelTable counts={overall} />
        </Section>
        <Section title="New outreach">
          <FunnelTable counts={data.byStream.new} />
        </Section>
        <Section title="Re-prospect">
          <FunnelTable counts={data.byStream.reprospect} />
        </Section>
      </div>

      {/* Per-step */}
      <Section
        title="By sequence step"
        description="Sent / opened per touch (step 0 = first email, then follow-ups). Replies are per-contact — see the funnel and 'who's replying'."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Step</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Opened</TableHead>
              <TableHead className="text-right">Open %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.byStep.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-neutral-400">
                  No emails sent yet.
                </TableCell>
              </TableRow>
            ) : (
              data.byStep.map((s) => (
                <TableRow key={s.step}>
                  <TableCell>
                    {s.step === 0 ? "First email" : `Follow-up ${s.step}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.sent}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.opened}</TableCell>
                  <TableCell className="text-right tabular-nums text-neutral-500">
                    {pct(s.opened, s.sent)}%
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      {/* Targeting insights */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="By segment / archetype"
          description="What kind of brands are being targeted, and which convert."
        >
          <SegmentTable rows={data.bySegment} head="Archetype" />
        </Section>
        <Section
          title="By scale (est. revenue)"
          description="Revenue band of targeted brands, and which convert."
        >
          <SegmentTable rows={data.byScale} head="Est. revenue" />
        </Section>
      </div>

      {/* Who's engaging */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Who's replying" description="Most recent replies (follow-ups stop on reply).">
          <PeopleTable people={data.repliers} />
        </Section>
        <Section title="Who's opening" description="Most recent opens.">
          <PeopleTable people={data.openers} />
        </Section>
      </div>

      {/* CMO track */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="CMOs by status">
          <CountTable rows={data.cmoByStatus} head="Status" />
        </Section>
        <Section title="CMOs by fit">
          <CountTable rows={data.cmoByFit} head="Fit" />
        </Section>
        <Section title="CMO client brands" description={`${counts.cmoBrands} vetted brands`}>
          <div className="p-2 text-sm text-neutral-500">
            {counts.cmoBrands} vetted client brands linked to CMOs. Download the
            full list with the “CMO client brands CSV” button above.
          </div>
        </Section>
      </div>

      {/* IG track */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="IG leads by category">
          <CountTable rows={data.igByCategory} head="Category" />
        </Section>
        <Section title="IG leads by TikTok Shop status">
          <CountTable rows={data.igByTtsStatus} head="TTS status" />
        </Section>
        <Section title="IG leads by Cam DM status">
          <CountTable rows={data.igByDmStatus} head="DM status" />
        </Section>
      </div>
    </div>
  );
}
