// The full backup's zip writer (android/…/PulseBackupModule.kt). Without the native module (tests, web) it throws.
import { requireOptionalNativeModule } from "expo";

export type ZipEntry = { name: string; path: string };

type Native = { zip(entries: ZipEntry[], out: string): Promise<number> };
const native = requireOptionalNativeModule<Native>("PulseBackup");

/** Writes `entries` into a zip at `out` (a path or file:// URI); returns its size in bytes. */
export async function zipFiles(entries: ZipEntry[], out: string): Promise<number> {
  if (!native) throw new Error("backupUnavailable");
  return native.zip(entries, out);
}
