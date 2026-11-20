// Settings › Your data › Full backup: one zip with everything Pulse keeps on the phone, for the native Pulse app
// (pulse-native) to import. Layout (pulse-native app/…/data/Backup.kt reads it):
//   pulse-store.db       the health, journal, gym, habits, places and food-order database (a vacuumed copy)
//   pulse-workouts.db    recorded workouts, when there are any
//   prefs.json           {"format": 1, "exportedAt": <unix s>, "appVersion": "<version>", "asyncStorage": {"<key>": "<value>"}}:
//                        every AsyncStorage key with its raw string value (JSON text stays a string)
//   photo.jpg            the profile photo, when there is one
// The coach's API key stays out: it lives in the secure store and never leaves it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { i18n } from "@/i18n/config";
import { BACKUP_DATABASES, copyDatabase } from "@/data/backup";
import type { QueryCtx } from "@/queries/ctx";
import { zipFiles, type ZipEntry } from "../../modules/pulse-backup";
import type { ActionResult } from "./journal";

const plainPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

export async function shareFullBackup(ctx: QueryCtx): Promise<ActionResult> {
  try {
    const [{ Directory, File, Paths }, Sharing] = await Promise.all([import("expo-file-system"), import("expo-sharing")]);
    if (!(await Sharing.isAvailableAsync())) return { ok: false, error: i18n.t("errors:export.sharingUnavailable") };
    const dir = new Directory(Paths.cache, "backup");
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });

    const entries: ZipEntry[] = [];
    for (const name of BACKUP_DATABASES) {
      const file = new File(dir, name);
      await copyDatabase(name, plainPath(file.uri));
      entries.push({ name, path: file.uri });
    }

    const keys = await AsyncStorage.getAllKeys();
    const prefs = Object.fromEntries((await AsyncStorage.multiGet(keys)).filter(([, v]) => v !== null));
    const prefsFile = new File(dir, "prefs.json");
    prefsFile.write(JSON.stringify({ format: 1, exportedAt: Math.floor(Date.now() / 1000), appVersion: Constants.expoConfig?.version ?? null, asyncStorage: prefs }));
    entries.push({ name: "prefs.json", path: prefsFile.uri });

    const photo = (await ctx.store.getProfile())?.photo;
    if (photo) entries.push({ name: "photo.jpg", path: photo });

    const day = new Date().toISOString().slice(0, 10);
    const out = new File(Paths.cache, `pulse-backup-${day}.zip`);
    if (out.exists) out.delete();
    await zipFiles(entries, out.uri);
    dir.delete();
    await Sharing.shareAsync(out.uri, { mimeType: "application/zip", dialogTitle: out.name });
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: i18n.t("errors:export.failed") };
  }
}
