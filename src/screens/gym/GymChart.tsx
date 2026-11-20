// An exercise chart (the Charts tab of `/gym/exercise/[id]`): one value per session on a time axis, its level ticks on
// the right and the months (or years) under it, as Strong draws them. Plain SVG, as MiniLine: a few hundred points need
// no Skia canvas, and a page of four charts stays light on a small phone.
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/ui/theme";
import { niceTicks, timeLabels } from "./chartAxis";

export type ChartPoint = { ts: number; value: number };

const HEIGHT = 168;
const AXIS_W = 52;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

export function GymChart({ points, from, to, format }: { points: ChartPoint[]; from: number; to: number; format: (v: number) => string }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - AXIS_W);
  const span = Math.max(1, to - from);
  const x = (ts: number) => 6 + ((ts - from) / span) * Math.max(0, plotW - 12);
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / (hi - lo || 1)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ts).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  // A dot per session while they are far enough apart to read; past that the line says it.
  const dots = points.length <= 48;
  const last = points[points.length - 1];
  const labels = timeLabels(from, to);
  return (
    <View className="w-full" style={{ height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((v) => (
            <Line key={`g${v}`} x1={0} y1={y(v)} x2={plotW} y2={y(v)} stroke={c.border} strokeWidth={1} strokeDasharray={v === lo ? undefined : "3 4"} />
          ))}
          {ticks.map((v) => (
            <SvgText key={`t${v}`} x={plotW + 8} y={y(v) + 4} fill={c["muted-foreground"]} fontSize={11}>
              {format(v)}
            </SvgText>
          ))}
          {labels.map((l) => (
            <SvgText key={l.ts} x={x(l.ts)} y={HEIGHT - 6} fill={c["muted-foreground"]} fontSize={11} textAnchor="middle">
              {l.label}
            </SvgText>
          ))}
          <Path d={d} stroke={c.strain} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {dots && points.map((p) => <Circle key={p.ts} cx={x(p.ts)} cy={y(p.value)} r={2.6} fill={c.background} stroke={c.strain} strokeWidth={1.6} />)}
          {last && <Circle cx={x(last.ts)} cy={y(last.value)} r={4.5} fill={c.strain} />}
        </Svg>
      )}
    </View>
  );
}
