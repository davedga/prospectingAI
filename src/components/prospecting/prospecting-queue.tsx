"use client";

import { useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

type QueueCompany = {
  id: string;
  name: string;
  domain: string;
  archetype: string | null;
  priority: string | null;
  status: string;
  _count: { contacts: number };
};

type RowState = "idle" | "searching" | "enriching" | "done" | "error";

export function ProspectingQueue({ companies }: { companies: QueueCompany[] }) {
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [isBulkPending, startBulkTransition] = useTransition();
  const router = useRouter();

  const prospectOne = async (companyId: string) => {
    setRowStates((s) => ({ ...s, [companyId]: "searching" }));
    await new Promise((r) => setTimeout(r, 300));
    setRowStates((s) => ({ ...s, [companyId]: "enriching" }));

    const res = await fetch(`/api/companies/${companyId}/prospect`, {
      method: "POST",
    });
    const data = await res.json();

    if (!res.ok) {
      setRowStates((s) => ({ ...s, [companyId]: "error" }));
      toast.error(data.error ?? "Prospecting failed.");
      return;
    }

    setRowStates((s) => ({ ...s, [companyId]: "done" }));
    toast.success(`Found ${data.contactsCreated} contact(s).`);
  };

  const handleProspectAll = () => {
    const pending = companies.filter((c) => c.status === "selected");
    startBulkTransition(async () => {
      for (const company of pending) {
        await prospectOne(company.id);
      }
      router.refresh();
    });
  };

  const statusLabel = (companyId: string, status: string) => {
    const rowState = rowStates[companyId];
    if (rowState === "searching") return "Searching…";
    if (rowState === "enriching") return "Enriching…";
    if (rowState === "error") return "Error";
    if (status === "prospected" || rowState === "done") return "Prospected";
    if (status === "prospecting") return "Prospecting…";
    return "Selected";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleProspectAll} disabled={isBulkPending}>
          {isBulkPending ? "Prospecting…" : "Prospect all selected"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Archetype</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <div className="font-medium">{company.name}</div>
                  <div className="text-xs text-neutral-500">{company.domain}</div>
                </TableCell>
                <TableCell>{company.archetype}</TableCell>
                <TableCell>
                  {company.priority && <Badge variant="outline">{company.priority}</Badge>}
                </TableCell>
                <TableCell>{statusLabel(company.id, company.status)}</TableCell>
                <TableCell>{company._count.contacts}</TableCell>
                <TableCell className="text-right space-x-2">
                  {company._count.contacts > 0 ? (
                    <Link
                      href={`/companies/${company.id}/prospecting`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View contacts
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      disabled={rowStates[company.id] === "searching" || rowStates[company.id] === "enriching"}
                      onClick={() => prospectOne(company.id).then(() => router.refresh())}
                    >
                      Prospect
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
