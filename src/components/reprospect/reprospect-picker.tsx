"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type PoolRow = { name: string; instagramUrl: string | null };

const CHUNK = 8; // matches the queue endpoint's per-request cap

function igHandle(url: string) {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : url;
}

export function ReprospectPicker({
  rows,
  query,
  total,
  pageSize,
}: {
  rows: PoolRow[];
  query: string;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queuing, setQueuing] = useState(false);

  // Debounced server-side search (the pool is thousands of rows).
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() !== query) {
        router.push(q.trim() ? `/reprospect?q=${encodeURIComponent(q.trim())}` : "/reprospect");
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.name));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) rows.forEach((r) => next.delete(r.name));
      else rows.forEach((r) => next.add(r.name));
      return next;
    });

  const handleQueue = async () => {
    const names = Array.from(selected);
    if (names.length === 0) return;
    if (
      !window.confirm(
        `Queue ${names.length} brand(s) for re-prospecting? The bot will resolve each site, find contacts, and email them. This can take a moment per brand.`
      )
    )
      return;
    setQueuing(true);
    let queued = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < names.length; i += CHUNK) {
        const chunk = names.slice(i, i + CHUNK);
        const res = await fetch("/api/reprospect/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: chunk }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error ?? "Queueing failed.");
          break;
        }
        const data = await res.json();
        queued += data.queued ?? 0;
        skipped += data.skipped ?? 0;
        toast.message(`Queued ${queued}… (${Math.min(i + CHUNK, names.length)}/${names.length} processed)`);
      }
      toast.success(`Done — ${queued} queued for re-prospecting${skipped ? `, ${skipped} skipped` : ""}.`);
      setSelected(new Set());
      router.refresh();
    } finally {
      setQueuing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search the prior-prospect pool…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-neutral-500">
          Showing {rows.length}
          {total > pageSize && !query ? ` of ${total.toLocaleString()} (search to narrow)` : ""}
          {selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </span>
        <Button
          className="ml-auto"
          size="sm"
          onClick={handleQueue}
          disabled={queuing || selected.size === 0}
        >
          {queuing ? "Queuing…" : `Queue for re-prospecting (${selected.size})`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label="Select all shown" />
              </TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Instagram</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-neutral-400">
                  No matching prior prospects.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.name)}
                      onCheckedChange={() => toggle(r.name)}
                      aria-label={`Select ${r.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    {r.instagramUrl ? (
                      <a
                        href={r.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {igHandle(r.instagramUrl)}
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
