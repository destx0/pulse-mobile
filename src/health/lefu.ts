// The LeFu FFF0 scale protocol and its body-composition model, pure: frames in, values out, and commands back.
//
// A HealthSense BS191 (LeFu V3, advertisement type CF with a Direct subtype) sends 11-byte measurement frames on FFF4,
// takes commands on FFF1, and stores weigh-ins with an 18-byte history frame. The layout, the unit byte, the status
// byte and the V2 fallback are the protocol reports' (healthu-rea/reports/01-ble-protocol.md); the advertisement
// offsets and the Direct/Alternate subtype table are healthu-rea/reports/11-device-support.md. Commands are the
// 11-byte `FD 37` profile, the 8-byte `F1` clock and the 2-byte `F2` history requests, each with the XOR byte where the
// protocol has one.
//
// The composition maths is the LeFu `libsl` model (healthu-rea/reports/02-body-composition.md): four coefficient
// groups from sex and the athlete flag, giving body fat, water, protein, muscle, bone, skeletal muscle, visceral fat,
// subcutaneous fat, lean mass, BMR and body age. The range checks are the native library's; outside them the result is
// null and the screens show weight only. This module does no I/O, reads no clock and has no React: the controller
// passes a Date in, and the screen renders what comes out.

export type LeFuScaleType = "CF" | "CE" | "CA" | "CB" | "CC" | "UNKNOWN";
export type LeFuCalcType = "direct" | "alternate" | "needNot" | "unknown";
export type LeFuProtocol = "V2" | "V3";

/** What the advertisement (or the device name) tells us about a scale. */
export type LeFuProfile = {
  protocol: LeFuProtocol;
  scaleType: LeFuScaleType;
  calcType: LeFuCalcType;
  /** The vendor's 11-character advertisement type string, when one was parsed (`CF01…`). */
  typeString: string | null;
};

export const LE_FU_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
export const LE_FU_WRITE_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
export const LE_FU_NOTIFY_UUID = "0000fff4-0000-1000-8000-00805f9b34fb";
export const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

export const LIVE_FRAME_LEN = 11;
export const HISTORY_FRAME_LEN = 18;

const FRAME_MARKERS = new Set([0xcf, 0xce, 0xca, 0xcb, 0xcc]);
const SCALE_TYPES = new Set(["CF", "CE", "CA", "CB", "CC"]);
const DIRECT_SUBTYPES = new Set(["01", "02", "20", "21", "40", "42", "51", "52"]);
const ALTERNATE_SUBTYPES = new Set([
  "03", "04", "05", "06", "07", "22", "23", "24", "25", "26", "27",
  "41", "43", "53", "54",
]);

/** A stored frame's clock, as the scale wrote it: local wall time, no zone. */
export type LeFuTimestamp = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** One decoded measurement frame. */
export type LeFuFrame = {
  type: LeFuScaleType;
  /** Weight in 0.01 of the unit the scale reported. */
  weightRaw: number;
  unitCode: number;
  /** The same reading in kilograms. */
  weightKg: number;
  /** Ohms, or null when the frame carries none (weight-only, or a family that does not measure it). */
  impedanceOhm: number | null;
  status: number;
  checksumValid: boolean;
  timestamp: LeFuTimestamp | null;
  isHistory: boolean;
};

/** XOR of the first `length` bytes, as an unsigned byte. */
export function xorChecksum(bytes: ArrayLike<number>, length = bytes.length): number {
  let value = 0;
  for (let i = 0; i < length; i++) value ^= bytes[i] & 0xff;
  return value & 0xff;
}

export const isFrameMarker = (value: number): boolean => FRAME_MARKERS.has(value & 0xff);

/** The scale family a frame marker names. */
export function scaleTypeOf(marker: number): LeFuScaleType {
  switch (marker & 0xff) {
    case 0xcf:
      return "CF";
    case 0xce:
      return "CE";
    case 0xca:
      return "CA";
    case 0xcb:
      return "CB";
    case 0xcc:
      return "CC";
    default:
      return "UNKNOWN";
  }
}

