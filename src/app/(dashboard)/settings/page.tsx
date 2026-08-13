import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateSettings } from "./actions";

const LOGO_URL =
  "https://lh7-rt.googleusercontent.com/docsz/AD_4nXdmprLPPbIK692SZtwrP8kYbgi-_EPzhWBNTFh8qOPjmZ4icw0TXMPRuBVZV_PcAYtHmYw9MCTYCV7FSa5hS8CMc8U6kEPm0BRlvrFGpORnKauiASyHsUwRg4V1F6F-sCccqwck";

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

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-500">
          These apply globally, across every company and sequence.
        </p>
      </div>

      <form action={updateSettings} className="space-y-6">
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

        <Button type="submit">Save settings</Button>
      </form>
    </div>
  );
}
