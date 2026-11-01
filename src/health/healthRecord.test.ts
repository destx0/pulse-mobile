import { describe, expect, it } from "vitest";
import { buildScaleRecords, scaleClientRecordId, type ScaleWeighIn } from "./healthRecord";

const at = Date.UTC(2026, 10, 1, 9, 30, 15);

const weighIn = (over: Partial<ScaleWeighIn> = {}): ScaleWeighIn => ({
  atMs: at,
  kg: 70.04,
  fatPct: 15.96,
  ...over,
});

describe("scale Health Connect records", () => {
  it("builds a weight record in kilograms at the weigh-in instant", () => {
    const { weight } = buildScaleRecords(weighIn());
    expect(weight.recordType).toBe("Weight");
    expect(weight.time).toBe(new Date(at).toISOString());
    expect(weight.weight).toEqual({ value: 70, unit: "kilograms" });
    expect(weight.metadata?.clientRecordId).toMatch(/^pulse-scale-/);
    expect(weight.metadata?.clientRecordVersion).toBe(1);
    expect(weight.metadata?.recordingMethod).toBe(3);
    expect(weight.metadata?.device).toMatchObject({ manufacturer: "Pulse", model: "HealthSense BS191", type: 3 });
  });

  it("adds a body-fat record with its own client id when fat was measured", () => {
    const { weight, fat } = buildScaleRecords(weighIn({ fatPct: 15.96 }));
    expect(fat?.recordType).toBe("BodyFat");
    expect(fat?.time).toBe(weight.time);
    expect(fat?.percentage).toBe(16);
    expect(fat?.metadata?.clientRecordId).toBe(`${weight.metadata?.clientRecordId}-fat`);
  });

  it("leaves body fat out for a weight-only weigh-in", () => {
    const { weight, fat } = buildScaleRecords(weighIn({ fatPct: null }));
    expect(weight.recordType).toBe("Weight");
    expect(fat).toBeNull();
  });

  it("keeps the client id stable across retries and changes it with the reading", () => {
    const id = scaleClientRecordId(weighIn());
    expect(scaleClientRecordId(weighIn())).toBe(id);
    expect(scaleClientRecordId(weighIn({ kg: 70.1 }))).not.toBe(id);
    expect(scaleClientRecordId(weighIn({ fatPct: null }))).not.toBe(id);
    expect(scaleClientRecordId(weighIn({ atMs: at + 1_000 }))).not.toBe(id);
  });

  it("uses the scale's model when one is given", () => {
    expect(buildScaleRecords(weighIn({ model: "HealthSense BS191" })).weight.metadata?.device?.model).toBe("HealthSense BS191");
    expect(buildScaleRecords(weighIn({ model: "LeFu V3" })).weight.metadata?.device?.model).toBe("LeFu V3");
  });
});
