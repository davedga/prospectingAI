"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toggleAutoApprove } from "@/app/(dashboard)/settings/actions";

type BooleanSettingKey =
  | "autoApproveFirstEmails"
  | "autoApproveFollowUps"
  | "autoDraftFirstEmails"
  | "autoGenerateFollowUps"
  | "autoRunDiscovery"
  | "autoSelectDiscovered"
  | "autoProspectSelected";

export function SettingToggle({
  settingKey,
  initialValue,
  id,
  label = "Auto-approve",
}: {
  settingKey: BooleanSettingKey;
  initialValue: boolean;
  id: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      await toggleAutoApprove(settingKey, checked);
      toast.success(checked ? `${label} turned on.` : `${label} turned off.`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        defaultChecked={initialValue}
        disabled={isPending}
        onCheckedChange={handleChange}
      />
      <Label htmlFor={id} className="text-xs font-normal text-neutral-500">
        {label}
      </Label>
    </div>
  );
}

// Back-compat alias — same component, original name.
export { SettingToggle as AutoApproveToggle };
