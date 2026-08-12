"use client";

import { useState } from "react";
import { DraftTable, type DraftTableEmail } from "@/components/drafting/draft-table";

export function ReviewSection({
  initialEmails,
}: {
  initialEmails: DraftTableEmail[];
}) {
  const [emails, setEmails] = useState(initialEmails);

  return (
    <DraftTable
      emails={emails}
      onChange={(updated) =>
        setEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      }
    />
  );
}