/** A unit code's weight in kilograms: 0 kg, 1 lb, 2 st (other codes pass through as kilograms). */
export function weightKgOf(weightRaw: number, unitCode: number): number {
  const value = weightRaw / 100;
  if (unitCode === 1) return value * 0.45359237;
  if (unitCode === 2) return value * 6.35029318;
  return value;
}

const u16le = (bytes: ArrayLike<number>, at: number) => (bytes[at] & 0xff) | ((bytes[at + 1] & 0xff) << 8);

/**
 * Decode a live or history frame, or null when the bytes cannot be a LeFu measurement. A bad XOR is reported in
 * `checksumValid` but does not reject the reading: the scale sends the body once and a dropped byte should cost a
 * warning, not the weigh-in.
 */
export function decodeLeFuFrame(bytes: ArrayLike<number>, profile: LeFuProfile): LeFuFrame | null {
  if (bytes.length < LIVE_FRAME_LEN) return null;
  if (!isFrameMarker(bytes[0])) return null;
  const weightRaw = u16le(bytes, 3);
  if (weightRaw <= 0) return null;

  const unitCode = bytes[8] & 0xff;
  const checksumValid = (bytes[10] & 0xff) === xorChecksum(bytes, 10);
  const timestamp = bytes.length >= HISTORY_FRAME_LEN ? readTimestamp(bytes) : null;
  // A settled frame is sent twice; the two copies can arrive coalesced in one notification. That is 18+ bytes but is
  // not history. A real history frame's byte 11 is the year's high byte, never another frame marker.
  const coalesced = bytes.length >= 12 && isFrameMarker(bytes[11]);
  return {
    type: scaleTypeOf(bytes[0]),
    weightRaw,
    unitCode,
    weightKg: weightKgOf(weightRaw, unitCode),
    impedanceOhm: selectImpedance(bytes, profile),
    status: bytes[9] & 0xff,
    checksumValid,
    timestamp,
    isHistory: timestamp !== null && !(checksumValid && coalesced),
  };
}

/**
 * The impedance field, following the family's scaling: V3 Direct is the 24-bit field / 10, Alternate is the raw ohms,
 * CE/CB/CA carry none. V2 prefers the legacy 16-bit big-endian field at bytes 1..2 (0.1 Ω); when that is implausible
 * (> 1200 Ω) it falls back to the 24-bit field, / 10 if that is plausible, else raw.
 */
export function selectImpedance(bytes: ArrayLike<number>, profile: LeFuProfile): number | null {
  if (bytes.length < 8) return null;
  const legacy = (((bytes[2] & 0xff) << 8) | (bytes[1] & 0xff)) * 0.1;
  const raw24 = (bytes[5] & 0xff) | ((bytes[6] & 0xff) << 8) | ((bytes[7] & 0xff) << 16);

  if (profile.protocol === "V2") {
    if (legacy <= 1200) return legacy;
    const tenths = raw24 / 10;
    if (tenths >= 100 && tenths <= 1500) return tenths;
    if (raw24 >= 100 && raw24 <= 1500) return raw24;
    return null;
  }

  switch (profile.calcType) {
    case "direct":
      return raw24 > 0 ? raw24 / 10 : null;
    case "alternate":
      return raw24 > 0 ? raw24 : null;
    case "needNot":
      return null;
    default: {
      // An unknown subtype: take whichever reading is physiological, tenths first.
      const tenths = raw24 / 10;
      if (tenths >= 100 && tenths <= 1500) return tenths;
      if (raw24 >= 100 && raw24 <= 1500) return raw24;
      return null;
    }
  }
}

/** True when the frame is settled: safe to offer for saving. History frames are always stored, so always settled. */
export function isFinalLeFuFrame(frame: LeFuFrame, profile: LeFuProfile): boolean {
  if (frame.isHistory) return true;
  if (profile.protocol === "V3") return frame.status === 0x00 || frame.status === 0x01;
  return frame.status === 0x00 || frame.status === 0x36;
}

