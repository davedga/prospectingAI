"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function BulkImportBox() {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleImport = () => {
    if (!text.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/exclusions/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        toast.error("Bulk import failed.");
        return;
      }
      const data = await res.json();
      toast.success(`Imported ${data.imported} brand(s).`);
      setText("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Paste brand names — one per line, or comma-separated"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
      />
      <Button onClick={handleImport} disabled={isPending} size="sm">
        {isPending ? "Importing..." : "Bulk import"}
      </Button>
    </div>
  );
}
