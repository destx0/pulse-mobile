import { useEffect, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { cn } from "./cn";
import { haptic } from "./haptics";
import { DURATION, EASE } from "./motion";
import { Text } from "./Text";

/** One segment (the web's SEGMENT_ITEM): 40 px, 8 px corners; the chosen one adds SEGMENT_ON until the pill has measured it. Add the width and padding. */
export const SEGMENT = "h-10 items-center justify-center rounded-md";
export const SEGMENT_ON = "bg-secondary";

type Box = { x: number; y: number; width: number; height: number };

/**
 * The W / M / 6M segmented control (web: SEGMENT_TRACK and SEGMENT_ITEM in primitives.tsx, a ToggleGroup): a muted
 * track, the chosen segment raised. `fill` stretches the segments to share the width (four ranges, or the stages tabs),
 * with the web's px-2 (Tonight's sleep). A label never breaks inside its word: where a third of a 320 px card is short of
 * it ("PERFORM"), the web's grid column grows to the word; here the word scales down a little to fit.
 *
 * The raised segment is one absolutely positioned pill, measured from the chosen segment and moved with a transform, so
 * the choice slides instead of blinking from one button to another (the tab bar's lens, smaller). The selected segment
 * keeps SEGMENT_ON only until its box has been measured, which hides the one-frame seam on mount.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fill,
  label,
  textClassName = "font-numeric text-[13px] font-bold",
}: {
  value: T;
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  onChange: (v: T) => void;
  fill?: boolean;
  /** Spoken name of the control ("Range"). */
  label: string;
  textClassName?: string;
}) {
  const reduce = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const box = boxes[value];
  const placed = useRef(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);

  // The first sight of the chosen segment places the pill; every choice after it moves there.
  useEffect(() => {
    const b = boxes[value];
    if (!b) return;
    if (!placed.current || reduce) {
      x.value = b.x;
      y.value = b.y;
      w.value = b.width;
      h.value = b.height;
      placed.current = true;
      return;
    }
    const config = { duration: DURATION.fast, easing: EASE.standard };
    x.value = withTiming(b.x, config);
    y.value = withTiming(b.y, config);
    w.value = withTiming(b.width, config);
    h.value = withTiming(b.height, config);
  }, [boxes, value, reduce, x, y, w, h]);

  const pill = useAnimatedStyle(() => ({
    width: w.value,
    height: h.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const measure = (v: T) => (e: LayoutChangeEvent) => {
    const { x: bx, y: by, width, height } = e.nativeEvent.layout;
    // Before the state lands: put the chosen pill where it belongs, so its first painted frame is not a 0 × 0 flash.
    if (v === value && !placed.current) {
      x.value = bx;
      y.value = by;
      w.value = width;
      h.value = height;
      placed.current = true;
    }
    setBoxes((all) => {
      const was = all[v];
      if (was && was.x === bx && was.y === by && was.width === width && was.height === height) return all;
      return { ...all, [v]: { x: bx, y: by, width, height } };
    });
  };

  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} className={cn("flex-row gap-0.5 rounded-lg bg-muted p-0.5", fill ? "w-full" : "shrink-0")}>
      {!!box && <Animated.View pointerEvents="none" className="absolute left-0 top-0 rounded-md bg-secondary" style={pill} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onLayout={measure(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
            className={cn(SEGMENT, fill ? "flex-1 px-2" : "min-w-11 px-3", on && !box && SEGMENT_ON)}
          >
            <Text className={cn(textClassName, on ? "text-foreground" : "text-muted-foreground")} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
