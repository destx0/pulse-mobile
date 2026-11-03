// The scale over Bluetooth: one controller around react-native-ble-plx's BleManager for the LeFu FFF0 family. It owns
// the Android Nearby-devices permission, the radio state, the scan, the connection, the FFF4 notifications and the
// command sequence on FFF1 (profile, clock, history). The codec and the body-composition maths are src/health/lefu.ts;
// the React side is src/state/lefuScale.tsx and the screen is src/screens/scale.
//
// It is deliberately separate from the heart-rate controller (src/health/ble.ts): its own controller state, its own
// storage key ("pulse.lefu.device") and its own lifecycle (react-native-ble-plx hands both the one shared BleManager).
// The band's link is never touched by anything here. A scale is a short-lived connection: Pulse holds it while the
// scale screen is open, lets it go after BACKGROUND_GRACE_MS in the background, and never reconnects on its own (a
// scale that is not being stood on should sleep).
//
// Nothing here throws to the UI: no Bluetooth (the emulator), a refused permission or a radio that is off become a
// status. Readings are handed to the provider as frames; only the provider writes a weigh-in to the Store.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { i18n } from "@/i18n/config";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import { AppState, Linking, PermissionsAndroid, Platform, type AppStateStatus, type Permission } from "react-native";
import { BleErrorCode, BleManager, ScanMode, State, type BleError, type Device, type Subscription } from "react-native-ble-plx";
import type { BlePermission, BleRadio } from "./ble";
import { sameUuid } from "./bleHr";
import {
  BATTERY_LEVEL_UUID,
  BATTERY_SERVICE_UUID,
  decodeLeFuFrame,
  DEFAULT_V2_PROFILE,
  encodeClock,
  encodeProfile,
  historyClear,
  historyRequest,
  isFrameMarker,
  LE_FU_NOTIFY_UUID,
  LE_FU_SERVICE_UUID,
  LE_FU_WRITE_UUID,
  LIVE_FRAME_LEN,
  looksLikeScaleName,
  parseLeFuProfile,
  profileFromName,
  wallClockOf,
  type LeFuFrame,
  type LeFuProfile,
} from "./lefu";

export const LE_FU_DEVICE_KEY = "pulse.lefu.device";

/** A scan the person starts runs this long. */
const SCAN_MS = 15_000;
const CONNECT_TIMEOUT_MS = 12_000;
/** In the background this long, the scale is let go: nobody is weighing in. */
export const BACKGROUND_GRACE_MS = 30_000;
/** The vendor's pause between the profile command, the clock and the history request. */
const COMMAND_GAP_MS = 350;
/** Scan results reach the UI at most this often. */
const FOUND_EMIT_MS = 400;

export type ScaleStatus = "off" | "unauthorized" | "idle" | "scanning" | "connecting" | "connected";

export type ScaleDevice = { id: string; name: string | null };
/** The scale Pulse remembers between openings; its advertisement profile rides along so a direct reconnect needs no scan. */
export type RememberedScale = ScaleDevice & { profile: LeFuProfile | null };
export type FoundScale = ScaleDevice & { rssi: number | null; profile: LeFuProfile | null; likely: boolean };

export type LeFuSnapshot = {
  status: ScaleStatus;
  radio: BleRadio;
  permission: BlePermission;
  /** The scale the link is about while connecting or connected; otherwise null. */
  device: ScaleDevice | null;
  /** The scale chosen last ("pulse.lefu.device"). */
  remembered: RememberedScale | null;
  /** Scales seen by the current or last scan, strongest first. */
  found: FoundScale[];
  /** The connected scale's advertisement profile (V2/V3, Direct/Alternate), or null. */
  profile: LeFuProfile | null;
  /** Battery percent from 2A19, when the scale exposes it. */
  battery: number | null;
  /** What went wrong last, worded for the person; cleared by the next success or action. */
  error: string | null;
  /** False until the saved scale and the permission have been read. */
  loaded: boolean;
};

