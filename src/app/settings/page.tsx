import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { StorageError } from "@/components/StorageError";
import { DEFAULT_SETTING_ROWS } from "@/lib/settings";
import { SettingsForm, TargetsForm, UsersForm } from "./SettingsForms";

export default async function SettingsPage() {
  await requirePage("partner");
  try {
    const [rows, targets, users] = await Promise.all([repo.settingRows(), repo.targets(), repo.users()]);
    await repo.settings(); // validates current values; throws a readable error if broken
    const merged = DEFAULT_SETTING_ROWS.map((d) => rows.find((r) => r.key === d.key) ?? d);
    const extra = rows.filter((r) => !DEFAULT_SETTING_ROWS.some((d) => d.key === r.key));
    return (
      <div className="stack">
        <h1>Settings</h1>
        <SettingsForm rows={[...merged, ...extra].map((r) => ({ key: r.key, value: String(r.value), description: r.description }))} />
        <TargetsForm targets={targets} />
        <UsersForm users={users} />
      </div>
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
