"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateSettings, type SettingsSaveState } from "./actions";

type SettingsData = Awaited<ReturnType<typeof getSettings>>;

const LOGO_URL =
  "https://lh7-rt.googleusercontent.com/docsz/AD_4nXdmprLPPbIK692SZtwrP8kYbgi-_EPzhWBNTFh8qOPjmZ4icw0TXMPRuBVZV_PcAYtHmYw9MCTYCV7FSa5hS8CMc8U6kEPm0BRlvrFGpORnKauiASyHsUwRg4V1F6F-sCccqwck";

const DEFAULT_VARIANT_A_HINT =
  "Open directly with a specific, concrete detail about the company and the ask - no question in the first line. Direct and to the point.";
const DEFAULT_VARIANT_B_HINT =
  "Open with a short, genuine question tied to a specific detail about the company before the ask. Slightly more conversational tone.";

const DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">
  <tr>
    <td style="padding-right: 14px; vertical-align: top;">
      <img src="${LOGO_URL}" width="64" height="64" alt="Dallas Global Agency" style="border-radius: 50%; display: block; width: 64px; height: 64px;" />
    </td>
    <td style="vertical-align: top; line-height: 1.5;">
      <div><strong>David Lakhter</strong></div>
      <div>Head of Partnerships</div>
      <div>Dallas Global <i>Agency</i> &nbsp;|&nbsp; <a href="https://www.dallasglobal.com" style="color: #1155cc; text-decoration: none;">www.dallasglobal.com</a></div>
      <div><a href="https://www.linkedin.com/in/davidlakhter" style="color: #1155cc; text-decoration: none;">linkedin.com/in/davidlakhter</a></div>
    </td>
  </tr>
