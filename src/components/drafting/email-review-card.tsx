"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type ReviewEmail = {
  id: string;
  contactId: string;
  subject: string;
  body: string;
  claimsNotToMake: string | null;
  status: string;
  sequenceStep: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  approved: "default",
  sent: "secondary",
  cancelled: "destructive",
};

export function EmailReviewCard({
  email,
  contactName,
  contactTitle,
  companyName,
  onUpdated,
}: {
  email: ReviewEmail;
  contactName: string;
  contactTitle: string;
  companyName: string;
  onUpdated?: (email: ReviewEmail) => void;
}) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [status, setStatus] = useState(email.status);
  const [regenNote, setRegenNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isFinal = status !== "draft";

  const handleRegenerate = () => {
    startTransition(async () => {
      const res = await fetch(`/api/emails/${email.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackNote: regenNote }),
      });
      if (!res.ok) {
        toast.error("Regeneration failed.");
        return;
      }
      const updated = await res.json();
      setSubject(updated.subject);
      setBody(updated.body);
      setRegenNote("");
      onUpdated?.(updated);
      toast.success("Draft regenerated.");
    });
  };

  const handleApprove = () => {
    startTransition(async () => {
      const res = await fetch(`/api/emails/${email.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        toast.error("Approve failed.");
        return;
      }
      const updated = await res.json();
      setStatus(updated.status);
      onUpdated?.(updated);
      toast.success("Approved.");
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const res = await fetch(`/api/emails/${email.id}/reject`, { method: "POST" });
      if (!res.ok) {
        toast.error("Reject failed.");
        return;
      }
      const updated = await res.json();
      setStatus(updated.status);
      onUpdated?.(updated);
      toast.success("Rejected.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              {contactName} — {contactTitle}
            </CardTitle>
            <p className="text-xs text-neutral-500">{companyName}</p>
          </div>
          <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-500">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isFinal}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-500">Body</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            disabled={isFinal}
          />
        </div>
        {email.claimsNotToMake && (
          <p className="text-xs text-neutral-500">
            <span className="font-medium">Left unclaimed:</span>{" "}
            {email.claimsNotToMake}
          </p>
        )}

        {!isFinal && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              placeholder="Quick note for regenerate (optional)"
              value={regenNote}
              onChange={(e) => setRegenNote(e.target.value)}
              className="max-w-xs"
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
      </CardContent>
    </Card>
  );
}
