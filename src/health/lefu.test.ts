import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import {
  historyClear,
  historyRequest,
  encodeClock,
  encodeProfile,
  decodeLeFuFrame,
  hasImpedance,
  isFinalLeFuFrame,
  leFuBodyComposition,
  LIVE_FRAME_LEN,
  parseLeFuProfile,
  profileFromName,
  timestampWall,
  validateLeFuBodyInput,
  weightKgOf,
  xorChecksum,
  type LeFuBodyInput,
  type LeFuProfile,
} from "./lefu";

const V3: LeFuProfile = { protocol: "V3", scaleType: "CF", calcType: "direct", typeString: "CF01ABCDEFG" };
const V2: LeFuProfile = { protocol: "V2", scaleType: "CF", calcType: "unknown", typeString: null };

type FrameOptions = {
  weightRaw?: number;
  impedanceRaw24?: number;
  status?: number;
  unit?: number;
  marker?: number;
  legacyImpedance?: number;
  badChecksum?: boolean;
};

function liveFrame(options: FrameOptions = {}): Uint8Array {
  const { weightRaw = 7000, impedanceRaw24 = 0, status = 0, unit = 0, marker = 0xcf, legacyImpedance = 0, badChecksum = false } = options;
  const bytes = new Uint8Array(LIVE_FRAME_LEN);
  bytes[0] = marker;
  bytes[1] = legacyImpedance & 0xff;
  bytes[2] = (legacyImpedance >> 8) & 0xff;
  bytes[3] = weightRaw & 0xff;
  bytes[4] = (weightRaw >> 8) & 0xff;
  bytes[5] = impedanceRaw24 & 0xff;
  bytes[6] = (impedanceRaw24 >> 8) & 0xff;
  bytes[7] = (impedanceRaw24 >> 16) & 0xff;
  bytes[8] = unit;
  bytes[9] = status;
  bytes[10] = badChecksum ? 0x00 : xorChecksum(bytes, 10);
  return bytes;
}

