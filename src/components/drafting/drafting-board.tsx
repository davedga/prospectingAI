"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DraftTable, type DraftEmailBase, type DraftTableEmail } from "./draft-table";

type ContactWithEmail = {
  id: string;
  name: string;
  title: string;
  companyName: string;
  email: DraftEmailBase | null;
};

export function DraftingBoard({
  contacts,
  autoDraft,
}: {
  contacts: ContactWithEmail[];
  autoDraft: boolean;
}) {
  const [emails, setEmails] = useState<Record<string, DraftEmailBase | null>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, c.email]))
  );
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [isBulkApproving, startBulkApprove] = useTransition();
  const [isGeneratingAll, startGenerateAll] = useTransition();
  const hasAutoStarted = useRef(false);

  const generateMissing = (isAuto: boolean) => {
    const missing = contacts.filter((c) => !emails[c.id]);
    if (missing.length === 0) return Promise.resolve();

    return (async () => {
      for (const contact of missing) {
        setGenerating((s) => new Set(s).add(contact.id));
        try {
          const res = await fetch(`/api/contacts/${contact.id}/draft-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ auto: isAuto }),
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
    generateMissing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft]);

  const readyEmails: DraftTableEmail[] = contacts
    .map((contact) => {
      const email = emails[contact.id];
      if (!email) return null;
      return {
        ...email,
        contactName: contact.name,
        contactTitle: contact.title,
        companyName: contact.companyName,
      };
    })
    .filter((e): e is DraftTableEmail => e !== null);

  const draftEmails = readyEmails.filter((e) => e.status === "draft");
  const missingCount = contacts.filter((c) => !emails[c.id]).length;
  const generatingContacts = contacts.filter((c) => generating.has(c.id));
  const queuedContacts = contacts.filter(
    (c) => !emails[c.id] && !generating.has(c.id)
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

  const handleGenerateAll = () => {
    startGenerateAll(() => generateMissing(false));
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
            {isGeneratingAll ? "Drafting..." : `Draft All (${missingCount})`}
          </Button>
        )}
        {draftEmails.length > 0 && (
          <Button onClick={handleApproveAll} disabled={isBulkApproving}>
            {isBulkApproving ? "Approving..." : `Approve All (${draftEmails.length})`}
          </Button>
        )}
      </div>

      {(generatingContacts.length > 0 || queuedContacts.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {generatingContacts.map((c) => (
            <span
              key={c.id}
              className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500"
            >
              Drafting for {c.name} ({c.companyName})...
            </span>
          ))}
          {queuedContacts.map((c) => (
            <span
              key={c.id}
              className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500"
            >
              {autoDraft ? "Queued" : "Not drafted yet"}: {c.name} ({c.companyName})
            </span>
          ))}
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing waiting on a draft right now.
        </p>
      ) : (
        <DraftTable
          emails={readyEmails}
          onChange={(updated) =>
            setEmails((prev) => ({ ...prev, [updated.contactId]: updated }))
          }
        />
      )}
    </div>
  );
}
