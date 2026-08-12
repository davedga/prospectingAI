"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SendApprovedButton({ count }: { count: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSend = () => {
    startTransition(async () => {
      const res = await fetch("/api/emails/send-approved", { method: "POST" });
      if (!res.ok) {
        toast.error("Send failed.");
        return;
      }
      const data = await res.json();
      const results = data.results as { emailId: string; ok: boolean; error?: string }[];
      const succeeded = results.filter((r) => r.ok).length;
      const failures = results.filter((r) => !r.ok);

      if (failures.length > 0) {
        toast.error(
          `Sent ${succeeded}, ${failures.length} failed: ${failures[0].error ?? "unknown error"}`,
          { duration: 15000 }
        );
      } else {
        toast.success(`Sent ${succeeded} email(s).`);
      }
      router.refresh();
    });
  };

  if (count === 0) return null;

  return (
    <Button onClick={handleSend} disabled={isPending}>
      {isPending ? "Sending..." : `Send Approved (${count})`}
    </Button>
  );
}