/** One FFF4 measurement frame, with its arrival time (epoch ms) and the profile it was decoded under. */
export type LeFuReading = { frame: LeFuFrame; at: number; profile: LeFuProfile | null };

/** The profile fields the scale's `FD 37` command carries. A missing age/height is sent as 0 and only costs composition. */
export type LeFuUser = { male: boolean; age: number | null; heightCm: number | null; athlete: boolean };

type Link = "idle" | "scanning" | "connecting" | "connected";
type ScanEnd = "timeout" | "error" | "cancel";

const log = (...parts: unknown[]) => console.log("[PulseScale]", ...parts);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Errors are tagged rather than subclassed: `instanceof` on an Error subclass is unreliable under Babel's class
// transform. "live" = a sentence for the person; "superseded" = an attempt overtaken by a disconnect or another
// connect, never shown.
type Tagged = Error & { pulse?: "live" | "superseded" };
const liveError = (message: string): Tagged => Object.assign(new Error(message), { pulse: "live" as const });
const superseded = (): Tagged => Object.assign(new Error("superseded"), { pulse: "superseded" as const });
const tagged = (e: unknown, tag: "live" | "superseded") => !!e && typeof e === "object" && (e as Tagged).pulse === tag;

const isForeground = (s: AppStateStatus | null | undefined) => s !== "background" && s !== "inactive";
const apiLevel = () => (typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10) || 0);
const isBleError = (e: unknown): e is BleError => !!e && typeof e === "object" && "errorCode" in e;

/** A BleError or our own error as one sentence. Never includes a reading. */
function describe(e: unknown, device: string): string {
  if (tagged(e, "live")) return (e as Error).message;
  if (isBleError(e)) {
    const auth = [5, 15].includes(e.attErrorCode ?? -1) || [5, 15, 137].includes(e.androidErrorCode ?? -1);
    if (auth) return i18n.t("scale:error.pairFirst", { device });
    switch (e.errorCode) {
      case BleErrorCode.OperationTimedOut:
      case BleErrorCode.DeviceConnectionFailed:
      case BleErrorCode.DeviceNotFound:
        return i18n.t("scale:error.cantConnect", { device });
      case BleErrorCode.DeviceDisconnected:
        return i18n.t("scale:error.disconnected", { device });
      case BleErrorCode.CharacteristicNotifyChangeFailed:
      case BleErrorCode.DescriptorWriteFailed:
        return i18n.t("scale:error.refusedStream", { device });
      case BleErrorCode.ServiceNotFound:
      case BleErrorCode.CharacteristicNotFound:
        return i18n.t("scale:error.notAScale");
      case BleErrorCode.BluetoothUnauthorized:
        return i18n.t("scale:error.needsNearby");
      case BleErrorCode.BluetoothPoweredOff:
        return i18n.t("scale:error.btOff");
      case BleErrorCode.ScanStartFailed:
        return i18n.t("scale:error.scanFailed");
      case BleErrorCode.LocationServicesDisabled:
        return i18n.t("scale:error.needsLocation");
      default:
        return e.reason || e.message || i18n.t("scale:error.btError");
    }
  }
  return e instanceof Error ? e.message : String(e);
}

export class LeFuScale {
  private manager: BleManager | null = null;
  private started = false;
  /** The boot in flight: a screen that opens before the deferred start still gets a manager. */
  private booting: Promise<void> | null = null;
  private loaded = false;
  private radio: BleRadio = "unknown";
  private permission: BlePermission = "unknown";
  private link: Link = "idle";
  private device: ScaleDevice | null = null;
  private remembered: RememberedScale | null = null;
  private profile: LeFuProfile | null = null;
  private battery: number | null = null;
  private found = new Map<string, FoundScale>();
  private error: string | null = null;
  private wasForeground = true;
  private bgTimer: ReturnType<typeof setTimeout> | null = null;

