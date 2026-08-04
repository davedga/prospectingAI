import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { updateSettings } from "./actions";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-500">
          Follow-up cadence and auto-approval apply globally, across every
          active sequence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Follow-up sequencing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateSettings} className="max-w-md space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="followUp1DelayDays">
                Follow-up 1 delay (days after first email)
              </Label>
              <Input
                id="followUp1DelayDays"
                name="followUp1DelayDays"
                type="number"
                min={1}
                defaultValue={settings.followUp1DelayDays}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUp2DelayDays">
                Follow-up 2 delay (days after follow-up 1)
              </Label>
              <Input
                id="followUp2DelayDays"
                name="followUp2DelayDays"
                type="number"
                min={1}
                defaultValue={settings.followUp2DelayDays}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sequenceLength">
                Sequence length (total touches, including first email)
              </Label>
              <Input
                id="sequenceLength"
                name="sequenceLength"
                type="number"
                min={1}
                max={10}
                defaultValue={settings.sequenceLength}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoApproveFollowUps"
                name="autoApproveFollowUps"
                defaultChecked={settings.autoApproveFollowUps}
              />
              <Label htmlFor="autoApproveFollowUps" className="font-normal">
                Auto-approve and send follow-ups (skip manual review)
              </Label>
            </div>
            <Button type="submit">Save settings</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
