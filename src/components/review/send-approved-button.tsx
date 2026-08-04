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
      const succeeded = data.results.filter((r: { ok: boolean }) => r.ok).length;
      const failed = data.results.length - succeeded;
      toast.success(
        failed > 0 ? `Sent ${succeeded}, ${failed} failed.` : `Sent ${succeeded} email(s).`
      );
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
