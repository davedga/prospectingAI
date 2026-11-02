"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Statuses that can still be pushed into outreach (not yet contacted).
const SELECTABLE = new Set(["proposed", "rejected", "dormant"]);

function downloadCsv(filename: string, rows: BrandRow[]) {
  const cols: { key: keyof BrandRow; header: string }[] = [
    { key: "name", header: "Brand" },
    { key: "domain", header: "Domain" },
    { key: "status", header: "Status" },
    { key: "archetype", header: "Archetype" },
    { key: "priority", header: "Priority" },
    { key: "contactCount", header: "Contacts" },
    { key: "sentCount", header: "Sent" },
    { key: "openedCount", header: "Opened" },
    { key: "clickedCount", header: "Clicked" },
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    cols.map((c) => c.header).join(",") +
    "\n" +
    rows.map((r) => cols.map((c) => esc(r[c.key])).join(",")).join("\n") +
    "\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type BrandRow = {
  id: string;
  name: string;
  domain: string;
  status: string;
  archetype: string | null;
  priority: string | null;
  discoveryPrompt: string | null;
  contactCount: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  selected: "Selected",
  rejected: "Rejected",
  prospecting: "Prospecting",
  prospected: "Prospected",
  outreach_active: "Outreach active",
  dormant: "Dormant",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  proposed: "outline",
  selected: "secondary",
  rejected: "destructive",
  prospecting: "secondary",
  prospected: "default",
  outreach_active: "default",
  dormant: "outline",
};

function linkFor(brand: BrandRow) {
  if (brand.status === "proposed" || brand.status === "rejected") return null;
  return `/companies/${brand.id}/prospecting`;
}

export function BrandsTable({ brands }: { brands: BrandRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSending, startSending] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    return brands.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) || b.domain.toLowerCase().includes(q)
      );
    });
  }, [brands, search, statusFilter]);

  const selectedRows = brands.filter((b) => selected.has(b.id));
  const sendableIds = selectedRows.filter((b) => SELECTABLE.has(b.status)).map((b) => b.id);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((b) => selected.has(b.id));
  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((b) => next.delete(b.id));
      else filtered.forEach((b) => next.add(b.id));
      return next;
    });

  const handleExport = () => {
    const rows = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(`dga-brands-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const handleSendToOutreach = () => {
    if (sendableIds.length === 0) return;
    if (
      !window.confirm(
        `Send ${sendableIds.length} brand(s) into automated outreach? The bot will prospect contacts and email them.`
      )
    )
      return;
    startSending(async () => {
      const res = await fetch("/api/companies/bulk-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: sendableIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to queue brands.");
        return;
      }
      const data = await res.json();
      toast.success(
        `${data.queued} brand(s) queued for outreach${data.skipped ? `, ${data.skipped} already in outreach` : ""}.`
      );
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or domain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value ?? "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex items-center text-xs text-neutral-500">
          {filtered.length} of {brands.length}
          {selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            ↓ Export {selectedRows.length > 0 ? `selected (${selectedRows.length})` : "all"}
          </Button>
          <Button
            size="sm"
            onClick={handleSendToOutreach}
            disabled={isSending || sendableIds.length === 0}
          >
            {isSending ? "Queuing…" : `Send to outreach (${sendableIds.length})`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAllFiltered}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Archetype</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Discovered via</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((brand) => {
              const href = linkFor(brand);
              const nameCell = (
                <>
                  <div className="font-medium">{brand.name}</div>
                  <div className="text-xs text-neutral-500">{brand.domain}</div>
                </>
              );
              return (
                <TableRow key={brand.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(brand.id)}
                      onCheckedChange={() => toggle(brand.id)}
                      aria-label={`Select ${brand.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {nameCell}
                      </Link>
                    ) : (
                      nameCell
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[brand.status] ?? "outline"}>
                      {STATUS_LABELS[brand.status] ?? brand.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{brand.archetype ?? "—"}</TableCell>
                  <TableCell>
                    {brand.priority && <Badge variant="outline">{brand.priority}</Badge>}
                  </TableCell>
                  <TableCell>{brand.contactCount}</TableCell>
                  <TableCell className="text-xs text-neutral-600">
                    {brand.sentCount === 0 ? (
                      "—"
                    ) : (
                      <span>
                        {brand.sentCount} sent
                        {" · "}
                        <span className={brand.openedCount > 0 ? "text-emerald-600 font-medium" : ""}>
                          {brand.openedCount} opened
                        </span>
                        {" · "}
                        <span className={brand.clickedCount > 0 ? "text-emerald-600 font-medium" : ""}>
                          {brand.clickedCount} clicked
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-neutral-500">
                    {brand.discoveryPrompt ?? "—"}
                  </TableCell>
                  <TableCell className="text-neutral-500">
                    {new Date(brand.updatedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