</table>`;

const INITIAL_STATE: SettingsSaveState = { status: "idle" };

function SaveButton({
  pending,
  justSaved,
}: {
  pending: boolean;
  justSaved: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save settings"}
      </Button>
      {justSaved && !pending && (
        <span className="text-sm text-emerald-600">✓ Saved</span>
      )}
    </div>
  );
}

export function SettingsForm({ settings }: { settings: SettingsData }) {
  const [state, formAction, pending] = useActionState(updateSettings, INITIAL_STATE);
  const lastHandledSavedAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "idle") return;
    if (state.status === "error") {
      toast.error(state.message ?? "Failed to save settings.");
      return;
    }
    // Only toast once per successful save, not on every re-render.
    if (state.savedAt && state.savedAt !== lastHandledSavedAt.current) {
      lastHandledSavedAt.current = state.savedAt;
      toast.success(
        state.ranAutomationNow
          ? "Settings saved — automation started running in the background."
          : "Settings saved."
      );
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <Card className="border-amber-300 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Full autonomous mode — Discovery &amp; Prospecting
          </CardTitle>
          <p className="text-xs text-neutral-600">
            Off by default. Turning these on lets the app source new
            companies and buying-committee contacts entirely on its own,
            with no brief typed in and no manual review — combined with
            the automation toggles below, this can take a brand from
            &quot;never seen before&quot; to &quot;emailed&quot; with zero
            clicks. It spends real Anthropic/Apollo credits and, if
            auto-approve is also on, sends real email to real people.
            Saving with any of these on immediately kicks off a run in the
            background instead of waiting for the next daily cron.
            Reply detection isn&apos;t wired up for Gmail yet, so the
            &quot;stop at first reply&quot; part only works up to sending
            — replies won&apos;t auto-cancel follow-ups until that&apos;s
            built separately.
          </p>
        </CardHeader>
        <CardContent className="max-w-lg space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="standingDiscoveryBrief">
              Standing discovery brief
            </Label>
            <Textarea
              id="standingDiscoveryBrief"
              name="standingDiscoveryBrief"
              rows={3}
              placeholder='e.g. "beauty and jewelry DTC brands, $3-30M revenue, US, not already scaled on TikTok Shop"'
              defaultValue={settings.standingDiscoveryBrief ?? ""}
            />
            <p className="text-xs text-neutral-500">
              Used in place of a typed brief when Discovery runs on its
              own. Leave blank and auto-discovery simply won&apos;t run,
              even if the toggle below is on.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoRunDiscovery"
              name="autoRunDiscovery"
              defaultChecked={settings.autoRunDiscovery}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoRunDiscovery" className="font-normal">
                Auto-run Discovery daily using the standing brief
              </Label>
              <p className="text-xs text-neutral-500">
                Runs in the same daily cron as follow-ups. Candidates
                still land as &quot;proposed&quot; for your review unless
                auto-select is also on.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoSelectDiscovered"
              name="autoSelectDiscovered"
              defaultChecked={settings.autoSelectDiscovered}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoSelectDiscovered" className="font-normal">
                Auto-select newly discovered companies (skip Discovery review)
              </Label>
              <p className="text-xs text-neutral-500">
                Non-excluded candidates go straight to &quot;selected&quot;
                instead of waiting on the Discovery page for you to pick.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoProspectSelected"
              name="autoProspectSelected"
              defaultChecked={settings.autoProspectSelected}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoProspectSelected" className="font-normal">
                Auto-prospect selected companies (skip the Prospecting queue)
              </Label>
              <p className="text-xs text-neutral-500">
                Runs Apollo lookup + contact selection automatically for
                anything sitting in &quot;selected,&quot; whether it got
                there via Discovery review or auto-select above.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Automation — per pipeline step
          </CardTitle>
          <p className="text-xs text-neutral-500">
            These control drafting, approval, and sending — the steps
            after a company has contacts. Combined with the autonomous
            mode above, this is what lets the whole pipeline run without
            you end to end.
          </p>
        </CardHeader>
        <CardContent className="max-w-lg space-y-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoDraftFirstEmails"
              name="autoDraftFirstEmails"
              defaultChecked={settings.autoDraftFirstEmails}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoDraftFirstEmails" className="font-normal">
                Auto-draft first emails when contacts are selected
              </Label>
              <p className="text-xs text-neutral-500">
                If off, drafting requires clicking &quot;Generate
                Drafts&quot; on the company&apos;s drafting page instead of
                starting automatically.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoGenerateFollowUps"
              name="autoGenerateFollowUps"
              defaultChecked={settings.autoGenerateFollowUps}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoGenerateFollowUps" className="font-normal">
                Auto-generate follow-up content when due (daily cron)
              </Label>
              <p className="text-xs text-neutral-500">
                If off, the cron does nothing — draft follow-ups from the
                Review Queue&apos;s &quot;Upcoming follow-ups&quot; list
                instead, whenever you want.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoApproveFirstEmails"
              name="autoApproveFirstEmails"
              defaultChecked={settings.autoApproveFirstEmails}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoApproveFirstEmails" className="font-normal">
                Auto-approve first emails when drafted automatically
              </Label>
              <p className="text-xs text-neutral-500">
                Only applies to drafts generated by the automatic
                auto-draft trigger above — manually clicking
                &quot;Generate Drafts&quot; or &quot;Regenerate&quot;
                always leaves a draft for you to review.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="autoApproveFollowUps"
              name="autoApproveFollowUps"
              defaultChecked={settings.autoApproveFollowUps}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="autoApproveFollowUps" className="font-normal">
                Auto-approve and send follow-ups (skip manual review)
              </Label>
              <p className="text-xs text-neutral-500">
                Only affects follow-ups that were already generated —
                first emails always require manual approval regardless of
                this setting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Send window &amp; daily limits
          </CardTitle>
          <p className="text-xs text-neutral-500">
            Only gate automated sends/discovery/prospecting (the cron and
            the autonomous-mode toggles above) — manual actions you
            trigger yourself in the UI are never blocked by these.
            Vercel&apos;s free Hobby plan caps each run at 60 seconds, which
            isn&apos;t enough to hit real daily volume (15+ brands, 50-60+
            first emails) in one shot — so each run now does a bounded
            slice of work (time-boxed per stage) and stops cleanly instead
            of getting killed mid-write.{" "}
            <strong>
              To actually hit your daily targets, set up a free external
              scheduler
            </strong>{" "}
            (e.g. cron-job.org) hitting{" "}
            <code className="text-xs">/api/cron/send-followups</code> every
            5-10 minutes with header{" "}
            <code className="text-xs">Authorization: Bearer &lt;CRON_SECRET&gt;</code>{" "}
            — the daily total accumulates across many short runs. The
            built-in Vercel cron alone (once/day) will only make one slice
            of progress. Upgrading to Vercel Pro removes the 60s ceiling
            almost entirely if you&apos;d rather not run an external
            scheduler.
          </p>
        </CardHeader>
        <CardContent className="max-w-md space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sendWindowStartHour">Window start (hour, 24h)</Label>
              <Input
                id="sendWindowStartHour"
                name="sendWindowStartHour"
                type="number"
                min={0}
                max={23}
                defaultValue={settings.sendWindowStartHour}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sendWindowEndHour">Window end (hour, 24h)</Label>
              <Input
                id="sendWindowEndHour"
                name="sendWindowEndHour"
                type="number"
                min={0}
                max={23}
                defaultValue={settings.sendWindowEndHour}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sendTimezone">Timezone</Label>
            <select
              id="sendTimezone"
              name="sendTimezone"
              defaultValue={settings.sendTimezone}
              className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="America/New_York">Eastern (America/New_York)</option>
              <option value="America/Chicago">Central (America/Chicago)</option>
              <option value="America/Denver">Mountain (America/Denver)</option>
              <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minDiscoveryPerRun">Min brands discovered / run</Label>
            <Input
              id="minDiscoveryPerRun"
              name="minDiscoveryPerRun"
              type="number"
              min={0}
              defaultValue={settings.minDiscoveryPerRun}
              required
            />
            <p className="text-xs text-neutral-500">
              If Claude&apos;s first batch comes up short of this, Discovery
              automatically retries with a broadened brief (wider
              categories/revenue range/TTS-maturity) up to 5 times, or until
              the daily max below is hit — instead of just accepting a thin
              batch.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dailyDiscoveryLimit">Max brands auto-discovered / day</Label>
            <Input
              id="dailyDiscoveryLimit"
              name="dailyDiscoveryLimit"
              type="number"
              min={0}
              defaultValue={settings.dailyDiscoveryLimit}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dailyProspectLimit">Max POCs auto-prospected / day</Label>
            <Input
              id="dailyProspectLimit"
              name="dailyProspectLimit"
              type="number"
              min={0}
              defaultValue={settings.dailyProspectLimit}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dailyFirstEmailLimit">Max first emails auto-sent / day</Label>
            <Input
              id="dailyFirstEmailLimit"
              name="dailyFirstEmailLimit"
              type="number"
              min={0}
              defaultValue={settings.dailyFirstEmailLimit}
              required
            />
            <p className="text-xs text-neutral-500">
              Its own budget, separate from follow-ups below, so a busy
              follow-up day can&apos;t crowd out new outreach volume.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dailyFollowUpLimit">Max follow-ups auto-sent / day</Label>
            <Input
              id="dailyFollowUpLimit"
              name="dailyFollowUpLimit"
              type="number"
              min={0}
              defaultValue={settings.dailyFollowUpLimit}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            A/B testing by open rate
          </CardTitle>
          <p className="text-xs text-neutral-500">
            When on, each contact is randomly assigned variant A or B the
            first time a first-touch email is drafted for them (and kept
            for their whole sequence, including follow-ups). The hints
            below get passed to the drafting prompt as the angle to take;
            open rates per variant show up on the Brands page.
          </p>
        </CardHeader>
        <CardContent className="max-w-lg space-y-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id="abTestingEnabled"
              name="abTestingEnabled"
              defaultChecked={settings.abTestingEnabled}
              className="mt-0.5"
            />
            <Label htmlFor="abTestingEnabled" className="font-normal">
              Enable A/B variant assignment
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abVariantAHint">Variant A angle</Label>
            <Textarea
              id="abVariantAHint"
              name="abVariantAHint"
              rows={2}
              defaultValue={settings.abVariantAHint ?? DEFAULT_VARIANT_A_HINT}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abVariantBHint">Variant B angle</Label>
            <Textarea
              id="abVariantBHint"
              name="abVariantBHint"
              rows={2}
              defaultValue={settings.abVariantBHint ?? DEFAULT_VARIANT_B_HINT}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Follow-up cadence
          </CardTitle>
        </CardHeader>
        <CardContent className="max-w-md space-y-5">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Email signature
          </CardTitle>
          <p className="text-xs text-neutral-500">
            Appended to the bottom of every email this app sends — first
            touches and follow-ups alike. The HTML version below controls
            what recipients actually see (logo, bold/italic, links); the
            plain-text version underneath is only the fallback for
            text-only mail clients.
          </p>
        </CardHeader>
        <CardContent className="max-w-lg space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="emailSignatureHtml">
              HTML signature (what recipients see)
            </Label>
            <Textarea
              id="emailSignatureHtml"
              name="emailSignatureHtml"
              rows={10}
              className="font-mono text-xs"
              defaultValue={settings.emailSignatureHtml ?? DEFAULT_SIGNATURE_HTML}
            />
            <p className="text-xs text-neutral-500">
              Raw HTML, rendered inline into every sent email. Edit the
              logo URL, name, title, or links here if anything&apos;s off —
              there&apos;s no live preview, so double check with a real
              send.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emailSignature">
              Plain-text fallback
            </Label>
            <Textarea
              id="emailSignature"
              name="emailSignature"
              rows={5}
              placeholder={"David Lakhter\nHead of Partnerships\nDallas Global Agency\ndave@dallasglobal.com"}
              defaultValue={settings.emailSignature ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <SaveButton pending={pending} justSaved={state.status === "success"} />
    </form>
  );
}
