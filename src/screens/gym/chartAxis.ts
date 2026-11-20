// The exercise charts' axes (GymChart.tsx), kept apart from React Native so the tests run in Node.
import { formatDay } from "@/lib/format";

/** Round level ticks covering [min, max]: 3 to 5 of them on a 1, 2, 2.5 or 5 step. */
export function niceTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min < 1e-9) {
    const pad = Math.max(1, Math.abs(max) * 0.1);
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / 3;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Labels under the axis: each month's start inside the range, or each year's once it spans more than 13 months. */
export function timeLabels(from: number, to: number, maxLabels = 5): { ts: number; label: string }[] {
  const years = to - from > 400 * 86_400;
  const out: { ts: number; label: string }[] = [];
  const d = new Date(from * 1000);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  if (years) d.setUTCMonth(0);
  while (d.getTime() / 1000 <= to) {
    const ts = d.getTime() / 1000;
    if (ts >= from) {
      const day = d.toISOString().slice(0, 10);
      out.push({ ts, label: years ? day.slice(0, 4) : formatDay(day, { month: "short" }) });
    }
    if (years) d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const every = Math.ceil(out.length / maxLabels);
  return out.filter((_, i) => i % every === 0);
}
