// A reorder sheet for the gym's lists: hold a row, drag it, and Done writes the new order. The hold delay lets a
// normal drag scroll the sheet first, and it matches the long-press used to open it from a template or an exercise.
// The sheet is a Modal, which Android draws in its own window, so it needs its own GestureHandlerRootView for the
// drag to fire. A list taller than the sheet scrolls, and a row held at the top or bottom edge scrolls it along.
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useFrameCallback, useScrollOffset, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { GripVertical, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DURATION } from "@/ui/motion";
import { haptic } from "@/ui/haptics";
import { i18n } from "@/i18n/config";

export type ReorderItem = { id: string; label: string; meta?: string };

const ROW_H = 54;
const PITCH = 60;
/** The sheet's title, hint, button, padding and the screen margin around the list. */
const CHROME = 300;
/** How close to the list's edge a held row starts the auto-scroll, and how far it scrolls each frame. */
const EDGE = 20;
const SPEED = 6;

/** The list's scroll position and size, shared by the sheet and the row being dragged. */
type Scroller = { y: SharedValue<number>; view: SharedValue<number>; content: SharedValue<number>; auto: SharedValue<number> };

/** Reorders `items` locally, then hands the new id order to `onDone`. */
export function ReorderSheet({ open, title, items, onClose, onDone }: { open: boolean; title: string; items: ReorderItem[]; onClose: () => void; onDone: (ordered: string[]) => void }) {
  const { t } = useTranslation("gym");
  const { height } = useWindowDimensions();
  const [order, setOrder] = useState<ReorderItem[]>(items);
  const [dragging, setDragging] = useState(false);
  const wasOpen = useRef(false);
  const list = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(list);
  const viewH = useSharedValue(0);
  const contentH = useSharedValue(0);
  const auto = useSharedValue(0);
  const scroll: Scroller = { y: scrollY, view: viewH, content: contentH, auto };
  // Reset only when the sheet opens: a live data reload must not wipe an order the finger is in the middle of making.
  useEffect(() => {
    if (open && !wasOpen.current) setOrder(items);
    wasOpen.current = open;
  }, [open, items, wasOpen]);
  useEffect(() => {
    contentH.value = order.length * PITCH;
  }, [order.length, contentH]);
  // While a row is held against an edge, scroll the list a little each frame; the row follows the scroll.
  const edgeScroll = useFrameCallback(() => {
    if (auto.value === 0) return;
    const max = Math.max(0, contentH.value - viewH.value);
    const next = Math.min(max, Math.max(0, scrollY.value + auto.value * SPEED));
    if (next !== scrollY.value) scrollTo(list, 0, next, false);
  }, false);
  useEffect(() => {
    edgeScroll.setActive(dragging);
  }, [dragging, edgeScroll]);
  const move = (from: number, to: number) =>
    setOrder((prev) => {
      if (from === to) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center bg-dim-strong px-4">
          <Pressable onPress={onClose} importantForAccessibility="no" style={StyleSheet.absoluteFill} />
          <View className="w-full max-w-[420px] gap-4 rounded-3xl bg-popover p-5">
            <View className="flex-row items-center justify-between gap-3">
              <Text accessibilityRole="header" className="text-[17px] font-semibold leading-6">
                {title}
              </Text>
              <Press accessibilityRole="button" accessibilityLabel={i18n.t("common:actions.close")} onPress={onClose} className="size-11 items-center justify-center">
                <Icon icon={X} size={20} tone="muted-foreground" />
              </Press>
            </View>
            <Text className="text-[13px] leading-[18px] text-muted-foreground">{t("reorder.hint")}</Text>
            <Animated.ScrollView
              ref={list}
              scrollEnabled={!dragging}
              onLayout={(e) => {
                viewH.set(e.nativeEvent.layout.height);
              }}
              style={{ maxHeight: Math.max(PITCH * 3, height - CHROME) }}
            >
              <View style={{ height: order.length * PITCH }}>
                {order.map((item, index) => (
                  <ReorderRow key={item.id} item={item} index={index} count={order.length} scroll={scroll} onMove={move} onHold={setDragging} />
                ))}
              </View>
            </Animated.ScrollView>
            <Button onPress={() => onDone(order.map((i) => i.id))}>{t("reorder.done")}</Button>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

type Place = {
  top: SharedValue<number>;
  start: SharedValue<number>;
  at: SharedValue<number>;
  lift: SharedValue<number>;
  drag: SharedValue<number>;
  /** The finger's travel since the hold, and the list's scroll offset when the hold began. */
  pan: SharedValue<number>;
  from: SharedValue<number>;
};

/** Puts the held row under the finger (counting any scroll since the hold), tells the list when it crosses a
 * neighbour, and asks for an auto-scroll when it sits at the list's top or bottom edge. */
function follow(p: Place, s: Scroller, count: number, onMove: (from: number, to: number) => void) {
  "worklet";
  const y = Math.min(Math.max(p.start.value + p.pan.value + s.y.value - p.from.value, 0), (count - 1) * PITCH);
  p.top.value = y;
  const seen = y - s.y.value;
  s.auto.value = seen < EDGE ? -1 : seen + ROW_H > s.view.value - EDGE ? 1 : 0;
  const to = Math.round(y / PITCH);
  if (to !== p.at.value) {
    const from = p.at.value;
    p.at.value = to;
    runOnJS(onMove)(from, to);
  }
}

/** The drag of one row: it follows the finger after a hold, and the list is told each time it crosses a neighbour. */
function sortPan(p: Place, s: Scroller, count: number, onMove: (from: number, to: number) => void, hold: (on: boolean) => void) {
  return Gesture.Pan()
    .activateAfterLongPress(260)
    .onStart(() => {
      p.start.value = p.top.value;
      p.pan.value = 0;
      p.from.value = s.y.value;
      p.drag.value = 1;
      p.lift.value = withTiming(1, { duration: DURATION.lift });
      runOnJS(hold)(true);
    })
    .onUpdate((e) => {
      p.pan.value = e.translationY;
      follow(p, s, count, onMove);
    })
    .onFinalize(() => {
      s.auto.value = 0;
      p.drag.value = 0;
      p.lift.value = withTiming(0, { duration: DURATION.lift });
      p.top.value = withTiming(p.at.value * PITCH, { duration: DURATION.fast });
      runOnJS(hold)(false);
    });
}

function ReorderRow({ item, index, count, scroll, onMove, onHold }: { item: ReorderItem; index: number; count: number; scroll: Scroller; onMove: (from: number, to: number) => void; onHold: (on: boolean) => void }) {
  const { t } = useTranslation("gym");
  const top = useSharedValue(index * PITCH);
  const start = useSharedValue(0);
  const at = useSharedValue(index);
  const lift = useSharedValue(0);
  const drag = useSharedValue(0);
  const pan = useSharedValue(0);
  const from = useSharedValue(0);
  const p: Place = { top, start, at, lift, drag, pan, from };
  const [lifted, setLifted] = useState(false);

  // A row nobody is holding slides to its place when the list reorders.
  useEffect(() => {
    at.value = index;
    if (drag.value === 0) top.value = withTiming(index * PITCH, { duration: DURATION.fast });
  }, [index, at, drag, top]); // the shared values are the same objects on every render

  const hold = (on: boolean) => {
    setLifted(on);
    onHold(on);
    if (on) haptic.select();
  };
  // The list scrolling under a held row (the edge auto-scroll) moves the row with it, even with the finger still.
  useAnimatedReaction(
    () => scroll.y.value,
    (now, prev) => {
      if (drag.value === 1 && prev !== null && now !== prev) follow(p, scroll, count, onMove);
    },
  );
  const gesture = sortPan(p, scroll, count, onMove, hold);
  const place = useAnimatedStyle(() => ({ transform: [{ translateY: top.value }, { scale: 1 + 0.02 * lift.value }] }));

  return (
    <Animated.View style={[{ position: "absolute", left: 0, right: 0, height: ROW_H, zIndex: lifted ? 10 : 0 }, place]}>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={item.label}
          accessibilityHint={t("reorder.hint")}
          accessibilityValue={{ text: `${index + 1}/${count}` }}
          accessibilityActions={[{ name: "increment", label: t("session.moveUp") }, { name: "decrement", label: t("session.moveDown") }]}
          onAccessibilityAction={(e) => onMove(index, Math.min(count - 1, Math.max(0, index + (e.nativeEvent.actionName === "increment" ? -1 : 1))))}
          className="h-full flex-row items-center gap-3 rounded-xl bg-secondary px-3"
        >
          <View className="flex-1">
            <Text className="text-[15px] font-semibold leading-5" numberOfLines={1}>
              {item.label}
            </Text>
            {!!item.meta && (
              <Text className="text-[12px] leading-4 text-muted-foreground" numberOfLines={1}>
                {item.meta}
              </Text>
            )}
          </View>
          <Icon icon={GripVertical} size={20} tone="muted-foreground" />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
