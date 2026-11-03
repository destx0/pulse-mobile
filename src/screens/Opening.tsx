// The opening: takes over from the native splash screen and plays the mark's one lub-dub (docs/design/brand.md, "the
// mark's natural motion is a single lub-dub"), the sign-in hero's beat (pulse globals.css beat-up / beat-down /
// beat-glow, ported in src/screens/onboarding/HeartbeatMark.tsx) played once, then fades to the first screen.
//
// Its first frame is the native splash: the expo-splash-screen plugin (app.json) centres a square `imageWidth` box on
// the whole window, the mark filling the box's height (assets/brand/splash-icon.svg, viewBox 4.5 4.5 15 15), on the
// scheme's splash colour. This overlay draws the same box at the window's centre, so the native splash hides with no
// fade over an identical picture. With reduce motion the overlay never shows: the native splash hands straight over.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The splash colours and the mark's size: app.json's expo-splash-screen `backgroundColor`, `dark.backgroundColor`, `imageWidth`. */
const GROUND = { light: "#f6f8f9", dark: "#101518" } as const;
const MARK = 64;
/** The splash image's colours (assets/brand/splash-icon.svg), in both schemes, as on the web's launch screens. */
const LUB = "#00f19f";
const DUB = "#1fa0f0";

/** One beat of HeartbeatMark: out 1.1 viewBox units by 14 % of 1.2 s, back by 32 %; the dub 160 ms after the lub. */
const EASE = Easing.bezier(0.37, 0, 0.63, 1);
const OUT_MS = 168;
const BACK_MS = 216;
const DUB_DELAY_MS = 160;
const MOVE = 1.1;
/** The glow peaks with the beat (18 % of 1.2 s) at the hero's 0.55 and is gone before the fade ends. */
const GLOW_PEAK_MS = 216;
const GLOW_PEAK = 0.55;
/** The overlay fades as the dub settles: 520 ms in, 300 ms long, so the whole opening is 820 ms. */
const FADE_AT_MS = 520;
const FADE_MS = 300;
/** After the first hand-over the mark only has to cover the splash: a short fade, no beat. */
const SEEN_KEY = "pulse.opening.seen";
const SHORT_MS = 180;

/** Room around the mark for the move: Android clips an SVG at its bounds. */
const PAD = 1.5;
const BOX = (MARK * (15 + 2 * PAD)) / 15;
/** The hero's glow box is 160 for a 96 mark. */
const GLOW = (MARK * 160) / 96;

/** Mounted over the app from the first render; `ready` is when the app below can paint its first screen. */
export function Opening({ ready }: { ready: boolean }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const reduce = useReducedMotion();
  const [laidOut, setLaidOut] = useState(false);
  const [done, setDone] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        seen.current = !!v;
      })
      .catch(() => {});
  }, []);
  const up = useSharedValue(0);
  const down = useSharedValue(0);
  const glow = useSharedValue(0);
  const shown = useSharedValue(1);

  useEffect(() => {
    if (!ready || !laidOut) return;
    // The overlay is on screen under the native splash: the splash goes at once (no fade, app/_layout.tsx), the picture
    // does not change.
    SplashScreen.hide();
    void AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
    if (reduce) return;
    if (seen.current) {
      shown.value = withTiming(0, { duration: SHORT_MS, easing: Easing.bezier(0.2, 0, 0, 1) }, (finished) => {
        if (finished) runOnJS(setDone)(true);
      });
      return;
    }
    const beat = (to: number) => withSequence(withTiming(to, { duration: OUT_MS, easing: EASE }), withTiming(0, { duration: BACK_MS, easing: EASE }));
    up.value = beat(-MOVE);
    down.value = withDelay(DUB_DELAY_MS, beat(MOVE));
    glow.value = withSequence(withTiming(1, { duration: GLOW_PEAK_MS, easing: EASE }), withTiming(0, { duration: FADE_AT_MS + FADE_MS - GLOW_PEAK_MS, easing: EASE }));
    shown.value = withDelay(
      FADE_AT_MS,
      withTiming(0, { duration: FADE_MS, easing: Easing.bezier(0.2, 0, 0, 1) }, (finished) => {
        if (finished) runOnJS(setDone)(true);
      }),
    );
  }, [ready, laidOut, reduce, up, down, glow, shown]);

  const upProps = useAnimatedProps(() => ({ y: 4.5 + up.value }));
  const downProps = useAnimatedProps(() => ({ y: 8.5 + down.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: GLOW_PEAK * glow.value, transform: [{ scale: 1 + 0.06 * glow.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  if (done || (reduce && ready && laidOut)) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => setLaidOut(true)}
      style={[StyleSheet.absoluteFill, { backgroundColor: GROUND[scheme], alignItems: "center", justifyContent: "center" }, overlayStyle]}
    >
      <Animated.View style={[{ position: "absolute", width: GLOW, height: GLOW }, glowStyle]}>
        <Svg width={GLOW} height={GLOW}>
          <Defs>
            <RadialGradient id="opening-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={LUB} stopOpacity={1} />
              <Stop offset="0.55" stopColor={DUB} stopOpacity={0.6} />
              <Stop offset="1" stopColor={DUB} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#opening-glow)" />
        </Svg>
      </Animated.View>
      <View style={{ width: BOX, height: BOX }}>
        <Svg viewBox={`${4.5 - PAD} ${4.5 - PAD} ${15 + 2 * PAD} ${15 + 2 * PAD}`} width={BOX} height={BOX}>
          <AnimatedRect x={6.9} y={4.5} width={4.2} height={11} rx={2.1} fill={LUB} animatedProps={upProps} />
          <AnimatedRect x={12.9} y={8.5} width={4.2} height={11} rx={2.1} fill={DUB} animatedProps={downProps} />
        </Svg>
      </View>
    </Animated.View>
  );
}
