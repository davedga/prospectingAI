"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function GeneralFeedbackBox() {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!note.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "drafting", note: note.trim() }),
      });
      if (!res.ok) {
        toast.error("Failed to save feedback.");
        return;
      }
      setNote("");
      toast.success("Saved — this will shape every future draft.");
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder='e.g. "shorter subject lines" or "never say synergy" — applies to every draft from now on, not just one contact'
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={isPending}
      />
      <Button size="sm" variant="outline" onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Saving..." : "Save standing feedback"}
      </Button>
    </div>
  );
}