/** True when the scale ran a bioimpedance measurement (not a socks/weight-only weigh-in). */
export const hasImpedance = (frame: LeFuFrame): boolean => (frame.impedanceOhm ?? 0) > 0;

function readTimestamp(bytes: ArrayLike<number>): LeFuTimestamp | null {
  const year = ((bytes[11] & 0xff) << 8) | (bytes[12] & 0xff);
  if (year < 2000 || year > 2100) return null;
  const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
  const t: LeFuTimestamp = {
    year,
    month: clamp(bytes[13] & 0xff, 1, 12),
    day: clamp(bytes[14] & 0xff, 1, 31),
    hour: clamp(bytes[15] & 0xff, 0, 23),
    minute: clamp(bytes[16] & 0xff, 0, 59),
    second: clamp(bytes[17] & 0xff, 0, 59),
  };
  // The native parser builds a real LocalDateTime and drops the frame when the date is impossible (31 February).
  const date = new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second));
  return date.getUTCFullYear() === t.year && date.getUTCMonth() === t.month - 1 && date.getUTCDate() === t.day
    ? t
    : null;
}

/** `FD 37 unit 00 athlete sex age height 00 00 XOR` for V3; the V2 unit/group frame otherwise. */
export function encodeProfile(
  profile: LeFuProfile,
  user: { unitCode: number; athlete: boolean; male: boolean; age: number; heightCm: number },
): Uint8Array {
  const bytes = profile.protocol === "V3"
    ? Uint8Array.from([
        0xfd, 0x37, user.unitCode & 0xff, 0x00,
        user.athlete ? 0x02 : 0x00,
        user.male ? 0x01 : 0x00,
        Math.min(255, Math.max(0, Math.trunc(user.age))),
        Math.min(255, Math.max(0, Math.trunc(user.heightCm))),
        0x00, 0x00, 0x00,
      ])
    : Uint8Array.from([0xfd, 0x37, user.unitCode & 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  bytes[bytes.length - 1] = xorChecksum(bytes, bytes.length - 1);
  return bytes;
}

/** A wall-clock reading for the F1 frame; the controller passes `wallClockOf(new Date())`. */
export type LeFuWallClock = LeFuTimestamp;

/** Local wall-clock fields of a Date (no clock read: the caller supplies the Date). */
export function wallClockOf(date: Date): LeFuWallClock {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

/** `F1 YYYY MM DD HH mm ss`, the year big-endian and no checksum. */
export function encodeClock(wall: LeFuWallClock): Uint8Array {
  return Uint8Array.from([
    0xf1,
    (wall.year >> 8) & 0xff,
    wall.year & 0xff,
    wall.month & 0xff,
    wall.day & 0xff,
    wall.hour & 0xff,
    wall.minute & 0xff,
    wall.second & 0xff,
  ]);
}

export const historyRequest = (): Uint8Array => Uint8Array.from([0xf2, 0x00]);
export const historyClear = (): Uint8Array => Uint8Array.from([0xf2, 0x01]);

// ── Advertisement ───────────────────────────────────────────────────────────

function scaleTypeFor(type: string): LeFuScaleType {
  const head = type.slice(0, 2);
  return (SCALE_TYPES.has(head) ? head : "UNKNOWN") as LeFuScaleType;
}

function calcTypeFor(type: string): LeFuCalcType {
  const scale = scaleTypeFor(type);
  if (scale === "CF") {
    const subtype = type.slice(2, 4);
    if (DIRECT_SUBTYPES.has(subtype)) return "direct";
    if (ALTERNATE_SUBTYPES.has(subtype)) return "alternate";
    return "unknown";
  }
  if (scale === "CE" || scale === "CB" || scale === "CA") return "needNot";
  return "unknown";
}

/**
 * Parse the 11-byte type string out of an advertisement. Android strips the 2-byte company id from manufacturer data,
 * so the vendor's 20-byte record is an 18-byte payload here; the length selects the protocol generation and the
 * offset of the string. Service data can carry it at other offsets, so those are tried after the primary one.
 */
export function parseLeFuProfile(
  payload: ArrayLike<number> | null | undefined,
  fromServiceData = false,
  exactHealthScaleName = false,
): LeFuProfile | null {
  if (!payload) return null;
  for (const [offset, protocol] of advertisementOffsets(payload.length, exactHealthScaleName, fromServiceData)) {
    const type = readTypeString(payload, offset);
    if (!type) continue;
    return { protocol, scaleType: scaleTypeFor(type), calcType: calcTypeFor(type), typeString: type };
  }
  return null;
}

function advertisementOffsets(size: number, exactHealthScale: boolean, fromServiceData: boolean): [number, LeFuProtocol][] {
  let primary: [number, LeFuProtocol];
  switch (size) {
    case 18:
      primary = exactHealthScale ? [4, "V2"] : [6, "V3"];
      break;
    case 17:
      primary = [6, "V2"];
      break;
    case 16:
      primary = [4, "V3"];
      break;
    case 15:
      primary = [4, "V2"];
      break;
    case 6:
      primary = [0, "V2"];
      break;
    default:
      return [];
  }
  if (!fromServiceData) return [primary];
  const out: [number, LeFuProtocol][] = [primary];
  for (const offset of [0, 2, 4, 6]) {
    if (offset + 11 <= size && offset !== primary[0]) out.push([offset, primary[1]]);
  }
  return out;
}

function readTypeString(payload: ArrayLike<number>, offset: number): string | null {
  if (offset < 0 || payload.length < offset + 11) return null;
  let type = "";
  for (let i = 0; i < 11; i++) {
    const value = payload[offset + i] & 0xff;
    if (value < 0x20 || value > 0x7e) return null;
    type += String.fromCharCode(value);
  }
  type = type.toUpperCase();
  return SCALE_TYPES.has(type.slice(0, 2)) ? type : null;
}

/** A shortlist of names the LeFu family advertises; the BS191 and the HealthSense family are V3 CF Direct. */
export function profileFromName(name: string | null | undefined): LeFuProfile | null {
  if (!name) return null;
  if (/bs191|health\s*sense/i.test(name)) {
    return { protocol: "V3", scaleType: "CF", calcType: "direct", typeString: null };
  }
  if (/health\s*scale/i.test(name)) {
    return { protocol: "V2", scaleType: "CF", calcType: "unknown", typeString: null };
  }
  return null;
}

/** A scale name Pulse recognises, even when its advertisement carried no type string. */
export const looksLikeScaleName = (name: string | null | undefined): boolean =>
  !!name && /bs191|health\s*sense|health\s*scale|lefu|1byone/i.test(name);

export const DEFAULT_V3_PROFILE: LeFuProfile = { protocol: "V3", scaleType: "CF", calcType: "direct", typeString: null };
/** A LeFu-family unit whose advertisement did not name its generation: the legacy layout, as the reference does. */
export const DEFAULT_V2_PROFILE: LeFuProfile = { protocol: "V2", scaleType: "UNKNOWN", calcType: "unknown", typeString: null };

// ── Body composition ────────────────────────────────────────────────────────

export type LeFuBodyInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  male: boolean;
  athlete: boolean;
  impedanceOhm: number;
};

export type LeFuBodyError = "weight" | "impedance" | "height" | "age";

export type LeFuComposition = {
  bmi: number;
  bodyFatPercent: number;
  waterPercent: number;
  proteinPercent: number;
  /** The vendor's "muscle" output: it behaves like lean mass, not anatomical skeletal muscle. */
  muscleKg: number;
  boneKg: number;
  skeletalMusclePercent: number;
  visceralFatLevel: number;
  subcutaneousFatPercent: number;
  leanMassKg: number;
  bmrKcal: number;
  bodyAgeYears: number;
};

/** The native library's accepted ranges; null when the input is usable. */
export function validateLeFuBodyInput(input: LeFuBodyInput): LeFuBodyError | null {
  if (!(input.weightKg >= 10 && input.weightKg <= 180)) return "weight";
  if (!(input.impedanceOhm >= 200 && input.impedanceOhm <= 1200)) return "impedance";
  if (!(input.heightCm >= 100 && input.heightCm <= 220)) return "height";
  if (!(Number.isInteger(input.age) && input.age >= 3 && input.age <= 100)) return "age";
  return null;
}

type Term = { bmiCoeff: number; ageCoeff: number; constant: number; low: number; high: number };
/** `bmi10 * bmiCoeff / 10 + age * ageCoeff + constant`, clamped. */
const evaluate = (t: Term, bmi10: number, age: number) =>
  clamp((bmi10 * t.bmiCoeff) / 10 + age * t.ageCoeff + t.constant, t.low, t.high);

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/** Group 0 female non-athlete, group 1 male non-athlete. */
const BODY_FAT_BASE: Term[] = [
  { bmiCoeff: 1.545, ageCoeff: 0.0979, constant: -13.74, low: 5.1, high: 70 },
  { bmiCoeff: 1.524, ageCoeff: 0.1015, constant: -22.96, low: 5.1, high: 70 },
];

/** Group 2 female athlete, group 3 male athlete: a correction over the base. */
const BODY_FAT_ATHLETE = [
  { bmiCoeff: 0.4109, baseCoeff: 0.3375, constant: 0.01331 },
  { bmiCoeff: 0.3327, baseCoeff: 0.2861, constant: 0.007555 },
];

const MUSCLE: Term[] = [
  { bmiCoeff: -0.01452, ageCoeff: -0.000922, constant: 1.069, low: 0.282, high: 0.893 },
  { bmiCoeff: -0.01447, ageCoeff: -0.0009551, constant: 1.167, low: 0.285, high: 0.9015 },
  { bmiCoeff: -0.008751, ageCoeff: -0.0003079, constant: 0.9828, low: 0.282, high: 0.893 },
  { bmiCoeff: -0.007303, ageCoeff: -0.0002728, constant: 1.012, low: 0.285, high: 0.9015 },
];

const WATER: Term[] = [
  { bmiCoeff: -1.06, ageCoeff: -0.06742, constant: 78.04, low: 20.6, high: 65.1 },
  { bmiCoeff: -1.1, ageCoeff: -0.07259, constant: 88.72, low: 21.7, high: 68.5 },
  { bmiCoeff: -0.6393, ageCoeff: -0.02273, constant: 71.78, low: 20.6, high: 65.1 },
  { bmiCoeff: -0.5551, ageCoeff: -0.02068, constant: 76.92, low: 21.7, high: 68.5 },
];

const PROTEIN: Term[] = [
  { bmiCoeff: -0.4691, ageCoeff: -0.02979, constant: 29.55, low: 5, high: 24 },
  { bmiCoeff: -0.3477, ageCoeff: -0.02299, constant: 28.03, low: 6.84, high: 21.64 },
  { bmiCoeff: -0.2831, ageCoeff: -0.01007, constant: 26.78, low: 5, high: 24 },
  { bmiCoeff: -0.1752, ageCoeff: -0.006557, constant: 24.29, low: 6.84, high: 21.64 },
];

const BONE: Term[] = [
  { bmiCoeff: -0.005467, ageCoeff: -0.0003471, constant: 0.4026, low: 0.1, high: 0.4 },
  { bmiCoeff: -0.004495, ageCoeff: -0.0002969, constant: 0.3626, low: 0.05, high: 0.4 },
  { bmiCoeff: -0.003299, ageCoeff: -0.0001157, constant: 0.3703, low: 0.1, high: 0.4 },
  { bmiCoeff: -0.002267, ageCoeff: -0.0000846, constant: 0.3143, low: 0.05, high: 0.4 },
];

const SKELETAL: Term[] = [
  { bmiCoeff: -0.9, ageCoeff: -0.05716, constant: 66.27, low: 17.5, high: 55.3 },
  { bmiCoeff: -0.9841, ageCoeff: -0.06504, constant: 79.38, low: 19.4, high: 61.3 },
  { bmiCoeff: -0.5428, ageCoeff: -0.01904, constant: 60.94, low: 17.5, high: 55.3 },
  { bmiCoeff: -0.4966, ageCoeff: -0.01858, constant: 68.83, low: 19.4, high: 61.3 },
];

// BMR coefficients, one row per group. Layout: H·age, B·age/10, H²·B/10, H², H·B/10, B²/100, B/10, constant,
// H, H·B²/100, age, H·B/10·age, H²·age, where H is height in metres, B is BMI×10 and age is years.
const BMR = [
  [1.584, 0.0561, 11.22, 115.5, 44.04, 0.8848, -35.39, 693.9, -398.4, -1.101, -1.262, -0.06987, -0.484],
  [2.355, 0.08666, 14.52, 94.25, 39.61, 0.8574, -31.93, 629.1, -316.5, -1.073, -2.082, -0.0912, -0.6278],
  [0.5116, 0.01891, 14.51, 76.66, 26.69, 0.5366, -21.55, 573.5, -252.6, -0.6655, -0.3931, -0.02311, -0.1654],
  [0.4116, 0.01607, 17.13, 43.1, 19.92, 0.4498, -16.48, 498.4, -151.2, -0.5528, -0.309, -0.02034, -0.1287],
];
/** Only `calcu_bmr0` has an H³ term. */
const BMR_H3 = [2.144, 0, 0, 0];

// Body-age factors, per group and BMI10 band (<180, 180..249, >=250): (B/10, B²/100, constant).
const BODY_AGE = [
  [[0.1675, -0.00693, 0.169], [-0.1057, 0.00269, 1.996], [0.03367, -0.000382, 0.4545]],
  [[0.106, -0.003851, 0.3812], [-0.3657, 0.00834, 4.934], [0.03204, -0.0003422, 0.4478]],
  [[0.1615, -0.006619, 0.1997], [-0.06346, 0.001653, 1.597], [0.01982, -0.0001689, 0.6381]],
  [[0.1019, -0.003729, 0.4155], [-0.2245, 0.005072, 3.443], [0.02792, -0.0002736, 0.4781]],
];

/** The LeFu body composition, or null when the native model would reject the input. */
export function leFuBodyComposition(input: LeFuBodyInput): LeFuComposition | null {
  if (validateLeFuBodyInput(input) !== null) return null;

  const group = (input.athlete ? 2 : 0) + (input.male ? 1 : 0);
  const bmi10 = bmiTimesTen(input.weightKg, input.heightCm);
  const heightM = input.heightCm / 100;
  const bodyFat = bodyFatPercent(bmi10, input.age, group);
  const muscleRatio = evaluate(MUSCLE[group], bmi10, input.age);
  const boneRatio = evaluate(BONE[group], bmi10, input.age);

  return {
    bmi: bmi10 / 10,
    bodyFatPercent: bodyFat,
    waterPercent: evaluate(WATER[group], bmi10, input.age),
    proteinPercent: evaluate(PROTEIN[group], bmi10, input.age),
    muscleKg: muscleRatio * input.weightKg,
    boneKg: Math.max(1, boneRatio * 0.1695 * input.weightKg),
    skeletalMusclePercent: evaluate(SKELETAL[group], bmi10, input.age),
    visceralFatLevel: visceralFat(bmi10, heightM, group),
    subcutaneousFatPercent: subcutaneousFat(bmi10, input.age, group),
    leanMassKg: input.weightKg * (1 - bodyFat / 100),
    bmrKcal: bmr(bmi10, input.heightCm, input.age, group),
    bodyAgeYears: bodyAge(bmi10, input.age, group),
  };
}

/** The native BMI×10: `(uint)((weight_0_01kg / height_m² + 5) / 10)`, truncated. */
function bmiTimesTen(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const bmiCenti = (weightKg * 100) / (heightM * heightM);
  return Math.trunc((bmiCenti + 5) / 10);
}

function bodyFatPercent(bmi10: number, age: number, group: number): number {
  const base = evaluate(BODY_FAT_BASE[group % 2], bmi10, age);
  if (group < 2) return base;
  const correction = BODY_FAT_ATHLETE[group - 2];
  const corrected = (bmi10 * correction.bmiCoeff) / 10 +
    (Math.trunc(base * 10) * correction.baseCoeff) / 10 +
    correction.constant;
  return clamp(corrected, 5.1, 70);
}

function bmr(bmi10: number, heightCm: number, age: number, group: number): number {
  const h = heightCm / 100;
  const b = bmi10;
  const c = BMR[group];
  const value =
    h * c[0] * age +
    (b * c[1] / 10) * age +
    h * h * h * BMR_H3[group] +
    h * h * ((b * c[2]) / 10) +
    h * h * c[3] +
    (h * (b * c[4])) / 10 +
    (b * b * c[5]) / 100 +
    (b * c[6]) / 10 + c[7] +
    h * c[8] +
    h * ((b * b * c[9]) / 100) +
    age * c[10] +
    h * ((b * c[11]) / 10) * age +
    h * h * c[12] * age;
  return Math.trunc(clamp(value, 900, 2500));
}

function bodyAge(bmi10: number, age: number, group: number): number {
  const band = bmi10 < 180 ? 0 : bmi10 < 250 ? 1 : 2;
  const c = BODY_AGE[group][band];
  const factor = (bmi10 * c[0]) / 10 + (bmi10 * bmi10 * c[1]) / 100 + c[2];
  return Math.trunc(age * factor + 0.5);
}

function visceralFat(bmi10: number, heightM: number, group: number): number {
  let value: number;
  if (group === 0) {
    value = heightM * 2.79 +
      (bmi10 * 1.335) / 10 - 22.44 +
      (bmi10 * bmi10 * -0.002523) / 100 +
      (heightM * bmi10 * -0.164) / 10;
  } else if (group === 1) {
    value = (heightM * bmi10 * 0.04388) / 10 +
      (bmi10 * bmi10 * 0.001632) / 100 +
      (bmi10 * 0.7565) / 10 - 13.34 +
      heightM * -0.5783;
  } else if (group === 2) {
    value = heightM * 1.672 +
      (bmi10 * 1.159) / 10 - 19.84 +
      (bmi10 * bmi10 * -0.001514) / 100 +
      (heightM * bmi10 * -0.103) / 10;
  } else {
    value = (heightM * bmi10 * 0.03664) / 10 +
      (bmi10 * bmi10 * 0.001334) / 100 +
      (bmi10 * 0.7542) / 10 - 13.03 +
      heightM * -0.5297;
  }
  return Math.trunc(clamp(value, 1, 30) + 0.5);
}

function subcutaneousFat(bmi10: number, age: number, group: number): number {
  const squared = bmi10 * bmi10;
  const cubed = squared * bmi10;
  let value: number;
  if (group === 0) {
    value = (bmi10 * 1.946) / 10 - 15.93 +
      (squared * -0.02213) / 100 +
      (cubed * 0.0002213) / 1000 +
      age * 0.0953;
  } else if (group === 1) {
    value = (bmi10 * 1.663) / 10 - 22.6 +
      (squared * -0.01287) / 100 +
      (cubed * 0.0001332) / 1000 +
      age * 0.09619;
  } else if (group === 2) {
    value = (bmi10 * 1.334) / 10 - 6.982 +
      (squared * -0.02111) / 100 +
      (cubed * 0.0002054) / 1000 +
      age * 0.03189;
  } else {
    // Group 3 reads the group-1 base (already clamped) and corrects it.
    value = subcutaneousFat(bmi10, age, 1) * 0.4305 + 4.954 + age * -0.0145;
  }
  return clamp(value, 4.7, group === 3 ? 61 : 59.7);
}

/** A frame's timestamp as a log-entry wall time (`YYYY-MM-DDTHH:mm`), or null. */
export function timestampWall(t: LeFuTimestamp): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
}

