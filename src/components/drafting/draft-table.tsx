"use client";

import { Fragment, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DraftEmailBase = {
  id: string;
  contactId: string;
  subject: string;
  body: string;
  claimsNotToMake: string | null;
  status: string;
  sequenceStep: number;
};

export type SequenceChainStep = {
  sequenceStep: number;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
};

export type DraftTableEmail = DraftEmailBase & {
  contactName: string;
  contactTitle: string;
  companyName: string;
  sequenceChain?: SequenceChainStep[];
  sequenceLength?: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  approved: "default",
  sent: "secondary",
  cancelled: "destructive",
};

export function DraftTable({
  emails,
  onChange,
}: {
  emails: DraftTableEmail[];
  onChange?: (email: DraftTableEmail) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyNoteToAll = async (sourceId: string, note: string) => {
    const targets = emails.filter((e) => e.id !== sourceId && e.status === "draft");
    if (targets.length === 0) return;

    toast.info(`Regenerating ${targets.length} more draft(s) with that note...`);
    let succeeded = 0;
    for (const target of targets) {
      const res = await fetch(`/api/emails/${target.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackNote: note }),
      });
      if (res.ok) {
        const updated = await res.json();
        onChange?.({ ...target, ...updated });
        succeeded += 1;
      }
    }
    toast.success(`Applied to ${succeeded} of ${targets.length} draft(s).`);
  };

  if (emails.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing here.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Contact</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Step</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((email) => (
            <DraftTableRow
              key={email.id}
              email={email}
              isExpanded={expanded.has(email.id)}
              onToggle={() => toggle(email.id)}
              onUpdated={(updated) => onChange?.(updated)}
              onApplyToAll={(note) => applyNoteToAll(email.id, note)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DraftTableRow({
  email,
  isExpanded,
  onToggle,
  onUpdated,
  onApplyToAll,
}: {
  email: DraftTableEmail;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdated: (email: DraftTableEmail) => void;
  onApplyToAll: (note: string) => void;
}) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [regenNote, setRegenNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const isFinal = email.status !== "draft";

  const handleRegenerate = async () => {
    setIsPending(true);
    const res = await fetch(`/api/emails/${email.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackNote: regenNote }),
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Regeneration failed.");
      return;
    }
    const updated = await res.json();
    setSubject(updated.subject);
    setBody(updated.body);
    onUpdated({ ...email, ...updated });

    const note = regenNote;
    setRegenNote("");

    if (note.trim()) {
      toast.success("Draft regenerated.", {
        action: {
          label: "Apply to all pending drafts",
          onClick: () => onApplyToAll(note),
        },
      });
    } else {
      toast.success("Draft regenerated.");
    }
  };

  const handleApprove = async () => {
    setIsPending(true);
    const res = await fetch(`/api/emails/${email.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Approve failed.");
      return;
    }
    const updated = await res.json();
    onUpdated({ ...email, ...updated });
    toast.success("Approved.");
    router.refresh();
  };

  const handleReject = async () => {
    setIsPending(true);
    const res = await fetch(`/api/emails/${email.id}/reject`, { method: "POST" });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Reject failed.");
      return;
    }
    const updated = await res.json();
    onUpdated({ ...email, ...updated });
    toast.success("Rejected.");
    router.refresh();
  };

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-neutral-50"
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="size-4 text-neutral-400" />
          ) : (
            <ChevronRight className="size-4 text-neutral-400" />
          )}
        </TableCell>
        <TableCell>
          <div className="font-medium">{email.contactName}</div>
          <div className="text-xs text-neutral-500">{email.contactTitle}</div>
        </TableCell>
        <TableCell>{email.companyName}</TableCell>
        <TableCell className="max-w-xs truncate text-neutral-600">
          {subject || <span className="text-neutral-400">(not drafted)</span>}
        </TableCell>
        <TableCell>
          <Badge variant="outline">
            {email.sequenceStep === 0 ? "First" : `Follow-up ${email.sequenceStep}`}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[email.status] ?? "outline"}>
            {email.status}
          </Badge>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className={cn("bg-neutral-50/60 p-4")}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">
                  Subject
                </label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isFinal}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">
                  Body
                </label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={7}
                  disabled={isFinal}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {email.sequenceChain && email.sequenceChain.length > 0 && (
                <FollowUpChain
                  chain={email.sequenceChain}
                  sequenceLength={email.sequenceLength ?? email.sequenceChain.length}
                />
              )}
              {email.claimsNotToMake && (
                <p className="text-xs text-neutral-500">
                  <span className="font-medium">Left unclaimed:</span>{" "}
                  {email.claimsNotToMake}
                </p>
              )}
              {!isFinal && (
                <div
                  className="flex flex-wrap items-center gap-2 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    placeholder="Quick note for regenerate (optional)"
                    value={regenNote}
                    onChange={(e) => setRegenNote(e.target.value)}
                    className="max-w-xs bg-white"
                    disabled={isPending}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={isPending}
                  >
                    Regenerate
                  </Button>
                  <Button size="sm" onClick={handleApprove} disabled={isPending}>
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReject}
                    disabled={isPending}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

const CHAIN_STATUS_STYLE: Record<string, string> = {
  sent: "bg-neutral-900 text-white border-neutral-900",
  replied: "bg-emerald-600 text-white border-emerald-600",
  approved: "bg-primary text-primary-foreground border-primary",
  draft: "border-neutral-300 text-neutral-500",
  cancelled: "border-neutral-200 text-neutral-300 line-through",
};

function FollowUpChain({
  chain,
  sequenceLength,
}: {
  chain: SequenceChainStep[];
  sequenceLength: number;
}) {
  const steps = Array.from({ length: sequenceLength }, (_, i) => {
    const existing = chain.find((c) => c.sequenceStep === i);
    return existing ?? { sequenceStep: i, status: "not scheduled", scheduledFor: null, sentAt: null };
  });

  const wasCancelled = chain.some((c) => c.status === "cancelled");
  const hasReply = chain.some((c) => c.status === "replied");

  return (
    <div className="space-y-1.5 rounded-md border border-neutral-200 bg-white p-3">
      <p className="text-xs font-medium text-neutral-500">Sequence plan</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, i) => (
          <div key={step.sequenceStep} className="flex items-center gap-1.5">
            <div
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                CHAIN_STATUS_STYLE[step.status] ?? "border-neutral-300 text-neutral-500"
              )}
              title={
                step.sentAt
                  ? `Sent ${new Date(step.sentAt).toLocaleDateString()}`
                  : step.scheduledFor
                    ? `Scheduled ${new Date(step.scheduledFor).toLocaleDateString()}`
                    : undefined
              }
            >
              <span className="font-medium">
                {i === 0 ? "First" : `Follow-up ${i}`}
              </span>
              <span className="ml-1 text-[0.7rem] opacity-80">
                {step.sentAt
                  ? new Date(step.sentAt).toLocaleDateString()
                  : step.scheduledFor
                    ? new Date(step.scheduledFor).toLocaleDateString()
                    : step.status === "not scheduled"
                      ? "not yet"
                      : step.status}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="text-neutral-300">→</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[0.7rem] text-neutral-400">
        {hasReply
          ? "They replied — sequence stopped."
          : wasCancelled
            ? "Remaining touches were cancelled."
            : "Stops automatically the moment they reply."}
      </p>
    </div>
  );
}
