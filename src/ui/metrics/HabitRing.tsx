import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { arcPath } from "../charts/geometry";
import { useTheme } from "../theme";

const GAP = 4;
const SWEEP = 352;

/** The habit card's score ring: an arc from 4° clockwise, filled by the 0-1 score, with the score text inside. */
export function HabitRing({ value, color, size = 48, stroke = 4, children }: { value: number; color: string; size?: number; stroke?: number; children?: ReactNode }) {
  const { c } = useTheme();
  const r = size / 2 - stroke / 2;
  const shown = Math.max(0, Math.min(1, value)) * SWEEP;
  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Path d={arcPath(size / 2, size / 2, r, GAP, GAP + SWEEP)} stroke={c["dial-track"]} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {shown > 0 && <Path d={arcPath(size / 2, size / 2, r, GAP, GAP + shown)} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
      </Svg>
      {children}
    </View>
  );
}
