// Database copies for the full backup (src/actions/backup.ts), the bridge to the native Pulse app (pulse-native).
// `vacuum into` writes a consistent, compacted copy through a reader of its own, so it is safe while the store and a
// background sync have the database open, and the copy needs no WAL files beside it.
import { openDatabaseAsync } from "expo-sqlite";
import { DB_NAME } from "./db";

/** The databases a backup carries, by their file names. The demo database is left out: it is sample data. */
export const BACKUP_DATABASES = [DB_NAME, "pulse-workouts.db"] as const;

/** Copies database `name` to the file at `path` (a plain path, not a URI). The target must not exist yet. */
export async function copyDatabase(name: string, path: string): Promise<void> {
  const db = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    await db.execAsync("pragma busy_timeout = 10000");
    await db.runAsync("vacuum into ?", path);
  } finally {
    await db.closeAsync().catch(() => {});
  }
}
