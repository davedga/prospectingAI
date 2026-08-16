import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

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

      <SettingsForm settings={settings} />
    </div>
  );
}
