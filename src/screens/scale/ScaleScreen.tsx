// Scale `/scale`: find and connect a HealthSense BS191 (LeFu V3), show the live weigh-in and its body composition,
// save it to Pulse, and report the stored weigh-ins the scale handed over. The connection and the codec are
// src/health/lefuBle.ts and src/health/lefu.ts; this file only draws what src/state/lefuScale.tsx exposes.
//
// A live weighing waits for the person's Save tap. Stored weigh-ins are backfilled automatically at their timestamps
// (src/state/lefuScale.tsx). Body composition is display-only beyond weight and body fat, which go through logEntry.
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Bluetooth, ChevronRight, Info, Scale as ScaleIcon, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { signalWord } from "@/health/bleHr";
import { i18n } from "@/i18n/config";
import { formatValue } from "@/lib/format";
import { quantity } from "@/lib/units";
import type { LeFuComposition, LeFuFrame } from "@/health/lefu";
import { useLeFuScale, type FoundScale, type ScaleControl, type ScaleData } from "@/state/lefuScale";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { CAPTION, ValueUnit } from "@/ui/metrics/primitives";
import { Press } from "@/ui/Press";
import { DetailShell } from "@/ui/shells/DetailShell";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { BODY, ConfirmDialog, HINT, ROW, ROW_LABEL, ROW_RULE, ROW_VALUE } from "../settings/controls";

type Scale = ScaleControl & ScaleData;

const WARN = "text-[13px] font-semibold leading-[18px] text-warning-text";

/** The status in a few words. */
function statusLabel(s: ScaleControl): string {
  switch (s.status) {
    case "connected":
      return i18n.t("scale:status.connected");
    case "connecting":
      return i18n.t("scale:status.connecting");
    case "scanning":
      return i18n.t("scale:status.scanning");
    case "unauthorized":
      return i18n.t("scale:status.unauthorized");
    case "off":
      return s.radio === "unsupported" ? i18n.t("scale:status.noBluetooth") : s.radio === "unavailable" ? i18n.t("scale:status.notAvailable") : i18n.t("scale:status.bluetoothOff");
    default:
      return i18n.t("scale:status.notConnected");
  }
}

function Row({ label, value, tone, rule }: { label: string; value: string; tone?: string; rule?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className={cn(ROW, rule && ROW_RULE)}>
      <Text className={ROW_LABEL}>{label}</Text>
      <Text className={cn(ROW_VALUE, tone)}>{value}</Text>
    </View>
  );
}

// ── Connection ──────────────────────────────────────────────────────────────

