"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
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
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
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
