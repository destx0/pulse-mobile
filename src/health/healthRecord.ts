// A scale weigh-in as Health Connect records, pure: the client id that makes a retry idempotent, the weight record and,
// when the scale measured impedance, the body-fat record. The write itself is src/health/healthWrite.ts; provider and
// screen logic stays out of here.
//
// Records are tagged as Pulse and as a scale. Health Connect sets `dataOrigin` to Pulse's package on insert; the
// clientRecordId is deterministic so a replay or a retried save cannot make a second record for the same weighing.
import type { BodyFatRecord, DeviceType, RecordingMethod, WeightRecord } from "react-native-health-connect";

/** Health Connect's `DeviceType.TYPE_SCALE` and `RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY` (metadata.types.ts). */
const DEVICE_TYPE_SCALE = 3 as DeviceType;
const RECORDING_METHOD_MANUAL_ENTRY = 3 as RecordingMethod;

export type ScaleWeighIn = {
  /** The instant the scale recorded, epoch ms. */
  atMs: number;
  kg: number;
  /** The vendor body-fat percentage, or null for a weight-only (socks) weigh-in. */
  fatPct: number | null;
  /** The scale's model for the device metadata; defaults to the BS191. */
  model?: string;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Stable across retries for the same weigh-in: time to the second, weight and fat to 0.1. */
export function scaleClientRecordId(weighIn: ScaleWeighIn): string {
  const at = Math.floor(weighIn.atMs / 1000);
  const kg = Math.round(weighIn.kg * 10);
  const fat = weighIn.fatPct === null ? 0 : Math.round(weighIn.fatPct * 10);
  return `pulse-scale-${at}-${kg}-${fat}`;
}

/** The records for one weigh-in: always a WeightRecord, a BodyFatRecord only when fat was measured. */
export function buildScaleRecords(weighIn: ScaleWeighIn): { weight: WeightRecord; fat: BodyFatRecord | null } {
  const id = scaleClientRecordId(weighIn);
  const time = new Date(weighIn.atMs).toISOString();
  const metadata = {
    clientRecordId: id,
    clientRecordVersion: 1,
    recordingMethod: RECORDING_METHOD_MANUAL_ENTRY,
    device: { manufacturer: "Pulse", model: weighIn.model ?? "HealthSense BS191", type: DEVICE_TYPE_SCALE },
  };
  return {
    weight: {
      recordType: "Weight",
      time,
      weight: { value: round1(weighIn.kg), unit: "kilograms" },
      metadata,
    },
    fat:
      weighIn.fatPct === null
        ? null
        : {
            recordType: "BodyFat",
            time,
            percentage: round1(weighIn.fatPct),
            metadata: { ...metadata, clientRecordId: `${id}-fat` },
          },
  };
}
