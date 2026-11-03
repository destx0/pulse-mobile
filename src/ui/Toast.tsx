// The web's Sonner toasts (pulse components/ui/sonner.tsx, `toast.success` / `toast.error` from "sonner"), once for the
// whole app. `toast.success(text)` works from anywhere (a sheet that has just closed); <ToastHost /> is mounted once in
// AppProviders. As Sonner with the web's config: popover fill and text, a 1 px border, a 16 px icon in the text colour
// (success and error alike: no rich colours), 13 px / 500 text, 16 px padding, the full width of a phone less its 16 px
// offset, at the foot, for 4 s. One is shown at a time, and a new one replaces it.
//
// A toast with an action (`toast.undo`) is a decision, not a notice: it stays 6 s, the countdown stops while a finger
// rests on it, and it can never vanish with less than 400 ms left. The action sits at the end of the line and the rest of
// the card only pauses, so there is no dismiss target next to Undo for a thumb to hit by mistake: a missed Undo costs
// nothing. A new toast still replaces the old one, action and all: what the old Undo would have restored stays done.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { CircleAlert, CircleCheck, OctagonX, Trash2, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { usePanelStyle } from "./Panel";
import { Press } from "./Press";
import { Text } from "./Text";
import { DURATION } from "./motion";

type Kind = "success" | "error" | "info" | "undo";
export type ToastAction = { label: string; onPress: () => void };
type Current = { id: number; kind: Kind; text: string; action?: ToastAction } | null;

const SHOWN_MS = 4000;
/** A decision gets longer than a notice. */
const ACTION_MS = 6000;
/** What a release can never leave: the toast must not vanish from under the finger that has just lifted. */
const FLOOR_MS = 400;

let current: Current = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

const show = (kind: Kind, text: string, action?: ToastAction) => {
  current = { id: ++seq, kind, text, action };
  emit();
};

const ICON: Record<Kind, LucideIcon> = { success: CircleCheck, error: OctagonX, info: CircleAlert, undo: Trash2 };

/** Sonner's `toast`: the success haptic or the error haptic goes with it. */
export const toast = {
  success: (text: string) => {
    haptic.success();
    show("success", text);
  },
  error: (text: string) => {
    haptic.error();
    show("error", text);
  },
  info: (text: string) => {
    haptic.tap();
    show("info", text);
  },
  /** A change that can be taken back, with the way to take it back: "Set 2 removed — Undo". */
  undo: (text: string, action: ToastAction) => {
    haptic.tap();
    show("undo", text, action);
  },
};

export function ToastHost() {
  const t = useSyncExternalStore(subscribe, () => current);
  const panel = usePanelStyle({ ring: null, shadow: "toast" });
  const bottom = useSafeAreaInsets().bottom + 16;
  // The toast a finger is resting on. Keyed by id, so a new toast is never born paused.
  const [held, setHeld] = useState<number | null>(null);
  const paused = !!t && held === t.id;
  // What is left of this toast's life, and the instant it would have gone.
  const remaining = useRef(SHOWN_MS);
  const deadline = useRef(0);

  // Each message starts its own count, held or not.
  useEffect(() => {
    remaining.current = t?.action ? ACTION_MS : SHOWN_MS;
  }, [t]);

  // The timeout is armed from what is left, so a hold stops the clock and a release restarts it with the same time.
  useEffect(() => {
    if (!t || paused) return;
    const id = t.id;
    deadline.current = Date.now() + remaining.current;
    const timer = setTimeout(() => {
      if (current?.id === id) {
        current = null;
        emit();
      }
    }, remaining.current);
    return () => clearTimeout(timer);
  }, [t, paused]);

  if (!t) return null;
  const action = t.action;
  // A notice lets touches through; a decision catches them, because resting a finger on it is how you keep it.
  const hold = () => {
    remaining.current = Math.max(FLOOR_MS, deadline.current - Date.now());
    setHeld(t.id);
  };
  const undo = () => {
    if (current?.id !== t.id) return;
    current = null;
    emit();
    haptic.tap();
    action?.onPress();
  };
  return (
    <View pointerEvents={action ? "box-none" : "none"} className="absolute inset-x-0 px-4" style={{ bottom }}>
      <Animated.View
        key={t.id}
        entering={FadeInUp.duration(DURATION.enter)}
        exiting={FadeOutDown.duration(DURATION.fast)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="w-full self-center rounded-lg border border-border bg-popover"
        style={panel}
      >
        <View className="flex-row items-center gap-1.5 p-4">
          <Pressable
            accessible={false}
            disabled={!action}
            onPressIn={action ? hold : undefined}
            onPressOut={action ? () => setHeld(null) : undefined}
            className="min-w-0 flex-1 flex-row items-center gap-1.5"
          >
            <Icon icon={ICON[t.kind]} size={16} tone="popover-foreground" strokeWidth={2} />
            <Text className="shrink text-[13px] font-medium leading-[19.5px] text-popover-foreground">{t.text}</Text>
          </Pressable>
          {!!action && (
            <>
              <View className="h-5 w-px bg-border" />
              <Press accessibilityRole="button" activeOpacity={0.6} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPressIn={hold} onPressOut={() => setHeld(null)} onPress={undo} className="shrink-0">
                <Text className="text-[13px] font-bold uppercase tracking-[0.08em] text-popover-foreground">{action.label}</Text>
              </Press>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
