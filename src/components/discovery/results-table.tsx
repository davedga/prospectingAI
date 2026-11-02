"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { finalizeDiscoverySelection } from "@/app/(dashboard)/discovery/[runId]/actions";

type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  heroSku: string | null;
  skuPrice: string | null;
  archetype: string | null;
  priority: string | null;
  estRevenue: string | null;
  revenueConf: string | null;
  ttsStatus: string | null;
  accountThesis: string | null;
  parentCompany: string | null;
  status: string;
  instagramUrl: string | null;
  instagramVerified: boolean | null;
  instagramCheckNote: string | null;
  exclusionCheck: { isExcluded: boolean; matchedName: string | null } | null;
};

function instagramHandle(url: string) {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : url;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  High: "default",
  "Medium-High": "default",
  Medium: "secondary",
  "Low-Medium": "outline",
  Low: "outline",
};

export function ResultsTable({
  runId,
  companies,
}: {
  runId: string;
  companies: CompanyRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter((c) => !c.exclusionCheck?.isExcluded).map((c) => c.id))
  );
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [finalized, setFinalized] = useState(companies[0]?.status !== "proposed");
  const [verifyingIg, setVerifyingIg] = useState(false);
  const router = useRouter();

  const uncheckedIg = companies.filter(
    (c) => c.instagramUrl && c.instagramVerified == null
  ).length;

  const handleVerifyIg = async () => {
    setVerifyingIg(true);
    let done = 0;
    try {
      // Each call verifies the next batch of still-unchecked IG links; loop
      // until the run has none left (or a batch comes back empty).
      for (;;) {
        const res = await fetch("/api/companies/verify-instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error ?? "Instagram verification failed.");
          break;
        }
        const data = await res.json();
        done += data.processed ?? 0;
        if (!data.processed || data.remaining === 0) {
          toast.success(`Verified ${done} Instagram link(s).`);
          break;
        }
        toast.message(`Verified ${done}… ${data.remaining} to go`);
      }
      router.refresh();
    } finally {
      setVerifyingIg(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    startTransition(async () => {
      await finalizeDiscoverySelection(runId, Array.from(selected), feedback);
      setFinalized(true);
      toast.success(
        `${selected.size} selected, ${companies.length - selected.size} rejected.`
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          {uncheckedIg > 0
            ? `${uncheckedIg} Instagram link(s) not yet verified.`
            : "All Instagram links checked."}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleVerifyIg}
          disabled={verifyingIg || uncheckedIg === 0}
        >
          {verifyingIg ? "Verifying Instagram…" : "Verify Instagram links"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Company</TableHead>
              <TableHead>Instagram</TableHead>
              <TableHead>Hero SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Archetype</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>TTS status</TableHead>
              <TableHead>Parent co.</TableHead>
              <TableHead>Thesis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow
                key={company.id}
                className={
                  company.exclusionCheck?.isExcluded ? "bg-amber-50" : undefined
                }
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(company.id)}
                    onCheckedChange={() => toggle(company.id)}
                    disabled={finalized}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{company.name}</div>
                  <div className="text-xs text-neutral-500">{company.domain}</div>
                  {company.exclusionCheck?.isExcluded && (
                    <Badge variant="destructive" className="mt-1">
                      Possible match: {company.exclusionCheck.matchedName}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-[12rem]">
                  {company.instagramUrl ? (
                    <a
                      href={company.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-blue-600 hover:underline"
                    >
                      {instagramHandle(company.instagramUrl)}
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                  {company.instagramVerified === true ? (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[10px]"
                      title={company.instagramCheckNote ?? undefined}
                    >
                      ✓ Verified
                    </Badge>
                  ) : company.instagramVerified === false ? (
                    <Badge
                      variant="destructive"
                      className="mt-1 text-[10px]"
                      title={company.instagramCheckNote ?? undefined}
                    >
                      Unconfirmed
                    </Badge>
                  ) : company.instagramUrl ? (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Unchecked
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{company.heroSku}</TableCell>
                <TableCell>{company.skuPrice}</TableCell>
                <TableCell>{company.archetype}</TableCell>
                <TableCell>
                  {company.priority && (
                    <Badge variant={PRIORITY_VARIANT[company.priority] ?? "outline"}>
                      {company.priority}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div>{company.estRevenue}</div>
                  {company.revenueConf && (
                    <div className="text-xs text-neutral-500">
                      {company.revenueConf} confidence
                    </div>
                  )}
                </TableCell>
                <TableCell>{company.ttsStatus}</TableCell>
                <TableCell>{company.parentCompany ?? "—"}</TableCell>
                <TableCell className="max-w-xs">
                  <p className="line-clamp-3 text-sm text-neutral-600">
                    {company.accountThesis}
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Feedback for future discovery runs (optional)
        </label>
        <Textarea
          placeholder='e.g. "skip #3, wrong archetype" or "avoid PE-owned brands"'
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={finalized}
          rows={3}
        />
      </div>

      <Button onClick={handleSubmit} disabled={isPending || finalized}>
        {finalized
          ? "Sent to prospecting"
          : isPending
            ? "Saving..."
            : `Send ${selected.size} to Prospecting`}
      </Button>
    </div>
  );
}
