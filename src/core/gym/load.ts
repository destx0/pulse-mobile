// The numbers of a set: the unit a weight is shown in, its estimated one-rep max, and the plates that make it up.
// Pure arithmetic, so the tracking screen, the calculator and the tests all read the same rules.
import type { WeightUnit } from "./types";

export const KG_PER_LB = 0.45359237;

/** The plates a gym is assumed to own, heaviest first. A bar's own inventory is editable in the calculator. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/** A stored kilogram value as the unit says it. */
export const toUnit = (kg: number, unit: WeightUnit) => (unit === "lb" ? kg / KG_PER_LB : kg);

/** A value typed in `unit` as kilograms, the one thing the database stores. */
export const fromUnit = (value: number, unit: WeightUnit) => (unit === "lb" ? value * KG_PER_LB : value);

/** The step a weight moves by: 0.5 kg, or 1 lb (Strong's own increments). */
export const stepOf = (unit: WeightUnit) => (unit === "lb" ? 1 : 0.5);

/** Snaps a weight to the unit's step, so 62.4999 shows as 62.5 and 137.79 lb as 138. */
export function roundLoad(kg: number, unit: WeightUnit): number {
  const v = toUnit(kg, unit);
  const step = stepOf(unit);
  return Math.round(v / step) * step;
}

/** A weight without trailing zeros: 100, 62.5, 62.25. */
export function trimLoad(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** "62.5" or "137.5": the value in `unit`, trimmed. */
export const loadText = (kg: number, unit: WeightUnit) => trimLoad(roundLoad(kg, unit));

/**
 * Epley's estimate: w·(1 + r/30). It is the one the gym world quotes for a set of 1 to 10, and it stays sane for a set
 * of 20 where Brzycki's denominator goes to nothing.
 */
export const epley = (weightKg: number, reps: number) => (reps <= 0 ? 0 : reps === 1 ? weightKg : weightKg * (1 + reps / 30));

/** Brzycki's estimate: w·36/(37 − r). Undefined at 37 reps, so callers cap the reps they ask about. */
export const brzycki = (weightKg: number, reps: number) => (reps >= 37 ? 0 : (weightKg * 36) / (37 - reps));

/**
 * The estimated one-rep max of a set: the heavier of the two estimates up to 10 reps (they agree within a few per cent
 * there), Epley's alone past it. Zero for a bodyweight or timed set.
 */
export function estimate1Rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  const e = epley(weightKg, reps);
  const b = reps <= 10 ? brzycki(weightKg, reps) : 0;
  return Math.round(Math.max(e, b) * 10) / 10;
}

/** The weight that is `percent` of a one-rep max, snapped to the unit's step. */
export const percentOf1Rm = (oneRmKg: number, percent: number, unit: WeightUnit) => roundLoad((oneRmKg * percent) / 100, unit);

/** The percentages a training-max table shows. */
export const RM_PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60];

export type PlateResult = {
  /** One plate per entry, per side, heaviest first. */
  perSide: number[];
  /** The weight left that no plate can make, in `unit`. */
  remainder: number;
  /** True when the bar alone is heavier than the target. */
  belowBar: boolean;
};

/**
 * The plates for one side of a bar. Greedy from the heaviest plate: with the usual 25/20/15/10/5/2.5/1.25 set the
 * greedy answer is the smallest one, and a missing plate leaves a remainder the screen shows rather than silently
 * rounding the weight.
 */
export function platesPerSide(totalKg: number, barKg: number, platesKg: readonly number[], unit: WeightUnit): PlateResult {
  const total = toUnit(totalKg, unit);
  const bar = toUnit(barKg, unit);
  const plates = [...platesKg].sort((a, b) => b - a);
  let side = (total - bar) / 2;
  if (side <= 0) return { perSide: [], remainder: Math.max(0, Math.round(side * 100) / 100), belowBar: total < bar };
  const perSide: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  return { perSide, remainder: Math.round(side * 100) / 100, belowBar: false };
}

/** The common bar weights, in the unit they are sold in. */
export const BARS = { kg: [20, 15, 10, 7.5], lb: [45, 35, 25, 15] } as const;
