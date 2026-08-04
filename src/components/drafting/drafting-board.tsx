"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmailReviewCard, type ReviewEmail } from "./email-review-card";

type ContactWithEmail = {
  id: string;
  name: string;
  title: string;
  email: ReviewEmail | null;
};

export function DraftingBoard({
  companyName,
  contacts,
}: {
  companyName: string;
  contacts: ContactWithEmail[];
}) {
  const [emails, setEmails] = useState<Record<string, ReviewEmail | null>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, c.email]))
  );
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [isBulkApproving, startBulkApprove] = useTransition();

  useEffect(() => {
    const missing = contacts.filter((c) => !emails[c.id]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const contact of missing) {
        if (cancelled) return;
        setGenerating((s) => new Set(s).add(contact.id));
        try {
          const res = await fetch(`/api/contacts/${contact.id}/draft-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const email = await res.json();
            if (!cancelled) setEmails((prev) => ({ ...prev, [contact.id]: email }));
          } else {
            const data = await res.json().catch(() => null);
            toast.error(data?.error ?? `Drafting failed for ${contact.name}.`);
          }
        } finally {
          setGenerating((s) => {
            const next = new Set(s);
            next.delete(contact.id);
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftEmails = Object.values(emails).filter(
    (e): e is ReviewEmail => !!e && e.status === "draft"
  );

  const handleApproveAll = () => {
    startBulkApprove(async () => {
      for (const email of draftEmails) {
        const res = await fetch(`/api/emails/${email.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: email.subject, body: email.body }),
        });
        if (res.ok) {
          const updated = await res.json();
          setEmails((prev) => ({ ...prev, [updated.contactId]: updated }));
        }
      }
      toast.success("All drafts approved.");
    });
  };

  return (
    <div className="space-y-4">
      {draftEmails.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleApproveAll} disabled={isBulkApproving}>
            {isBulkApproving ? "Approving..." : `Approve All (${draftEmails.length})`}
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {contacts.map((contact) => {
          const email = emails[contact.id];
          if (!email) {
            return (
              <div
                key={contact.id}
                className="flex items-center justify-center rounded-md border border-dashed border-neutral-300 p-8 text-sm text-neutral-500"
              >
                {generating.has(contact.id)
                  ? `Drafting for ${contact.name}...`
                  : `Queued: ${contact.name}`}
              </div>
            );
          }
          return (
            <EmailReviewCard
              key={contact.id}
              email={email}
              contactName={contact.name}
              contactTitle={contact.title}
              companyName={companyName}
              onUpdated={(updated) =>
                setEmails((prev) => ({ ...prev, [contact.id]: updated }))
              }
            />
          );
        })}
      </div>
    </div>
  );
}
