"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function NewRunForm() {
  const [brief, setBrief] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleGenerate = () => {
    if (!brief.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/discovery/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: brief }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Discovery generation failed.");
        return;
      }
      const data = await res.json();
      router.push(`/discovery/${data.discoveryRunId}`);
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        placeholder='e.g. "beauty brands, $3-30M revenue, US, not already scaled on TikTok Shop"'
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        disabled={isPending}
      />
      <Button onClick={handleGenerate} disabled={isPending}>
        {isPending ? "Generating..." : "Generate"}
      </Button>
    </div>
  );
}