describe("LeFu frames", () => {
  it("decodes a V3 weight and its 24-bit impedance in tenths of an ohm", () => {
    const frame = decodeLeFuFrame(liveFrame({ weightRaw: 7000, impedanceRaw24: 5000 }), V3)!;
    expect(frame.weightKg).toBeCloseTo(70, 3);
    expect(frame.impedanceOhm).toBeCloseTo(500, 2);
    expect(frame.checksumValid).toBe(true);
    expect(frame.isHistory).toBe(false);
    expect(isFinalLeFuFrame(frame, V3)).toBe(true);
  });

  it("reads a V3 Alternate subtype's 24-bit field as raw ohms", () => {
    const alternate: LeFuProfile = { ...V3, calcType: "alternate" };
    expect(decodeLeFuFrame(liveFrame({ weightRaw: 7000, impedanceRaw24: 500 }), alternate)!.impedanceOhm).toBeCloseTo(500, 2);
  });

  it("treats status 0 as a final body frame and status 1 as a final weight-only frame", () => {
    const body = decodeLeFuFrame(liveFrame({ weightRaw: 7000, impedanceRaw24: 5000, status: 0 }), V3)!;
    const weightOnly = decodeLeFuFrame(liveFrame({ weightRaw: 7000, status: 1 }), V3)!;
    expect(isFinalLeFuFrame(body, V3)).toBe(true);
    expect(isFinalLeFuFrame(weightOnly, V3)).toBe(true);
    expect(hasImpedance(body)).toBe(true);
    expect(hasImpedance(weightOnly)).toBe(false);
  });

  it("leaves a settling frame unsettled", () => {
    const frame = decodeLeFuFrame(liveFrame({ weightRaw: 6910, status: 2 }), V3)!;
    expect(isFinalLeFuFrame(frame, V3)).toBe(false);
  });

  it("treats V2 status 0 and 0x36 as final, but not the weight-only marker", () => {
    expect(isFinalLeFuFrame(decodeLeFuFrame(liveFrame({ weightRaw: 7000, status: 0 }), V2)!, V2)).toBe(true);
    expect(isFinalLeFuFrame(decodeLeFuFrame(liveFrame({ weightRaw: 7000, status: 0x36 }), V2)!, V2)).toBe(true);
    expect(isFinalLeFuFrame(decodeLeFuFrame(liveFrame({ weightRaw: 7000, status: 1 }), V2)!, V2)).toBe(false);
  });

  it("prefers the V2 16-bit field and falls back when it is implausible", () => {
    const normal = decodeLeFuFrame(liveFrame({ weightRaw: 10160, legacyImpedance: 3920 }), V2)!;
    expect(normal.impedanceOhm).toBeCloseTo(392, 2);

    // 0xFFFF is > 1200 Ω, so the 24-bit field is used instead.
    const fallback = decodeLeFuFrame(liveFrame({ weightRaw: 7000, legacyImpedance: 0xffff, impedanceRaw24: 5000 }), V2)!;
    expect(fallback.impedanceOhm).toBeCloseTo(500, 2);
  });

  it("converts pounds and stones to kilograms", () => {
    expect(decodeLeFuFrame(liveFrame({ weightRaw: 15432, unit: 1 }), V3)!.weightKg).toBeCloseTo(70, 2);
    expect(weightKgOf(1100, 2)).toBeCloseTo(69.853, 3);
  });

  it("decodes a history frame's timestamp", () => {
    const bytes = new Uint8Array(18);
    bytes.set(liveFrame({ weightRaw: 7000, impedanceRaw24: 5000 }));
    bytes[11] = 0x07;
    bytes[12] = 0xea; // 2026
    bytes[13] = 8;
    bytes[14] = 12;
    bytes[15] = 9;
    bytes[16] = 11;
    bytes[17] = 43;

    const frame = decodeLeFuFrame(bytes, V3)!;
    expect(frame.isHistory).toBe(true);
    expect(frame.timestamp).toEqual({ year: 2026, month: 8, day: 12, hour: 9, minute: 11, second: 43 });
    expect(timestampWall(frame.timestamp!)).toBe("2026-08-12T09:11");
  });

  it("does not mistake a coalesced settled duplicate for history", () => {
    const single = liveFrame({ weightRaw: 7000, impedanceRaw24: 5000 });
    const coalesced = new Uint8Array(single.length + 9);
    coalesced.set(single);
    coalesced.set(single.subarray(0, 9), single.length);

    const frame = decodeLeFuFrame(coalesced, V3)!;
    expect(frame.isHistory).toBe(false);
    expect(frame.timestamp).toBeNull();
  });

  it("keeps the weight when the XOR is wrong", () => {
    const frame = decodeLeFuFrame(liveFrame({ weightRaw: 7000, impedanceRaw24: 5000, badChecksum: true }), V3)!;
    expect(frame.checksumValid).toBe(false);
    expect(frame.weightKg).toBeCloseTo(70, 3);
  });

  it("rejects a frame that is not a measurement", () => {
    expect(decodeLeFuFrame(new Uint8Array(0), V3)).toBeNull();
    expect(decodeLeFuFrame(liveFrame({ marker: 0xaa }), V3)).toBeNull();
    expect(decodeLeFuFrame(liveFrame({ weightRaw: 0 }), V3)).toBeNull();
  });
});

describe("LeFu commands", () => {
  it("carries the athlete bit and the XOR in the V3 profile command", () => {
    const normal = encodeProfile(V3, { unitCode: 0, athlete: false, male: true, age: 45, heightCm: 180 });
    const athlete = encodeProfile(V3, { unitCode: 0, athlete: true, male: true, age: 45, heightCm: 180 });

    expect(normal).toHaveLength(11);
    expect(normal[0]).toBe(0xfd);
    expect(normal[1]).toBe(0x37);
    expect(normal[4]).toBe(0x00);
    expect(athlete[4]).toBe(0x02);
    expect(athlete[5]).toBe(0x01);
    expect(athlete[6]).toBe(45);
    expect(athlete[7]).toBe(180);
    expect(athlete[10]).toBe(xorChecksum(athlete, 10));
  });

  it("writes the V2 unit/group frame", () => {
    const bytes = encodeProfile(V2, { unitCode: 0, athlete: true, male: true, age: 45, heightCm: 180 });
    expect([...bytes.slice(0, 4)]).toEqual([0xfd, 0x37, 0x00, 0x00]);
    expect(bytes[10]).toBe(xorChecksum(bytes, 10));
  });

  it("encodes the clock with a big-endian year", () => {
    const bytes = encodeClock({ year: 2026, month: 8, day: 12, hour: 9, minute: 11, second: 43 });
    expect([...bytes]).toEqual([0xf1, 0x07, 0xea, 8, 12, 9, 11, 43]);
  });

  it("uses F2 00 to read and F2 01 to clear history", () => {
    expect([...historyRequest()]).toEqual([0xf2, 0x00]);
    expect([...historyClear()]).toEqual([0xf2, 0x01]);
  });
});

