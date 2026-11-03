import { View } from "react-native";
import { cn } from "./cn";
import { BAR_CORNERS } from "./radius";

/** The web's Progress (h-1.5 on bg-muted, the fill bg-primary). `label` is the screen-reader name. */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      className={cn("h-1.5 w-full overflow-hidden bg-muted", BAR_CORNERS, className)}
    >
      <View className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </View>
  );
}
