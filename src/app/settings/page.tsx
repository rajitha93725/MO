import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { DEFAULT_SETTING_ROWS } from "@/lib/settings";
import { publicUsers } from "@/lib/users";
import { SettingsForm, TargetsForm, UsersForm } from "./SettingsForms";
import { TestPrint } from "./TestPrint";
import { today } from "@/lib/today";

export default async function SettingsPage() {
  await requirePage("owner");
  try {
    const [rows, targets, users] = await Promise.all([repo.settingRows(), repo.targets(), repo.users()]);
    const settings = await repo.settings(); // validates current values; throws a readable error if broken
    const merged = DEFAULT_SETTING_ROWS.map((d) => rows.find((r) => r.key === d.key) ?? d);
    const extra = rows.filter((r) => !DEFAULT_SETTING_ROWS.some((d) => d.key === r.key));
    return (
      <div className="stack">
        <h1>Settings</h1>
        <SettingsForm rows={[...merged, ...extra].map((r) => ({ key: r.key, value: String(r.value), description: r.description }))} />
        <TestPrint
          today={today(settings)}
          settings={{
            receipt_name: settings.receipt_name, receipt_address: settings.receipt_address, receipt_footer: settings.receipt_footer,
            receipt_width_mm: settings.receipt_width_mm, receipt_height_mm: settings.receipt_height_mm, receipt_max_page_mm: settings.receipt_max_page_mm, receipt_font_px: settings.receipt_font_px, logo_url: "/logo.png",
          }}
        />
        <TargetsForm targets={targets} />
        <UsersForm users={publicUsers(users)} />
      </div>
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
