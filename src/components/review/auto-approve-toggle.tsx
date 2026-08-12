"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toggleAutoApprove } from "@/app/(dashboard)/settings/actions";

export function AutoApproveToggle({
  settingKey,
  initialValue,
  id,
}: {
  settingKey: "autoApproveFirstEmails" | "autoApproveFollowUps";
  initialValue: boolean;
  id: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      await toggleAutoApprove(settingKey, checked);
      toast.success(checked ? "Auto-approve turned on." : "Auto-approve turned off.");
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
        Auto-approve
      </Label>
    </div>
  );
}
