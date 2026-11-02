"use client";

import { useMemo, useState } from "react";
import type { EngagementRow } from "@/lib/reports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Filter = "all" | "genuine" | "opened" | "replied" | "clicked" | "noopen";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All sent" },
  { value: "genuine", label: "Genuine opens (≥60s)" },
  { value: "opened", label: "Any open" },
  { value: "replied", label: "Replied" },
  { value: "clicked", label: "Clicked" },
  { value: "noopen", label: "No opens" },
];

const RENDER_CAP = 200;

function gmailSearchHref(email: string) {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${email} OR to:${email}`)}`;
}

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EngagementTable({
  rows,
  exportHref,
}: {
  rows: EngagementRow[];
  exportHref?: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "genuine" && !r.genuineOpen) return false;
      if (filter === "opened" && r.openCount === 0) return false;
      if (filter === "replied" && !r.repliedAt) return false;
      if (filter === "clicked" && !r.clicked) return false;
      if (filter === "noopen" && r.openCount > 0) return false;
      if (!needle) return true;
      return (
        r.company.toLowerCase().includes(needle) ||
        r.person.toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  const shown = filtered.slice(0, RENDER_CAP);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search brand, person, or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-72"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {filtered.length.toLocaleString()} match
            {filtered.length === 1 ? "" : "es"}
            {filtered.length > RENDER_CAP ? ` (showing ${RENDER_CAP})` : ""}
          </span>
          {exportHref ? (
            <a
              href={exportHref}
              className="inline-flex items-center gap-1 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-foreground/10 transition-colors hover:ring-foreground/30"
            >
              ↓ CSV
            </a>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Step</TableHead>
              <TableHead className="text-right">Opens</TableHead>
              <TableHead className="text-right">First open</TableHead>
              <TableHead className="text-right">Last open</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Gmail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-neutral-400">
                  No matching emails.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((r) => (
                <TableRow key={r.emailId}>
                  <TableCell>
                    <span className="font-medium">{r.person}</span>
                    <span className="block text-xs text-neutral-500">{r.title}</span>
                    {r.email ? (
                      <span className="block text-xs text-neutral-400">{r.email}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.company}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.step === 0 ? "First" : `FU ${r.step}`}
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={
                      r.openTimestamps.length
                        ? r.openTimestamps.map((d) => fmt(d)).join("\n")
                        : undefined
                    }
                  >
                    {r.openCount}
                    {r.genuineOpen ? (
                      <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500 whitespace-nowrap">
                    {fmt(r.firstOpenAt)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500 whitespace-nowrap">
                    {fmt(r.lastOpenAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-wrap justify-center gap-1">
                      {r.repliedAt ? (
                        <Badge variant="default" className="text-[10px]">
                          Replied
                        </Badge>
                      ) : null}
                      {r.clicked ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Clicked
                        </Badge>
                      ) : null}
                      {!r.repliedAt && !r.clicked && r.openCount === 0 ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.email ? (
                      <a
                        href={gmailSearchHref(r.email)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