describe("LeFu advertisement", () => {
  const advertisement = (size: number, offset: number): Uint8Array => {
    const payload = new Uint8Array(size).fill(0x30);
    const type = "CF01ABCDEFG";
    for (let i = 0; i < type.length; i++) payload[offset + i] = type.charCodeAt(i);
    return payload;
  };

  it("reads an 18-byte manufacturer payload as V3 at offset 6", () => {
    const profile = parseLeFuProfile(advertisement(18, 6), false, false)!;
    expect(profile.protocol).toBe("V3");
    expect(profile.scaleType).toBe("CF");
    expect(profile.calcType).toBe("direct");
    expect(profile.typeString).toBe("CF01ABCDEFG");
  });

  it("reads a 17-byte payload as V2", () => {
    expect(parseLeFuProfile(advertisement(17, 6), false, false)!.protocol).toBe("V2");
  });

  it("reads the shorter V3 and V2 payloads, and ignores one too short for a type string", () => {
    expect(parseLeFuProfile(advertisement(16, 4), false, false)!.protocol).toBe("V3");
    expect(parseLeFuProfile(advertisement(15, 4), false, false)!.protocol).toBe("V2");
    expect(parseLeFuProfile(advertisement(6, 0), false, false)).toBeNull();
  });

  it("reads an exact Health Scale name's 18-byte payload at offset 4 as V2", () => {
    const profile = parseLeFuProfile(advertisement(18, 4), false, true)!;
    expect(profile.protocol).toBe("V2");
    expect(profile.typeString).toBe("CF01ABCDEFG");
  });

  it("tries the other offsets for service data", () => {
    const profile = parseLeFuProfile(advertisement(18, 0), true, false)!;
    expect(profile.protocol).toBe("V3");
    expect(profile.typeString).toBe("CF01ABCDEFG");
  });

  it("maps the Alternate and no-impedance subtypes", () => {
    const alternate = advertisement(18, 6);
    alternate[8] = "0".charCodeAt(0);
    alternate[9] = "5".charCodeAt(0);
    expect(parseLeFuProfile(alternate, false, false)!.calcType).toBe("alternate");

    const noImpedance = advertisement(18, 6);
    noImpedance[6] = "C".charCodeAt(0);
    noImpedance[7] = "E".charCodeAt(0);
    expect(parseLeFuProfile(noImpedance, false, false)!.calcType).toBe("needNot");
  });

  it("ignores bytes that are not a type string", () => {
    expect(parseLeFuProfile(new Uint8Array(18).fill(0x30), false, false)).toBeNull();
    expect(parseLeFuProfile(null, false, false)).toBeNull();
  });

  it("falls back to the device name", () => {
    expect(profileFromName("BS191")).toEqual({ protocol: "V3", scaleType: "CF", calcType: "direct", typeString: null });
    expect(profileFromName("Health Sense")).toEqual({ protocol: "V3", scaleType: "CF", calcType: "direct", typeString: null });
    expect(profileFromName("Health Scale")).toEqual({ protocol: "V2", scaleType: "CF", calcType: "unknown", typeString: null });
    expect(profileFromName("Kitchen radio")).toBeNull();
  });
});

