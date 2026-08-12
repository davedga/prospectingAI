"use client";

import { useState, useTransition } from "react";
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
import { confirmContactSelection } from "@/app/(dashboard)/companies/[id]/prospecting/actions";

type ContactRow = {
  id: string;
  name: string;
  title: string;
  decisionRole: string;
  email: string | null;
  emailStatus: string | null;
  linkedin: string | null;
  selected: boolean;
};

const EMAIL_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  verified: "default",
  guessed: "secondary",
  unavailable: "outline",
};

export function ContactSelectionTable({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: ContactRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        contacts
          .filter((c) => Boolean(c.email) && (c.selected || c.decisionRole !== "Low relevance"))
          .map((c) => c.id)
      )
  );
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string, hasEmail: boolean) => {
    if (!hasEmail) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0) {
      toast.error("Select at least one contact.");
      return;
    }
    startTransition(async () => {
      await confirmContactSelection(companyId, Array.from(selected), feedback);
    });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Decision role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LinkedIn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => {
              const hasEmail = Boolean(contact.email);
              return (
              <TableRow key={contact.id} className={!hasEmail ? "opacity-60" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(contact.id)}
                    onCheckedChange={() => toggle(contact.id, hasEmail)}
                    disabled={!hasEmail}
                    title={!hasEmail ? "No email on file — can't be selected for outreach." : undefined}
                  />
                </TableCell>
                <TableCell className="font-medium">{contact.name}</TableCell>
                <TableCell>{contact.title}</TableCell>
                <TableCell>
                  <Badge variant="outline">{contact.decisionRole}</Badge>
                </TableCell>
                <TableCell>
                  <div>{contact.email ?? "No email found"}</div>
                  {contact.emailStatus && (
                    <Badge
                      variant={EMAIL_STATUS_VARIANT[contact.emailStatus] ?? "outline"}
                      className="mt-1"
                    >
                      {contact.emailStatus}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {contact.linkedin ? (
                    <a
                      href={contact.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline underline-offset-2"
                    >
                      Profile
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Feedback for future prospecting (optional)
        </label>
        <Textarea
          placeholder='e.g. "thin bench again — flag as needs manual LinkedIn sourcing"'
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
        />
      </div>

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Saving..." : `Draft Emails for ${selected.size} Selected Contacts`}
      </Button>
    </div>
  );
}
