import { useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { todayIn } from "@/lib/url";
import { LiveBleProvider } from "@/state/liveBle";
import { LeFuScaleProvider } from "@/state/lefuScale";
import { LiveHrTicker } from "@/state/liveHr";
import { ShellCalendarProvider } from "./shells/ShellStatus";
import { TypeScaleProvider } from "./Text";
import { ToastHost } from "./Toast";

/**
 * What the kit's components need above them, once, at the root:
 * - GestureHandlerRootView: gestures (chart scrubbing) only work inside one.
 * - SafeAreaProvider: the headers and the check-in button read the notch and home-indicator insets (each screen shell nests its own, see ScreenScroll).
 * - ShellCalendarProvider: today, the first day with data and the time zone, for the date switcher and the charts. The
 *   value here is the device's today with no first day; the data layer replaces it once the database is read.
 * - LiveBleProvider: live heart rate over Bluetooth (src/state/liveBle.tsx), display-only.
 * - LeFuScaleProvider: the HealthSense scale over Bluetooth (src/state/lefuScale.tsx); weight and fat save to Pulse.
 * - LiveHrTicker: the minute-by-minute Health Connect heart-rate read (src/state/liveHr.tsx); renders nothing.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [calendar] = useState(() => ({ today: todayIn() }));
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* One Dimensions subscription for every <Text>: the narrow-phone type scale no longer costs one per node. */}
        <TypeScaleProvider>
          <ShellCalendarProvider value={calendar}>
            <LiveBleProvider>
              <LeFuScaleProvider>{children}</LeFuScaleProvider>
            </LiveBleProvider>
            <ToastHost />
            <LiveHrTicker />
          </ShellCalendarProvider>
        </TypeScaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