describe("LeFu body composition", () => {
  const input = (over: Partial<LeFuBodyInput> = {}): LeFuBodyInput => ({
    weightKg: 65,
    heightCm: 170,
    age: 45,
    male: true,
    athlete: false,
    impedanceOhm: 600,
    ...over,
  });

  const expectComposition = (actual: ReturnType<typeof leFuBodyComposition>, want: Record<string, number>) => {
    expect(actual).not.toBeNull();
    for (const [key, value] of Object.entries(want)) {
      expect(actual![key as keyof typeof actual], key).toBeCloseTo(value, 3);
    }
  };

  it("matches the vendor group 1: male non-athlete", () => {
    expectComposition(leFuBodyComposition(input()), {
      bmi: 22.5,
      bodyFatPercent: 15.8975,
      waterPercent: 60.70345,
      proteinPercent: 19.1722,
      muscleKg: 51.898957,
      boneKg: 2.7334638,
      skeletalMusclePercent: 54.31095,
      visceralFatLevel: 5,
      subcutaneousFatPercent: 14.147844,
      leanMassKg: 54.666626,
      bmrKcal: 1550,
      bodyAgeYears: 42,
    });
  });

  it("matches the vendor group 0: female non-athlete", () => {
    expectComposition(leFuBodyComposition(input({ weightKg: 60, heightCm: 165, age: 30, male: false, impedanceOhm: 550 })), {
      bmi: 22,
      bodyFatPercent: 23.187,
      waterPercent: 52.6974,
      proteinPercent: 18.3361,
      muscleKg: 43.314,
      boneKg: 2.7653553,
      skeletalMusclePercent: 44.7552,
      visceralFatLevel: 4,
      subcutaneousFatPercent: 21.386482,
      leanMassKg: 46.0878,
      bmrKcal: 1363,
      bodyAgeYears: 29,
    });
  });

  it("matches the vendor group 3: male athlete", () => {
    expectComposition(leFuBodyComposition(input({ weightKg: 80, heightCm: 180, age: 25, male: true, athlete: true, impedanceOhm: 450 })), {
      bmi: 24.7,
      bodyFatPercent: 13.146165,
      waterPercent: 62.69203,
      proteinPercent: 19.798635,
      muscleKg: 65.98367,
      boneKg: 3.4739378,
      skeletalMusclePercent: 56.09948,
      visceralFatLevel: 7,
      subcutaneousFatPercent: 11.0645895,
      leanMassKg: 69.48307,
      bmrKcal: 1870,
      bodyAgeYears: 25,
    });
  });

  it("matches the vendor group 2: female athlete", () => {
    expectComposition(leFuBodyComposition(input({ weightKg: 55, heightCm: 160, age: 35, male: false, athlete: true, impedanceOhm: 700 })), {
      bmi: 21.5,
      bodyFatPercent: 16.57641,
      waterPercent: 57.2395,
      proteinPercent: 20.3409,
      muscleKg: 43.113235,
      boneKg: 2.7531395,
      skeletalMusclePercent: 48.6034,
      visceralFatLevel: 4,
      subcutaneousFatPercent: 15.098395,
      leanMassKg: 45.882973,
      bmrKcal: 1361,
      bodyAgeYears: 35,
    });
  });

  it("clamps an extreme female reading instead of running away", () => {
    expectComposition(leFuBodyComposition(input({ weightKg: 100, heightCm: 150, age: 50, male: false, impedanceOhm: 300 })), {
      bmi: 44.4,
      bodyFatPercent: 59.753,
      waterPercent: 27.605,
      proteinPercent: 7.23246,
      muscleKg: 37.8212,
      boneKg: 2.415548,
      skeletalMusclePercent: 23.452,
      visceralFatLevel: 25,
      subcutaneousFatPercent: 50.981235,
      leanMassKg: 40.247,
      bmrKcal: 1227,
      bodyAgeYears: 60,
    });
  });

  it("clamps a low BMI and high impedance at the vendor limits", () => {
    expectComposition(leFuBodyComposition(input({ weightKg: 45, heightCm: 190, age: 18, impedanceOhm: 900 })), {
      bmi: 12.5,
      bodyFatPercent: 5.1,
      waterPercent: 68.5,
      proteinPercent: 21.64,
      muscleKg: 40.5675,
      boneKg: 2.2963984,
      skeletalMusclePercent: 61.3,
      visceralFatLevel: 1,
      subcutaneousFatPercent: 4.7,
      leanMassKg: 42.705,
      bmrKcal: 1363,
      bodyAgeYears: 20,
    });
  });

  it("rejects inputs outside the native ranges and refuses to compute them", () => {
    expect(validateLeFuBodyInput(input())).toBeNull();
    expect(validateLeFuBodyInput(input({ weightKg: 9.99 }))).toBe("weight");
    expect(validateLeFuBodyInput(input({ weightKg: 180.01 }))).toBe("weight");
    expect(validateLeFuBodyInput(input({ impedanceOhm: 199 }))).toBe("impedance");
    expect(validateLeFuBodyInput(input({ impedanceOhm: 1201 }))).toBe("impedance");
    expect(validateLeFuBodyInput(input({ heightCm: 99 }))).toBe("height");
    expect(validateLeFuBodyInput(input({ age: 2 }))).toBe("age");
    expect(validateLeFuBodyInput(input({ age: 101 }))).toBe("age");
    expect(leFuBodyComposition(input({ impedanceOhm: 0 }))).toBeNull();
  });
});

describe("base64", () => {
  it("round-trips bytes, padding and the URL-safe spellings", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe("AAEC+vv8/f7/");
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});
