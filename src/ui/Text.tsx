import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Platform, Text as RNText, StyleSheet, Dimensions, type TextStyle } from "react-native";
import { cssInterop } from "nativewind";
import { FACES, hasColorClass, readFontCached, type Face } from "./fontClasses";

// The web app sets type with classes (font-numeric font-bold) and the browser picks the right font file. React Native
// cannot: a custom font is chosen by its exact family name ("Barlow_700Bold"), and fontWeight is ignored or, on
// Android, can even fall back to the system font. So this <Text> reads the font classes off `className`, drops them
// and sets `fontFamily` itself. Nested <Text> inherits the family and weight of its parent unless it names its own,
// as CSS does. Everything else in `className` (size, colour, tracking ...) goes to NativeWind untouched.

/** Ascent plus descent, in em, of both families (Barlow 1.0 + 0.2, Figtree 0.95 + 0.25): the font's own line height. */
const NATURAL = 1.2;

/** Type scales down on phones narrower than the iPhone 17 (402 pt), linearly to 92 % at 360 pt and below; 402 and up are unchanged. */
export function typeScale(width: number) {
  return Math.min(1, Math.max(0.92, 0.92 + ((width - 360) / 42) * 0.08));
}

const scaleOf = () => typeScale(Dimensions.get("window").width);

/**
 * One Dimensions subscription for every <Text>, not one per text node. The scale changes only when the window width
 * crosses a breakpoint (rotation, a foldable, a split screen), so it lives above the screens; text outside the provider
 * (the boot error) falls back to a direct read.
 */
const TypeScaleContext = createContext<number | null>(null);

export function TypeScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(scaleOf);
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setScale(typeScale(window.width)));
    return () => sub.remove();
  }, []);
  return <TypeScaleContext.Provider value={scale}>{children}</TypeScaleContext.Provider>;
}

/**
 * Applies the type scale to the style NativeWind resolved from the classes (cssInterop below, so it sees the real font
 * size, line height and tracking). On iOS it also places a line shorter than the font's own height (`leading-none`, a
 * 64 px numeral on a 64 px line) where CSS does: iOS keeps the descent and cuts the top, so the glyphs ride up by half
 * the difference (React Native's RCTApplyBaselineOffset returns early in that case), while CSS and Android split it
 * evenly. `drop` is false for nested text, a span of its parent's layout.
 */
function ScaledText({ style, drop, ...props }: ComponentProps<typeof RNText> & { drop: boolean }) {
  const k = useContext(TypeScaleContext) ?? scaleOf();
  const s = useMemo(() => StyleSheet.flatten(style) as TextStyle | undefined, [style]);
  const scaled = useMemo<TextStyle | null>(
    () =>
      k < 1 && s
        ? {
            ...(s.fontSize ? { fontSize: s.fontSize * k } : null),
            ...(s.lineHeight ? { lineHeight: s.lineHeight * k } : null),
            ...(typeof s.letterSpacing === "number" ? { letterSpacing: s.letterSpacing * k } : null),
          }
        : null,
    [k, s],
  );
  const size = (scaled?.fontSize ?? s?.fontSize) as number | undefined;
  const line = (scaled?.lineHeight ?? s?.lineHeight) as number | undefined;
  const shift = drop && Platform.OS === "ios" && size && line && line < NATURAL * size ? (NATURAL * size - line) / 2 : 0;
  const resolved = useMemo(() => {
    if (!scaled && !shift) return style;
    const transform = shift ? [...(Array.isArray(s?.transform) ? s.transform : []), { translateY: shift }] : undefined;
    return [style, scaled, transform ? { transform } : null];
  }, [style, scaled, shift, s]);
  return <RNText {...props} style={resolved} />;
}
cssInterop(ScaledText, { className: "style" });

const FaceContext = createContext<Face>({ family: "sans", weight: "regular" });
/** True inside another <Text>: nested text inherits its parent's colour natively, so only the outermost one needs a default. */
const NestedContext = createContext(false);

export function Text({ className, style, numberOfLines, ...props }: ComponentProps<typeof RNText>) {
  const inherited = useContext(FaceContext);
  const nested = useContext(NestedContext);
  const { face, rest, lines, shrink } = readFontCached(className, inherited);
  return (
    <NestedContext.Provider value>
      <FaceContext.Provider value={face}>
        <ScaledText
          {...props}
          drop={!nested}
          className={nested || hasColorClass(rest) ? rest : `${rest} text-foreground`}
          numberOfLines={numberOfLines ?? lines}
          style={[{ fontFamily: FACES[face.family][face.weight], flexShrink: nested ? undefined : shrink }, style]}
        />
      </FaceContext.Provider>
    </NestedContext.Provider>
  );
}
