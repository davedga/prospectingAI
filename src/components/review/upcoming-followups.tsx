"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";

type UpcomingFollowUp = {
  id: string;
  sequenceStep: number;
  scheduledFor: string | null;
  contact: { name: string; company: { name: string } };
};

export function UpcomingFollowUps({ items }: { items: UpcomingFollowUp[] }) {
  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const router = useRouter();

  const handleDraftNow = async (id: string) => {
    setDrafting((s) => new Set(s).add(id));
    const res = await fetch(`/api/emails/${id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Draft generation failed.");
      setDrafting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      return;
    }
    toast.success("Draft ready — see it above once the page refreshes.");
    router.refresh();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contact</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Step</TableHead>
          <TableHead>Scheduled for</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.contact.name}</TableCell>
            <TableCell>{item.contact.company.name}</TableCell>
            <TableCell>
              <Badge variant="outline">Follow-up {item.sequenceStep}</Badge>
            </TableCell>
            <TableCell className="text-neutral-500">
              {item.scheduledFor
                ? new Date(item.scheduledFor).toLocaleDateString()
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant="outline"
                disabled={drafting.has(item.id)}
                onClick={() => handleDraftNow(item.id)}
              >
                {drafting.has(item.id) ? "Drafting..." : "Draft now"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