  private snapshot: LeFuSnapshot;
  private listeners = new Set<() => void>();
  private readingListeners = new Set<(r: LeFuReading) => void>();
  private historyEndListeners = new Set<(count: number) => void>();
  private foundTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bumped whenever a link is torn down, so callbacks and awaits from an older one see they were overtaken. */
  private gen = 0;
  private subs: Subscription[] = [];
  private writeWithResponse = false;
  private historyRequested = false;
  private historyCount = 0;
  private user: LeFuUser = { male: true, age: null, heightCm: null, athlete: false };

  private scanToken = 0;
  private scanEnd: ((why: ScanEnd, err?: unknown) => void) | null = null;

  constructor() {
    this.snapshot = this.build();
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  getSnapshot = (): LeFuSnapshot => this.snapshot;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Every FFF4 measurement, live or stored. Called synchronously from the BLE event: keep it cheap. */
  onReading = (fn: (r: LeFuReading) => void): (() => void) => {
    this.readingListeners.add(fn);
    return () => this.readingListeners.delete(fn);
  };

  /** The scale's F2 00 end marker, with how many stored frames arrived before it. */
  onHistoryEnd = (fn: (count: number) => void): (() => void) => {
    this.historyEndListeners.add(fn);
    return () => this.historyEndListeners.delete(fn);
  };

  /** The sex, age, height and athlete flag the scale's profile command carries. */
  setUser = (user: LeFuUser): void => {
    const changed = JSON.stringify(user) !== JSON.stringify(this.user);
    this.user = user;
    // Re-send the profile when the athlete switch changes under a live link; a reconnect applies it anyway.
    if (changed && this.link === "connected") void this.writeProfile().catch(() => {});
  };

  private build(): LeFuSnapshot {
    return {
      status: this.status(),
      radio: this.radio,
      permission: this.permission,
      device: this.link === "connecting" || this.link === "connected" ? this.device : null,
      remembered: this.remembered,
      found: rankScales([...this.found.values()]),
      profile: this.link === "connected" ? this.profile : null,
      battery: this.link === "connected" ? this.battery : null,
      error: this.error,
      loaded: this.loaded,
    };
  }

  private status(): ScaleStatus {
    if (this.radio === "unsupported" || this.radio === "unavailable") return "off";
    if (this.loaded && this.permission !== "granted") return "unauthorized";
    if (this.radio === "off" || this.radio === "turning") return "off";
    return this.link;
  }

  private emit() {
    if (this.foundTimer) {
      clearTimeout(this.foundTimer);
      this.foundTimer = null;
    }
    this.snapshot = this.build();
    this.listeners.forEach((fn) => fn());
  }

  private emitSoon() {
    if (this.foundTimer) return;
    this.foundTimer = setTimeout(() => {
      this.foundTimer = null;
      this.emit();
    }, FOUND_EMIT_MS);
  }

  private foreground = () => isForeground(AppState.currentState);
  private ready = () => !!this.manager && this.radio === "on" && this.permission === "granted";

  // ── Start ─────────────────────────────────────────────────────────────────

  /** Reads the remembered scale, the permission and the radio. Idempotent; it never connects on its own. */
  start() {
    if (this.started) return;
    this.started = true;
    this.wasForeground = this.foreground();
    AppState.addEventListener("change", (s) => this.onAppState(s));
    this.booting = this.boot();
  }

  private async boot() {
    try {
      const saved = await AsyncStorage.getItem(LE_FU_DEVICE_KEY).catch(() => null);
      if (saved) {
        try {
          const d = JSON.parse(saved) as Partial<RememberedScale>;
          if (typeof d.id === "string") {
            this.remembered = {
              id: d.id,
              name: typeof d.name === "string" ? d.name : null,
              profile: isProfile(d.profile) ? d.profile : null,
            };
          }
        } catch {
          // A corrupt entry is as good as none.
        }
      }
      this.permission = await this.checkPermission();
      this.manager = this.createManager();
      if (this.manager) {
        this.manager.onStateChange((s) => this.onRadio(s), false);
        await this.readRadio();
      }
    } catch (e) {
      this.error = describe(e, i18n.t("scale:deviceLower"));
    } finally {
      this.loaded = true;
      this.emit();
    }
  }

  private createManager(): BleManager | null {
    if (Platform.OS !== "android") {
      this.radio = "unavailable";
      return null;
    }
    try {
      return new BleManager();
    } catch (e) {
      console.warn("[scale] no BLE module:", e instanceof Error ? e.message : String(e));
      this.radio = "unavailable";
      return null;
    }
  }

  private async readRadio() {
    if (!this.manager) return;
    try {
      this.setRadio(await this.manager.state());
    } catch {
      this.radio = "unknown";
    }
  }

  private setRadio(s: State) {
    this.radio =
      s === State.PoweredOn ? "on" : s === State.PoweredOff ? "off" : s === State.Resetting ? "turning" : s === State.Unsupported ? "unsupported" : "unknown";
  }

  private onRadio(s: State) {
    const was = this.radio;
    this.setRadio(s);
    if (this.radio === was) return;
    if (this.radio !== "on") {
      if (this.link === "scanning") this.endScan("cancel");
      if (this.link === "connected" || this.link === "connecting") {
        const id = this.device?.id;
        void this.teardown(id).then(() => {
          this.link = "idle";
          this.device = null;
          this.emit();
        });
      }
    }
    this.emit();
  }

  // ── Permissions and the radio ─────────────────────────────────────────────

  private permissions(): Permission[] {
    return apiLevel() >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  }

  private async checkPermission(): Promise<BlePermission> {
    if (Platform.OS !== "android") return "unknown";
    try {
      const ok = await Promise.all(this.permissions().map((p) => PermissionsAndroid.check(p)));
      if (ok.every(Boolean)) return "granted";
      return this.permission === "blocked" ? "blocked" : "needed";
    } catch {
      return "unknown";
    }
  }

  requestPermission = async (): Promise<BlePermission> => await this.askPermission();

  private async askPermission(): Promise<BlePermission> {
    if (Platform.OS !== "android") return this.permission;
    if (this.permission === "blocked") {
      this.permission = await this.checkPermission();
      if (this.permission !== "granted") {
        await this.openSettings();
        this.emit();
        return this.permission;
      }
    }
    try {
      const perms = this.permissions();
      const r = await PermissionsAndroid.requestMultiple(perms);
      const v = perms.map((p) => r[p]);
      this.permission = v.every((x) => x === PermissionsAndroid.RESULTS.GRANTED)
        ? "granted"
        : v.some((x) => x === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
          ? "blocked"
          : "needed";
    } catch (e) {
      this.error = describe(e, i18n.t("scale:deviceLower"));
    }
    if (this.permission === "granted") {
      this.error = null;
      await this.readRadio();
    }
    this.emit();
    return this.permission;
  }

  openSettings = async () => {
    await Linking.openSettings().catch(() => {});
  };

  /** Android's "turn on Bluetooth?" dialog (or, older Android, the adapter; else the Bluetooth settings page). */
  turnOnBluetooth = async (): Promise<boolean> => {
    if (Platform.OS !== "android" || this.radio === "unsupported" || this.radio === "unavailable") return false;
    if (this.permission !== "granted" && (await this.askPermission()) !== "granted") return false;
    try {
      await Linking.sendIntent("android.bluetooth.adapter.action.REQUEST_ENABLE");
      return true;
    } catch {
      // No activity resolves the request on this phone.
    }
    if (apiLevel() < 31 && this.manager) {
      try {
        await withTimeout(this.manager.enable(), 8_000);
        return true;
      } catch {
        // Fall through to the settings page.
      }
    }
    try {
      await Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
      return true;
    } catch {
      return false;
    }
  };

  /** Permission, then the radio: true when a scan or connection can start now. Prompts for whichever is missing. */
  private async prepare(): Promise<boolean> {
    // The provider defers start() off the first frame; a person who opens the screen straight away still gets a manager.
    if (!this.started) this.start();
    if (this.booting) await this.booting;
    if (!this.manager) {
      this.emit();
      return false;
    }
    if (this.permission !== "granted" && (await this.askPermission()) !== "granted") return false;
    if (this.radio !== "on") await this.readRadio();
    if (this.radio === "off") {
      this.emit();
      await this.turnOnBluetooth();
      return false;
    }
    return this.radio === "on";
  }

  // ── Scanning ──────────────────────────────────────────────────────────────

  /** Looks for LeFu-family scales for 15 s; `found` fills as they appear. */
  scan = async (): Promise<void> => {
    if (!(await this.prepare())) return;
    if (this.link === "connecting" || this.link === "connected" || this.link === "scanning") return;
    this.found.clear();
    this.error = null;
    this.link = "scanning";
    this.emit();
    log("scan start");
    this.beginScan(
      SCAN_MS,
      (d) => this.noteFound(d),
      (why, err) => {
        if (this.link === "scanning") this.link = "idle";
        log("scan end", why, { found: [...this.found.values()].map((d) => `${d.name ?? "?"}${d.profile?.typeString ? ` (${d.profile.typeString})` : ""}`) }, err ? String(err) : "");
        if (why === "error") this.error = describe(err, i18n.t("scale:deviceLower"));
        else if (why === "timeout" && this.found.size === 0) this.error = i18n.t("scale:error.noScaleFound");
        this.emit();
      },
    );
  };

  stopScan = () => {
    if (this.link === "scanning") this.endScan("cancel");
  };

  private noteFound(d: Device) {
    const prev = this.found.get(d.id);
    const name = d.name ?? d.localName ?? prev?.name ?? null;
    const profile = this.profileOf(d) ?? prev?.profile ?? null;
    const hasService = (d.serviceUUIDs ?? []).some((u) => sameUuid(u, LE_FU_SERVICE_UUID));
    if (!profile && !looksLikeScaleName(name) && !hasService) return;
    if (!prev) {
      log("seen", name, profile ? { protocol: profile.protocol, type: profile.typeString, calc: profile.calcType } : "name only");
    }
    this.found.set(d.id, { id: d.id, name, rssi: d.rssi ?? prev?.rssi ?? null, profile, likely: true });
    this.emitSoon();
  }

  /** The advertisement profile: manufacturer data, then service data, then the name. */
  private profileOf(d: Device): LeFuProfile | null {
    const exact = (d.name ?? d.localName) === "Health Scale";
    if (d.manufacturerData) {
      const p = parseLeFuProfile(base64ToBytes(d.manufacturerData), false, exact);
      if (p) return p;
    }
    for (const value of Object.values(d.serviceData ?? {})) {
      const p = parseLeFuProfile(base64ToBytes(value), true, exact);
      if (p) return p;
    }
    return profileFromName(d.name ?? d.localName);
  }

  private beginScan(ms: number, onDevice: (d: Device) => void, onEnd: (why: ScanEnd, err?: unknown) => void) {
    this.endScan("cancel");
    const m = this.manager;
    if (!m) return onEnd("error", liveError(i18n.t("scale:error.btUnavailable")));
    const token = ++this.scanToken;
    const timer = setTimeout(() => this.endScan("timeout"), ms);
    this.scanEnd = (why, err) => {
      clearTimeout(timer);
      this.scanEnd = null;
      m.stopDeviceScan().catch(() => {});
      onEnd(why, err);
    };
    // Unfiltered: the scale's manufacturer data carries the type string, and some units do not put FFF0 in the
    // advertised service list. noteFound drops everything that is not a scale.
    m.startDeviceScan(null, { scanMode: ScanMode.LowLatency }, (err, d) => {
      if (token !== this.scanToken || !this.scanEnd) return;
      if (err) return this.endScan("error", err);
      if (d) onDevice(d);
    }).catch((e: unknown) => {
      if (token === this.scanToken) this.endScan("error", e);
    });
  }

  private endScan(why: ScanEnd, err?: unknown) {
    this.scanEnd?.(why, err);
  }

  // ── Connecting ────────────────────────────────────────────────────────────

  /** Connects to a scale from the scan (or the remembered one), remembers it, and runs the command sequence. */
  connect = async (id: string, profile?: LeFuProfile | null): Promise<void> => {
    const seen = this.found.get(id);
    const saved = this.remembered?.id === id ? this.remembered : null;
    const dev: ScaleDevice = { id, name: seen?.name ?? saved?.name ?? null };
    const chosen = profile ?? seen?.profile ?? saved?.profile ?? profileFromName(dev.name) ?? DEFAULT_V2_PROFILE;
    if (!(await this.prepare())) return;
    if (this.link === "connected" && this.device?.id === id) return;
    if (this.link === "scanning") this.endScan("cancel");
    await this.teardown(this.device?.id);
    await this.rememberDevice({ ...dev, profile: chosen });
    this.profile = chosen;
    this.device = dev;
    this.battery = null;
    this.error = null;
    this.link = "connecting";
    this.emit();
    const gen = ++this.gen;
    log("connect", dev.name, { protocol: chosen.protocol, type: chosen.typeString, calc: chosen.calcType });
    try {
      await this.open(dev, chosen, gen);
      if (gen !== this.gen) return;
      this.link = "connected";
      this.error = null;
      this.emit();
    } catch (e) {
      if (tagged(e, "superseded") || gen !== this.gen) return;
      log("connect failed", String((e as Error)?.message ?? e));
      await this.teardown(id);
      this.error = describe(e, dev.name ?? i18n.t("scale:deviceLower"));
      this.link = "idle";
      this.device = null;
      this.emit();
    }
  };

  /** Ends the link; the scale stays remembered for the next weigh-in. */
  disconnect = async (): Promise<void> => {
    if (this.link === "scanning") this.endScan("cancel");
    await this.teardown(this.device?.id);
    this.link = "idle";
    this.device = null;
    this.battery = null;
    this.error = null;
    this.emit();
  };

  /** Disconnects and forgets the remembered scale. */
  forget = async (): Promise<void> => {
    await this.disconnect();
    this.remembered = null;
    await AsyncStorage.removeItem(LE_FU_DEVICE_KEY).catch(() => {});
    this.emit();
  };

  private async rememberDevice(d: RememberedScale) {
    this.remembered = d;
    await AsyncStorage.setItem(LE_FU_DEVICE_KEY, JSON.stringify(d)).catch(() => {});
  }

  private async open(dev: ScaleDevice, profile: LeFuProfile, gen: number) {
    const m = this.manager;
    if (!m) throw liveError(i18n.t("scale:error.btUnavailable"));
    const check = () => {
      if (gen !== this.gen) throw superseded();
    };

    await m.connectToDevice(dev.id, { autoConnect: false, timeout: CONNECT_TIMEOUT_MS });
    check();
    await m.discoverAllServicesAndCharacteristicsForDevice(dev.id);
    check();

    const services = await m.servicesForDevice(dev.id).catch(() => []);
    if (!services.some((s) => sameUuid(s.uuid, LE_FU_SERVICE_UUID))) throw liveError(i18n.t("scale:error.notAScale"));
    const chars = await m.characteristicsForDevice(dev.id, LE_FU_SERVICE_UUID).catch(() => []);
    const notify = chars.find((c) => sameUuid(c.uuid, LE_FU_NOTIFY_UUID));
    const write = chars.find((c) => sameUuid(c.uuid, LE_FU_WRITE_UUID));
    if (!notify || !write || !(write.isWritableWithResponse || write.isWritableWithoutResponse)) throw liveError(i18n.t("scale:error.notAScale"));
    this.writeWithResponse = write.isWritableWithResponse;
    log("services", services.map((s) => s.uuid.slice(4, 8)).join(","), { writeWithResponse: this.writeWithResponse });

    this.subs.push(m.onDeviceDisconnected(dev.id, (err) => this.lost(gen, err ?? liveError(i18n.t("scale:error.disconnected", { device: dev.name ?? i18n.t("scale:deviceLower") })))));
    this.subs.push(m.monitorCharacteristicForDevice(dev.id, LE_FU_SERVICE_UUID, LE_FU_NOTIFY_UUID, (err, ch) => this.onValue(gen, err, ch?.value ?? null), `pulse-scale-${gen}`));

    // 1) Subscribe (above), 2) the profile, 3) the clock, 4) the stored readings.
    await this.writeProfile();
    check();
    await sleep(COMMAND_GAP_MS);
    check();
    log("write clock");
    await this.write(encodeClock(wallClockOf(new Date())));
    check();
    // The vendor waits up to 3 s for an F1 00 ACK before asking for history. Pulse never requires it: the request
    // below happens whether or not one arrives, and a late ACK finds historyRequested already set.
    await sleep(COMMAND_GAP_MS);
    check();
    await this.requestHistory();

    // Battery is optional and never on the critical path; a scale without 180F simply has none to show.
    void this.readBattery(dev.id, gen);
  }

  private async writeProfile(): Promise<void> {
    if (!this.profile) return;
    const user = this.user;
    if (user.age === null || user.heightCm === null) {
      log("profile incomplete", { hasAge: user.age !== null, hasHeight: user.heightCm !== null });
    }
    await this.write(
      encodeProfile(this.profile, {
        unitCode: 0,
        athlete: user.athlete,
        male: user.male,
        age: user.age ?? 0,
        heightCm: user.heightCm ?? 0,
      }),
    );
  }

  private async requestHistory(): Promise<void> {
    if (this.historyRequested) return;
    this.historyRequested = true;
    this.historyCount = 0;
    log("request history");
    await this.write(historyRequest());
  }

  /** One command frame on FFF1, with response when the characteristic asks for one. */
  private async write(bytes: Uint8Array): Promise<void> {
    const m = this.manager;
    const id = this.device?.id;
    if (!m || !id) return;
    const value = bytesToBase64(bytes);
    if (this.writeWithResponse) {
      try {
        await m.writeCharacteristicWithResponseForDevice(id, LE_FU_SERVICE_UUID, LE_FU_WRITE_UUID, value);
        return;
      } catch {
        // Some units advertise a response write but only accept the command pipe without one; fall through.
      }
    }
    await m.writeCharacteristicWithoutResponseForDevice(id, LE_FU_SERVICE_UUID, LE_FU_WRITE_UUID, value);
  }

  private async readBattery(id: string, gen: number) {
    const m = this.manager;
    if (!m) return;
    try {
      const ch = await m.readCharacteristicForDevice(id, BATTERY_SERVICE_UUID, BATTERY_LEVEL_UUID);
      if (gen !== this.gen) return;
      const bytes = base64ToBytes(ch.value ?? "");
      if (!bytes.length) return;
      this.battery = bytes[0];
      this.emit();
    } catch {
      // No battery service on this unit.
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  private onValue(gen: number, err: BleError | null, value: string | null) {
    if (gen !== this.gen) return;
    if (err) {
      this.lost(gen, err);
      return;
    }
    if (!value) return;
    const bytes = base64ToBytes(value);

    if (bytes.length === 2) {
      // Clock ACK: ask for history now rather than at the 350 ms fallback.
      if (bytes[0] === 0xf1 && bytes[1] === 0x00) {
        log("clock ack");
        void this.requestHistory().catch((e: unknown) => log("history request failed", String(e)));
        return;
      }
      // End of the stored measurements; clear them only when some arrived.
      if (bytes[0] === 0xf2 && bytes[1] === 0x00) {
        const count = this.historyCount;
        this.historyCount = 0;
        log("history end", count);
        if (count > 0) void this.write(historyClear()).catch((e: unknown) => log("history clear failed", String(e)));
        this.historyEndListeners.forEach((fn) => {
          try {
            fn(count);
          } catch (e) {
            console.warn("[scale] history listener", e);
          }
        });
        return;
      }
    }

    if (bytes.length < LIVE_FRAME_LEN || !isFrameMarker(bytes[0])) {
      // No reading data in the log: only the shape of what was not understood.
      log("unexpected notification", { length: bytes.length, marker: bytes[0] });
      return;
    }

    const frame = decodeLeFuFrame(bytes, this.profile ?? DEFAULT_V2_PROFILE);
    if (!frame) {
      log("undecodable frame", { length: bytes.length, marker: bytes[0], status: bytes[9] });
      return;
    }
    // Status 3/4 are heart-rate results, not weight; a scale without a handle has no use for them.
    if (frame.status === 0x03 || frame.status === 0x04) {
      log("heart-rate frame ignored", { type: frame.type, status: frame.status });
      return;
    }
    if (frame.isHistory) this.historyCount++;
    const reading: LeFuReading = { frame, at: Date.now(), profile: this.profile };
    this.readingListeners.forEach((fn) => {
      try {
        fn(reading);
      } catch (e) {
        console.warn("[scale] reading listener", e);
      }
    });
  }

  /** The link `gen` ended without being asked to: tear it down and say why. The person starts the next connection. */
  private lost(gen: number, err: unknown) {
    if (gen !== this.gen) return;
    const dev = this.device;
    log("lost", String((err as Error)?.message ?? err));
    void this.teardown(dev?.id).then(() => {
      this.error = describe(err, dev?.name ?? i18n.t("scale:deviceLower"));
      this.link = "idle";
      this.device = null;
      this.battery = null;
      this.emit();
    });
  }

  /** Ends the current link (if any): every callback of it goes stale, subscriptions go, the connection is cancelled. */
  private async teardown(id?: string) {
    this.gen++;
    this.historyRequested = false;
    this.historyCount = 0;
    const subs = this.subs;
    this.subs = [];
    subs.forEach((s) => {
      try {
        s.remove();
      } catch {
        // Already gone with the link.
      }
    });
    if (this.link !== "scanning") this.endScan("cancel");
    if (id && this.manager) await this.manager.cancelDeviceConnection(id).catch(() => {});
  }

  // ── Foreground and background ─────────────────────────────────────────────

  private onAppState(next: AppStateStatus) {
    const wasFg = this.wasForeground;
    this.wasForeground = isForeground(next);
    if (this.wasForeground) {
      if (this.bgTimer) clearTimeout(this.bgTimer);
      this.bgTimer = null;
      if (wasFg) return;
      // The permission or the radio may have changed in Settings while Pulse was away.
      void (async () => {
        this.permission = await this.checkPermission();
        await this.readRadio();
        this.emit();
      })();
      return;
    }
    if (!wasFg) return;
    if (this.link === "scanning") this.endScan("cancel");
    if (!this.bgTimer && (this.link === "connected" || this.link === "connecting")) {
      this.bgTimer = setTimeout(() => void this.releaseForBackground(), BACKGROUND_GRACE_MS);
    }
  }

  private async releaseForBackground() {
    this.bgTimer = null;
    if (this.foreground()) return;
    await this.disconnect();
  }
}

/** A stored profile is accepted only when it has the shape this module writes. */
function isProfile(value: unknown): value is LeFuProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<LeFuProfile>;
  return (p.protocol === "V2" || p.protocol === "V3") &&
    (p.scaleType === "CF" || p.scaleType === "CE" || p.scaleType === "CA" || p.scaleType === "CB" || p.scaleType === "CC" || p.scaleType === "UNKNOWN") &&
    (p.calcType === "direct" || p.calcType === "alternate" || p.calcType === "needNot" || p.calcType === "unknown") &&
    (p.typeString === null || typeof p.typeString === "string");
}

function rankScales(xs: FoundScale[]): FoundScale[] {
  return [...xs].sort((a, b) => {
    const pa = a.profile ? 0 : 1;
    const pb = b.profile ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ra = a.rssi ?? -999;
    const rb = b.rssi ?? -999;
    if (ra !== rb) return rb - ra;
    return (a.name ?? "~").localeCompare(b.name ?? "~");
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  p.catch(() => {});
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** The app's one scale controller. `start()` is called by LeFuScaleProvider. */
export const leFuScale = new LeFuScale();