function DeviceRow({ d, onPress, rule, aside }: { d: FoundScale; onPress: () => void; rule?: boolean; aside?: string }) {
  const { t } = useTranslation("scale");
  const signal = signalWord(d.rssi);
  const detail = [d.profile?.typeString ?? d.profile?.protocol ?? null, signal ? t("signal", { signal }) : null, aside ?? null].filter(Boolean).join(" · ");
  return (
    <Press
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${d.name ?? t("unnamed")}, ${detail}` : (d.name ?? t("unnamed"))}
      onPress={onPress}
      className={cn("min-h-14 flex-row items-center gap-3 py-2", rule && ROW_RULE)}
    >
      <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-fill-faint">
        <Icon icon={ScaleIcon} size={20} tone="recovery-red-text" strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold leading-[22px]">{d.name ?? t("unnamed")}</Text>
        {!!detail && <Text className={HINT}>{detail}</Text>}
      </View>
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{t("connect")}</Text>
      <Icon icon={ChevronRight} size={16} tone="foreground-secondary" strokeWidth={2} />
    </Press>
  );
}

/** The remembered scale when the scan did not see it: a tap still tries a direct connection. */
function RememberedRow({ s, rule }: { s: Scale; rule?: boolean }) {
  const { t } = useTranslation("scale");
  const remembered = s.remembered;
  if (!remembered) return null;
  return (
    <DeviceRow
      rule={rule}
      d={{ id: remembered.id, name: remembered.name, rssi: null, profile: remembered.profile, likely: true }}
      onPress={() => void s.connect(remembered.id, remembered.profile)}
      aside={t("lastUsed")}
    />
  );
}

function ConnectionCard({ s }: { s: Scale }) {
  const { t } = useTranslation("scale");
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const linked = s.status === "connected" || s.status === "connecting";
  const noRadio = s.radio === "unsupported" || s.radio === "unavailable";
  const remembered = s.remembered;
  const found = s.found;
  return (
    <SectionShell variant="card" title={t("yourScale")}>
      <View>
        <Row label={i18n.t("scale:settings.connection")} value={statusLabel(s)} tone={s.status === "connected" ? "text-optimal-text" : undefined} />
        <Row rule label={t("device")} value={remembered ? (remembered.name ?? t("unnamed")) : t("none")} />
        {s.status === "connected" && s.battery !== null && <Row rule label={t("battery")} value={`${s.battery}%`} />}
        {s.status === "connected" && !!s.profile?.typeString && <Row rule label={t("type")} value={s.profile.typeString} />}
      </View>
      {!!s.error && !linked && (
        <Text accessibilityRole="alert" className={cn(WARN, "mt-2")}>
          {s.error}
        </Text>
      )}
      <View className="mt-4 gap-2">
        {linked ? (
          <Button variant="secondary" onPress={() => void s.disconnect()}>
            {s.status === "connected" ? t("disconnect") : t("stop")}
          </Button>
        ) : s.status === "scanning" ? (
          <Button variant="secondary" onPress={s.stopScan}>
            {t("stop")}
          </Button>
        ) : (
          <Button onPress={() => void s.scan()} disabled={noRadio}>
            {found.length || s.error ? t("searchAgain") : t("search")}
          </Button>
        )}
        {!!remembered && !linked && (
          <Button variant="outline" textClassName="text-recovery-red-text" onPress={() => setConfirmForget(true)}>
            {t("forget")}
          </Button>
        )}
      </View>
      {s.status === "scanning" && (
        <View className="mt-4 flex-row items-center gap-2.5">
          <ActivityIndicator size="small" />
          <Text className={cn(CAPTION, "flex-1")}>{t("status.scanning")}</Text>
        </View>
      )}
      {(found.length > 0 || (remembered && !found.some((d) => d.id === remembered.id))) && !linked && (
        <View className="mt-4 border-t border-border">
          {found.map((d, i) => (
            <DeviceRow key={d.id} d={d} rule={i > 0} onPress={() => void s.connect(d.id, d.profile)} aside={s.remembered?.id === d.id ? t("lastUsed") : undefined} />
          ))}
          {remembered && !found.some((d) => d.id === remembered.id) && <RememberedRow s={s} rule={found.length > 0} />}
        </View>
      )}
      <ConfirmDialog
        open={confirmForget}
        title={t("forgetTitle")}
        description={t("forgetBody")}
        confirmLabel={t("forget")}
        pendingLabel={t("forgetting")}
        pending={forgetting}
        onCancel={() => setConfirmForget(false)}
        onConfirm={async () => {
          setForgetting(true);
          await s.forget();
          setForgetting(false);
          setConfirmForget(false);
        }}
      />
    </SectionShell>
  );
}

function PermissionsCard({ s }: { s: Scale }) {
  const { t } = useTranslation("scale");
  const [btHint, setBtHint] = useState<string | null>(null);
  const permission = s.permission === "granted" ? t("permissions.allowed") : t("permissions.notAllowed");
  const radio = s.radio === "on" ? t("permissions.on") : s.radio === "off" ? t("status.bluetoothOff") : s.radio === "turning" ? t("status.connecting") : s.radio === "unsupported" ? t("status.noBluetooth") : s.radio === "unavailable" ? t("status.notAvailable") : t("status.notConnected");
  return (
    <SectionShell variant="card" title={t("permissions.title")}>
      <View>
        <Row label={t("permissions.nearby")} value={permission} tone={s.permission === "granted" ? undefined : "text-warning-text"} />
        <Row rule label="Bluetooth" value={radio} tone={s.radio === "on" ? undefined : "text-warning-text"} />
      </View>
      <Text className={cn(HINT, "mt-2")}>{t("permissions.note")}</Text>
      {s.permission !== "granted" && (
        <Button className="mt-4" onPress={() => void s.requestPermission()}>
          {s.permission === "blocked" ? t("permissions.openSettings") : t("permissions.allow")}
        </Button>
      )}
      {s.permission === "granted" && s.radio === "off" && (
        <Button className="mt-4" onPress={() => void s.turnOnBluetooth().then((ok) => setBtHint(ok ? null : t("status.noBluetooth")))}>
          {t("permissions.turnOnBluetooth")}
        </Button>
      )}
      {!!btHint && <Text className={cn(WARN, "mt-2")}>{btHint}</Text>}
    </SectionShell>
  );
}

// ── This weigh-in ───────────────────────────────────────────────────────────

function weightText(kg: number): { value: string; unit: string } {
  const q = quantity("kg");
  return { value: formatValue("decimal1", q.value(kg)), unit: q.unit };
}

function kgText(kg: number): { value: string; unit: string } {
  return weightText(kg);
}

function CompositionTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const spoken = unit ? `${label}: ${value} ${unit}` : `${label}: ${value}`;
  return (
    <View accessible accessibilityLabel={spoken} className="min-w-0 flex-1 rounded-xl bg-foreground/[0.04] p-3">
      <Text accessibilityElementsHidden className={cn(CAPTION, "uppercase tracking-[0.08em]")}>
        {label}
      </Text>
      <View accessibilityElementsHidden className="mt-1">
        <ValueUnit value={value} unit={unit} className="font-numeric text-xl font-bold leading-6" />
      </View>
    </View>
  );
}

function compositionTiles(c: LeFuComposition): { key: string; label: string; value: string; unit?: string }[] {
  const muscle = kgText(c.muscleKg);
  const bone = kgText(c.boneKg);
  const lean = kgText(c.leanMassKg);
  return [
    { key: "bodyFat", label: i18n.t("scale:metric.bodyFat"), value: formatValue("decimal1", c.bodyFatPercent), unit: "%" },
    { key: "water", label: i18n.t("scale:metric.water"), value: formatValue("decimal1", c.waterPercent), unit: "%" },
    { key: "protein", label: i18n.t("scale:metric.protein"), value: formatValue("decimal1", c.proteinPercent), unit: "%" },
    { key: "muscle", label: i18n.t("scale:metric.muscle"), value: muscle.value, unit: muscle.unit },
    { key: "bone", label: i18n.t("scale:metric.bone"), value: bone.value, unit: bone.unit },
    { key: "skeletal", label: i18n.t("scale:metric.skeletalMuscle"), value: formatValue("decimal1", c.skeletalMusclePercent), unit: "%" },
    { key: "visceral", label: i18n.t("scale:metric.visceralFat"), value: String(c.visceralFatLevel) },
    { key: "subcutaneous", label: i18n.t("scale:metric.subcutaneousFat"), value: formatValue("decimal1", c.subcutaneousFatPercent), unit: "%" },
    { key: "bmi", label: i18n.t("scale:metric.bmi"), value: formatValue("decimal1", c.bmi) },
    { key: "lean", label: i18n.t("scale:metric.leanMass"), value: lean.value, unit: lean.unit },
    { key: "bmr", label: i18n.t("scale:metric.bmr"), value: String(c.bmrKcal), unit: "kcal" },
    { key: "age", label: i18n.t("scale:metric.bodyAge"), value: String(c.bodyAgeYears) },
  ];
}

function ReadingCard({ s }: { s: Scale }) {
  const { t } = useTranslation("scale");
  const frame: LeFuFrame | null = s.reading?.frame ?? null;
  const weight = frame ? weightText(frame.weightKg) : null;
  const weighing = !!frame && !s.final;
  const tiles = s.composition ? compositionTiles(s.composition) : [];
  return (
    <SectionShell variant="card" title={t("reading.title")}>
      {!frame ? (
        <Text className={cn(BODY, "text-foreground-secondary")}>{s.status === "connected" ? t("reading.waiting") : t("empty")}</Text>
      ) : (
        <View className="gap-4">
          <View className="items-center gap-1 py-2">
            <ValueUnit
              value={weight!.value}
              unit={weight!.unit}
              className="font-numeric text-[56px] font-bold leading-[60px] tracking-[-0.02em]"
              unitClassName="text-lg font-semibold leading-6 text-foreground-secondary"
            />
            {weighing ? (
              <Text className={CAPTION}>{t("reading.measuring")}</Text>
            ) : s.final && !s.composition && !s.bodyError ? (
              <Text className={CAPTION}>{t("reading.finalWeightOnly")}</Text>
            ) : (
              frame.impedanceOhm !== null && (
                <View className="flex-row items-baseline gap-1.5">
                  <Text className={CAPTION}>{t("reading.impedance")}</Text>
                  <ValueUnit value={String(Math.round(frame.impedanceOhm))} unit="Ω" className="font-numeric text-[13px] font-semibold leading-4" />
                </View>
              )
            )}
          </View>

          {weighing && (
            <View className="flex-row items-center gap-2.5">
              <ActivityIndicator size="small" />
              <Text className={cn(BODY, "flex-1")}>{t("reading.measuring")}</Text>
            </View>
          )}

          {!!s.composition && tiles.length > 0 && (
            <View className="gap-2">
              {Array.from({ length: Math.ceil(tiles.length / 2) }, (_, row) => (
                <View key={row} className="flex-row gap-2">
                  {tiles.slice(row * 2, row * 2 + 2).map((tile) => (
                    <CompositionTile key={tile.key} label={tile.label} value={tile.value} unit={tile.unit} />
                  ))}
                  {tiles.slice(row * 2, row * 2 + 2).length === 1 && <View className="flex-1" />}
                </View>
              ))}
            </View>
          )}

          {s.final && s.bodyError === "height" && (
            <View className="flex-row gap-2.5">
              <View className="mt-0.5"><Icon icon={Info} size={16} tone="muted-foreground" strokeWidth={2} /></View>
              <Text className={cn(HINT, "flex-1")}>{t("reading.missingHeight")}</Text>
            </View>
          )}
          {s.final && s.bodyError && s.bodyError !== "height" && (
            <View className="flex-row gap-2.5">
              <View className="mt-0.5"><Icon icon={TriangleAlert} size={16} tone="warning-text" strokeWidth={2} /></View>
              <Text className={cn(HINT, "flex-1")}>{t("reading.invalid")}</Text>
            </View>
          )}
          {s.final && !s.composition && !s.bodyError && (
            <View className="flex-row gap-2.5">
              <View className="mt-0.5"><Icon icon={Info} size={16} tone="muted-foreground" strokeWidth={2} /></View>
              <Text className={cn(HINT, "flex-1")}>{t("reading.noComposition")}</Text>
            </View>
          )}

          {s.final && s.saveState !== "saved" && (
            <Button onPress={() => void s.save()} disabled={s.saveState === "saving"}>
              {s.saveState === "saving" ? t("saving") : t("save")}
            </Button>
          )}
          {s.saveState === "saved" && (
            <View className="flex-row items-center gap-2 rounded-xl bg-optimal/10 p-3">
              <Icon icon={ShieldCheck} size={18} tone="optimal-text" strokeWidth={2.25} />
              <Text className="text-[15px] font-semibold leading-[22px] text-optimal-text">{t("saved")}</Text>
            </View>
          )}
          {s.saveState === "failed" && !!s.saveError && (
            <Text accessibilityRole="alert" className={WARN}>
              {s.saveError}
            </Text>
          )}
        </View>
      )}
    </SectionShell>
  );
}

// ── History and profile ─────────────────────────────────────────────────────

function HistoryCard({ s }: { s: Scale }) {
  const { t } = useTranslation("scale");
  const h = s.history;
  return (
    <SectionShell variant="card" title={t("history.title")}>
      {!h ? (
        <Text className={cn(BODY, "text-foreground-secondary")}>{t("history.none")}</Text>
      ) : (
        <View>
          <Row label={t("history.received")} value={String(h.received)} />
          <Row rule label={t("history.saved")} value={String(h.saved)} tone="text-optimal-text" />
          {h.skipped > 0 && <Row rule label={t("history.skipped")} value={String(h.skipped)} />}
          {h.failed > 0 && <Row rule label={t("history.failed")} value={String(h.failed)} tone="text-warning-text" />}
        </View>
      )}
      <Text className={cn(HINT, "mt-2")}>{t("history.note")}</Text>
    </SectionShell>
  );
}

function ProfileCard({ s }: { s: Scale }) {
  const { t } = useTranslation("scale");
  return (
    <SectionShell variant="card" title={t("settings.title")}>
      <Text className={cn(BODY, "text-foreground-secondary")}>{t("profileNote")}</Text>
      <View className="mt-3">
        <Row label={t("athlete.title")} value={s.athlete ? t("athlete.on") : t("athlete.off")} />
      </View>
      <Text className={cn(HINT, "mt-2")}>{t("athlete.hint")}</Text>
    </SectionShell>
  );
}

/** The scale screen (`/scale`), opened from Health and Settings › Scale. */
export function ScaleScreen() {
  const { t } = useTranslation("scale");
  const scale = useLeFuScale();
  // The scale link is short-lived: leaving the screen lets it go, so another app can use the scale and its battery rests.
  const { disconnect } = scale;
  useFocusEffect(useCallback(() => () => void disconnect(), [disconnect]));
  return (
    <DetailShell
      title={t("title")}
      subtitle={t("subtitle")}
      instant
      primary={
        <View className="w-full gap-3">
          {scale.permission !== "granted" || scale.radio !== "on" ? <PermissionsCard s={scale} /> : null}
          <ConnectionCard s={scale} />
          <ReadingCard s={scale} />
          <HistoryCard s={scale} />
          <ProfileCard s={scale} />
          <View className="flex-row gap-2.5 px-1">
            <View className="mt-0.5"><Icon icon={Info} size={16} tone="muted-foreground" strokeWidth={2} /></View>
            <Text className={cn(HINT, "flex-1")}>{t("settings.note")}</Text>
          </View>
          <View className="flex-row gap-2.5 px-1">
            <View className="mt-0.5"><Icon icon={Bluetooth} size={16} tone="muted-foreground" strokeWidth={2} /></View>
            <Text className={cn(HINT, "flex-1")}>{t("permissions.note")}</Text>
          </View>
        </View>
      }
    />
  );
}

// The screen keeps the scale's own status line honest when the radio is unavailable; this is shared with Settings.
export { statusLabel };
