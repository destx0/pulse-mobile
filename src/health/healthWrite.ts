// Writes one scale weigh-in to Health Connect as Pulse-tagged records. On-device only: no Google account, no network.
// The low-level permissions and inserts are src/health/connect.ts; the records are built in src/health/healthRecord.ts.
//
// A write is idempotent: the deterministic clientRecordId is looked up in a ±1 s window before inserting, so a retried
// save, a replayed history frame or tapping Retry cannot create a second Weight/BodyFat record. A missing write
// permission is reported, never silently ignored; the scale screen offers the system sheet and a retry.
import {
  askWritePermissions,
  availability,
  insertHealthRecords,
  readAll,
  writePermissionState,
} from "./connect";
import { buildScaleRecords, type ScaleWeighIn } from "./healthRecord";
import type { BodyFatRecord, WeightRecord } from "react-native-health-connect";

export type HealthWriteResult =
  | { ok: true; wroteFat: boolean }
  | { ok: false; reason: "unavailable" | "permission" | "error"; message?: string };

/** True when Health Connect already has this exact client record in the second around `time`. */
async function alreadyWritten(type: "Weight" | "BodyFat", record: WeightRecord | BodyFatRecord): Promise<boolean> {
  const id = record.metadata?.clientRecordId;
  if (!id) return false;
  const at = Date.parse(record.time);
  const rows = await readAll(type, { start: new Date(at - 1_000), end: new Date(at + 1_000) }).catch(() => []);
  return rows.some((row) => row.metadata?.clientRecordId === id);
}

async function insertUnlessPresent(type: "Weight" | "BodyFat", record: WeightRecord | BodyFatRecord): Promise<boolean> {
  if (await alreadyWritten(type, record)) return false;
  await insertHealthRecords([record]);
  return true;
}

/**
 * Write a weigh-in's weight and, when measured, body fat. `prompt` shows the system write permission sheet when it is
 * missing; use it for an explicit Save tap, not for a burst of history frames.
 */
export async function writeScaleWeighIn(weighIn: ScaleWeighIn, opts: { prompt?: boolean } = {}): Promise<HealthWriteResult> {
  if ((await availability()) !== "available") return { ok: false, reason: "unavailable" };
  try {
    let permission = await writePermissionState();
    if ((permission.missing.includes("Weight") || permission.missing.includes("BodyFat")) && opts.prompt) {
      permission = await askWritePermissions();
    }
    if (permission.missing.includes("Weight")) return { ok: false, reason: "permission" };

    const { weight, fat } = buildScaleRecords(weighIn);
    // A body-composition weigh-in writes both or neither, so the pair stays consistent; a socks weigh-in needs Weight only.
    if (fat && permission.missing.includes("BodyFat")) return { ok: false, reason: "permission" };
    await insertUnlessPresent("Weight", weight);
    if (fat) await insertUnlessPresent("BodyFat", fat);
    return { ok: true, wroteFat: !!fat };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
