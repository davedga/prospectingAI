"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "discover" | "brands";
type OutputType = "brands" | "instagram" | "contacts";

const OUTPUT_HINTS: Record<OutputType, string> = {
  brands: "Exports as the Brands CSV once the run finishes.",
  instagram: "Exports as the IG DM leads CSV for Cameron's outreach.",
  contacts:
    "Decision-maker contacts come from the prospecting step (Apollo) — turn on automated outreach, or select the brands afterwards to prospect them.",
};

export function NewRunForm() {
  const [mode, setMode] = useState<Mode>("discover");
  const [brief, setBrief] = useState("");
  const [seeds, setSeeds] = useState("");
  const [count, setCount] = useState("10");
  const [outputType, setOutputType] = useState<OutputType>("brands");
  const [autoContact, setAutoContact] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const seedList = seeds
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const canSubmit =
    mode === "discover" ? brief.trim().length > 0 : seedList.length > 0;

  const handleGenerate = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const payload =
        mode === "discover"
          ? {
              mode,
              prompt: brief,
              count: Number(count) || undefined,
              autoContact,
            }
          : { mode, seedBrands: seedList, autoContact };

      const res = await fetch("/api/discovery/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Discovery generation failed.");
        return;
      }
      const data = await res.json();
      if (data.shortfall) {
        toast.warning(
          `Found ${data.usableCount} usable lead(s) — fewer than requested. Review what came back.`
        );
      } else {
        toast.success(
          autoContact
            ? `Generated ${data.usableCount} lead(s) and queued them for automated outreach.`
            : `Generated ${data.usableCount} lead(s) for review.`
        );
      }
      router.push(`/discovery/${data.discoveryRunId}`);
    });
  };

  return (
    <div className="space-y-5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="discover">Discover new leads</TabsTrigger>
          <TabsTrigger value="brands">Specific brands / sites</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="brief">What kind of brand?</Label>
            <Textarea
              id="brief"
              placeholder='e.g. "beauty brands, $3-30M revenue, US, not already scaled on TikTok Shop"'
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count">Number of leads</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              disabled={isPending}
              className="w-28"
            />
            <p className="text-xs text-neutral-500">
              Up to 20 per run. For larger volumes, let the automated pipeline
              build over time.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="brands" className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="seeds">Brand names or websites</Label>
            <Textarea
              id="seeds"
              placeholder={"One per line, e.g.\nNodpod\nosea.com\nhttps://cometeer.com"}
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              rows={5}
              disabled={isPending}
            />
            <p className="text-xs text-neutral-500">
              {seedList.length > 0
                ? `${seedList.length} brand(s) — each gets researched and profiled, no substitutes.`
                : "Claude profiles exactly the brands you name (no lookalikes)."}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-1.5">
        <Label htmlFor="output">Output</Label>
        <Select
          value={outputType}
          onValueChange={(v) => setOutputType(v as OutputType)}
        >
          <SelectTrigger id="output" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="brands">Brand names</SelectItem>
            <SelectItem value="instagram">Instagram links</SelectItem>
            <SelectItem value="contacts">Decision-maker contacts</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-neutral-500">{OUTPUT_HINTS[outputType]}</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-foreground/10 p-3">
        <div className="space-y-0.5">
          <Label htmlFor="auto-contact" className="cursor-pointer">
            Start automated outreach
          </Label>
          <p className="text-xs text-neutral-500">
            {autoContact
              ? "Leads are queued for the bot to prospect and email automatically."
              : "Research only — leads are saved for review/export and never contacted automatically."}
          </p>
        </div>
        <Switch
          id="auto-contact"
          checked={autoContact}
          onCheckedChange={setAutoContact}
          disabled={isPending}
        />
      </div>

      <Button onClick={handleGenerate} disabled={isPending || !canSubmit}>
        {isPending
          ? "Generating..."
          : autoContact
            ? "Generate & start outreach"
            : "Generate leads"}
      </Button>
    </div>
  );
}
