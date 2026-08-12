"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  autoDraft,
}: {
  companyName: string;
  contacts: ContactWithEmail[];
  autoDraft: boolean;
}) {
  const [emails, setEmails] = useState<Record<string, ReviewEmail | null>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, c.email]))
  );
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [isBulkApproving, startBulkApprove] = useTransition();
  const [isGeneratingAll, startGenerateAll] = useTransition();
  const hasAutoStarted = useRef(false);

  const generateMissing = () => {
    const missing = contacts.filter((c) => !emails[c.id]);
    if (missing.length === 0) return Promise.resolve();

    return (async () => {
      for (const contact of missing) {
        setGenerating((s) => new Set(s).add(contact.id));
        try {
          const res = await fetch(`/api/contacts/${contact.id}/draft-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const email = await res.json();
            setEmails((prev) => ({ ...prev, [contact.id]: email }));
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
  };

  useEffect(() => {
    if (!autoDraft || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    generateMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft]);

  const draftEmails = Object.values(emails).filter(
    (e): e is ReviewEmail => !!e && e.status === "draft"
  );
  const missingCount = contacts.filter((c) => !emails[c.id]).length;

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

  const handleGenerateAll = () => {
    startGenerateAll(() => generateMissing());
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {!autoDraft && missingCount > 0 && (
          <Button
            variant="outline"
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
          >
            {isGeneratingAll
              ? "Generating..."
              : `Generate Drafts (${missingCount})`}
          </Button>
        )}
        {draftEmails.length > 0 && (
          <Button onClick={handleApproveAll} disabled={isBulkApproving}>
            {isBulkApproving ? "Approving..." : `Approve All (${draftEmails.length})`}
          </Button>
        )}
      </div>

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
                  : autoDraft
                    ? `Queued: ${contact.name}`
                    : `Not drafted yet: ${contact.name}`}
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
