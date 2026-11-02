"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Lead = {
  id: string;
  brand: string;
  category: string | null;
  website: string | null;
  igHandle: string | null;
  igUrl: string | null;
  ttsStatus: string | null;
  revenueBasis: string | null;
  revenueConfidence: string | null;
  usHq: string | null;
  camDmStatus: string | null;
  igVerified: boolean | null;
};

const DM_STATUSES = ["", "DM'd", "Replied", "Not a fit"];

export function IgLeadsClient({
  initialLeads,
  importedCount,
}: {
  initialLeads: Lead[];
  importedCount: number;
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [count, setCount] = useState("10");
  const [category, setCategory] = useState("");
  const [seeds, setSeeds] = useState("");
  const [generating, setGenerating] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.brand.toLowerCase().includes(q) ||
        (l.category ?? "").toLowerCase().includes(q) ||
        (l.igHandle ?? "").toLowerCase().includes(q)
    );
  }, [leads, query]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ig-leads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number(count) || 10,
          category: category.trim() || undefined,
          seedBrands: seeds.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed");
      const data = (await res.json()) as { generated: Lead[]; checked: number };
      if (data.generated.length === 0) {
        toast.message("No new verified leads this batch", {
          description: `Checked ${data.checked}. Try again or adjust the category.`,
        });
      } else {
        // Prepend, de-duping by id in case of overlap.
        setLeads((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...data.generated.filter((l) => !seen.has(l.id)), ...prev];
        });
        toast.success(`Added ${data.generated.length} verified lead${data.generated.length === 1 ? "" : "s"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function updateStatus(id: string, camDmStatus: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, camDmStatus } : l)));
    startTransition(async () => {
      const res = await fetch(`/api/ig-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camDmStatus }),
      });
      if (!res.ok) toast.error("Failed to save status");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">IG DM Leads</h1>
        <p className="text-sm text-neutral-500">
          Generate TikTok-Shop-fit brands with web-verified Instagram handles for Cam to DM.
          {importedCount > 0 ? ` ${importedCount} more leads are in the imported master list (see Reports / CSV).` : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Generate leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[100px_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="count" className="text-xs">How many</Label>
              <Input id="count" value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category" className="text-xs">Category (optional)</Label>
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. swimwear, pet, supplements" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seeds" className="text-xs">Seed brands (optional, comma-sep)</Label>
              <Input id="seeds" value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="brands to build around" />
            </div>
            <Button onClick={generate} disabled={generating}>
              {generating ? "Generating…" : leads.length ? "Generate more" : "Generate"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Each lead is web-search verified (handle confirmed or dropped). A batch takes up to a minute and spends Claude + web-search credits.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search generated leads…"
          className="max-w-xs"
        />
        <div className="flex gap-2">
          <a href="/api/ig-leads/export?source=in-app-gen" className="inline-flex items-center rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-foreground/10 hover:ring-foreground/30">↓ xlsx</a>
          <a href="/api/reports/export/ig-leads" className="inline-flex items-center rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-foreground/10 hover:ring-foreground/30">↓ CSV (all)</a>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Instagram</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>TikTok Shop</TableHead>
                <TableHead>Revenue basis</TableHead>
                <TableHead>US HQ</TableHead>
                <TableHead>Cam DM status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-neutral-400">
                    No generated leads yet. Click Generate above.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.brand}</TableCell>
                    <TableCell>
                      {l.igUrl ? (
                        <a href={l.igUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2">
                          {l.igHandle ?? l.igUrl}
                        </a>
                      ) : "—"}
                      {l.igVerified ? (
                        <Badge variant="secondary" className="ml-2 text-[10px]">verified</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-neutral-600">{l.category ?? "—"}</TableCell>
                    <TableCell className="text-xs text-neutral-600">{l.ttsStatus ?? "—"}</TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-neutral-500">
                      {l.revenueBasis ?? "—"}
                      {l.revenueConfidence ? ` (${l.revenueConfidence})` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-600">{l.usHq ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={l.camDmStatus || "none"}
                        onValueChange={(v) => updateStatus(l.id, !v || v === "none" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {DM_STATUSES.map((s) => (
                            <SelectItem key={s || "none"} value={s || "none"}>{s || "—"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
