// The tracking screen `/gym/session/[id]`: Strong's workout page. One card per exercise, a row per set with the last
// time's numbers beside the weight and reps, a tick at the end of each row, and the rest timer floating above the list.
// Every tick and every edit is its own write, so a killed app comes back to the same workout.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Check, Clock, Dumbbell, History, MoreHorizontal, Plus, Scale, Trash2 } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { newId } from "@/lib/ids";
import { addSet, deleteSet, discardSession, finishSession, saveSet, setExerciseUnit, setSuperset, startRest, stopRest, updateSession } from "@/actions/gym";
import { fromUnit, loadText } from "@/core/gym/load";
import type { GymExercise, GymSession, GymSet, SetType } from "@/core/gym/types";
import type { Block } from "@/queries/gym";
import { getGymSession } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { i18n } from "@/i18n/config";
import { Button } from "@/ui/Button";
import { Card, CardFill, useCardStyle } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { MenuPanel, useMenu } from "@/ui/Menu";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { Input } from "@/screens/log/fields";
import { goBack, push } from "@/ui/navigate";
import { FACES } from "@/ui/fontClasses";
import { useTheme } from "@/ui/theme";
import { ConfirmDialog, MenuItem, clockText, lengthText, useNow, whenText } from "./parts";

/** The rest a ticked set starts, in seconds. Strong's default; a routine's own rest is not carried yet. */
const DEFAULT_REST = 90;

export function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation("gym");
  const { data } = useScreen((ctx) => getGymSession(ctx, id), ["gym-session", id]);
  const vm = data;
  const now = useNow();
  const [confirm, setConfirm] = useState<"finish" | "discard" | "delete" | null>(null);
  const [rename, setRename] = useState(false);
  const { ref: menuRef, anchor, open: openMenu, close: closeMenu } = useMenu();

  if (!vm) {
    return <DetailShell title={t("session.title")} loading bodySkeleton={<View className="h-40" />} />;
  }

  const { session } = vm;
  const elapsed = Math.max(0, (session.endTs ?? now) - session.startTs);
  const restLeft = session.restStartedTs && session.restSec ? Math.max(0, session.restStartedTs + session.restSec - now) : 0;
  const store = actionCtx().store;

  const save = async (set: GymSet, draft: Draft) => {
    await saveSet(store, { ...set, ...draft });
    dataChanged();
  };
  const tick = async (set: GymSet, draft: Draft) => {
    const on = !set.completed;
    await saveSet(store, { ...set, ...draft, completed: on, ts: on ? now : null });
    // A superset rests only after its other exercise has nothing left to tick.
    const group = set.supersetId ? vm.blocks.filter((b) => b.sets.some((s) => s.supersetId === set.supersetId)) : [];
    const waiting = group.some((b) => b.exercise.id !== set.exerciseId && b.sets.some((s) => !s.completed));
    if (on && !waiting) await startRest(store, session, DEFAULT_REST, now);
    dataChanged();
  };
  const linkSuperset = async (block: Block, next: Block | null, on: boolean) => {
    await setSuperset(store, session.id, block.exercise.id, next?.exercise.id ?? null, on ? newId() : null);
    dataChanged();
  };
  const retype = async (set: GymSet, type: SetType) => {
    await saveSet(store, { ...set, type });
    dataChanged();
  };
  const note = async (set: GymSet, text: string) => {
    await saveSet(store, { ...set, note: text });
    dataChanged();
  };
  const removeSet = async (set: GymSet) => {
    await deleteSet(store, set);
    dataChanged();
  };
  const removeExercise = async (block: Block) => {
    for (const s of block.sets) await store.deleteGymSet(s.id);
    dataChanged();
  };
  const addOne = async (block: Block) => {
    await addSet(store, session.id, block.exercise.id);
    dataChanged();
  };

  return (
    <View className="flex-1">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <DetailShell
          title={session.name}
          subtitle={`${clockText(elapsed)} · ${t("session.setsCount", { count: vm.setCount })}`}
          floatingAction={false}
          backHref="/gym"
          action={
            <View className="flex-row items-center gap-1">
              {!session.finished && (
                <Press accessibilityRole="button" onPress={() => setConfirm("finish")} className="h-9 items-center justify-center rounded-full bg-primary px-3.5">
                  <Text className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-foreground">{t("session.finish")}</Text>
                </Press>
              )}
              <View ref={menuRef} collapsable={false}>
                <Press accessibilityRole="button" onPress={openMenu} className="size-9 items-center justify-center rounded-full">
                  <Icon icon={MoreHorizontal} size={20} tone="foreground" />
                </Press>
              </View>
            </View>
          }
          footer={
            <View className="gap-3 pb-8">
              <Button variant="secondary" onPress={() => push(`/gym/exercises?session=${session.id}`)}>
                <View className="flex-row items-center gap-2">
                  <Icon icon={Plus} size={16} tone="foreground" />
                  <Text className="text-[13px] font-bold uppercase tracking-[0.1em]">{t("session.addExercise")}</Text>
                </View>
              </Button>
              {session.finished && !!session.endTs && <Text className="text-center text-[12px] text-muted-foreground">{lengthText(session.endTs - session.startTs)}</Text>}
            </View>
          }
          primary={
            vm.blocks.length ? (
              <View className="gap-4">
                {vm.blocks.map((block, index) => (
                  <BlockCard
                    key={block.exercise.id}
                    block={block}
                    next={vm.blocks[index + 1] ?? null}
                    onSuperset={linkSuperset}
                    session={session}
                    onSave={save}
                    onTick={tick}
                    onType={retype}
                    onNote={note}
                    onRemoveSet={removeSet}
                    onRemoveExercise={removeExercise}
                    onAddSet={addOne}
                  />
                ))}
              </View>
            ) : (
              <Card className="items-center gap-3 px-4 py-8">
                <CardFill />
                <Icon icon={Dumbbell} size={24} tone="muted-foreground" />
                <Text className="text-center text-[15px] text-foreground-secondary">{t("session.empty")}</Text>
                <Button variant="secondary" onPress={() => push(`/gym/exercises?session=${session.id}`)}>
                  {t("session.addExercise")}
                </Button>
              </Card>
            )
          }
        />

        <MenuPanel anchor={anchor} onClose={closeMenu} align="end">
          <MenuItem icon={Dumbbell} label={t("session.rename")} onPress={() => (closeMenu(), setRename(true))} />
          <MenuItem icon={History} label={t("session.addExercise")} onPress={() => (closeMenu(), push(`/gym/exercises?session=${session.id}`))} />
          {!session.finished && <MenuItem icon={Trash2} label={t("session.discard")} danger onPress={() => (closeMenu(), setConfirm("discard"))} />}
          {session.finished && <MenuItem icon={Trash2} label={t("session.delete")} danger onPress={() => (closeMenu(), setConfirm("delete"))} />}
        </MenuPanel>

        {restLeft > 0 && <RestBar left={restLeft} total={session.restSec ?? DEFAULT_REST} onSkip={() => void stopRest(store, session).then(dataChanged)} />}
      </KeyboardAvoidingView>

      <ConfirmDialog
        open={confirm === "finish"}
        title={t("session.finishTitle")}
        body={t("session.finishBody", { sets: vm.setCount, time: clockText(elapsed) })}
        confirm={t("session.finish")}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await finishSession(store, session, now);
          dataChanged();
        }}
      />
      <ConfirmDialog
        open={confirm === "discard" || confirm === "delete"}
        title={confirm === "discard" ? t("session.discardTitle") : t("session.deleteTitle")}
        body={confirm === "discard" ? t("session.discardBody") : t("session.deleteBody")}
        confirm={confirm === "discard" ? t("session.discardConfirm") : t("session.delete")}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const was = confirm;
          setConfirm(null);
          await discardSession(store, session.id);
          dataChanged();
          if (was) goBack();
        }}
      />
      {rename && (
        <RenameDialog
          initial={session.name}
          onClose={() => setRename(false)}
          onSave={async (name) => {
            setRename(false);
            await updateSession(store, session, { name });
            dataChanged();
          }}
        />
      )}
    </View>
  );
}

type Draft = Pick<GymSet, "weightKg" | "reps" | "seconds" | "distanceM">;

/** One exercise: its header, the column labels and the rows. */
function BlockCard({
  block,
  next,
  onSuperset,
  session,
  onSave,
  onTick,
  onType,
  onNote,
  onRemoveSet,
  onRemoveExercise,
  onAddSet,
}: {
  block: Block;
  next: Block | null;
  onSuperset: (block: Block, next: Block | null, on: boolean) => void;
  session: GymSession;
  onSave: (set: GymSet, d: Draft) => void;
  onTick: (set: GymSet, d: Draft) => void;
  onType: (set: GymSet, t: SetType) => void;
  onNote: (set: GymSet, text: string) => void;
  onRemoveSet: (set: GymSet) => void;
  onRemoveExercise: (block: Block) => void;
  onAddSet: (block: Block) => void;
}) {
  const { t } = useTranslation("gym");
  const { exercise } = block;
  const { ref: menuRef, anchor, open: openMenu, close: closeMenu } = useMenu();
  const [remove, setRemove] = useState(false);
  const [noting, setNoting] = useState<GymSet | null>(null);
  const unit = exercise.unit;
  const supersetId = block.sets.find((s) => s.supersetId)?.supersetId ?? null;
  const cardio = exercise.bodyPart === "cardio";
  const hold = exercise.hold || block.sets.some((s) => !!s.seconds && !s.reps);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  // Strong's "+0%": today's volume against the last time this exercise was done.
  const lastVolume = block.prev.reduce((n, s) => n + (s && s.type !== "warmup" ? s.weightKg * s.reps : 0), 0);
  const nowVolume = block.sets.reduce((n, s) => n + (s.completed && s.type !== "warmup" ? s.weightKg * s.reps : 0), 0);
  const delta = lastVolume > 0 && nowVolume > 0 ? Math.round(((nowVolume - lastVolume) / lastVolume) * 100) : null;

  return (
    <Card className="px-3 py-4">
      <CardFill />
      <View className="mb-3 flex-row items-center gap-2 px-1">
        <Press accessibilityRole="link" onPress={() => push(`/gym/exercise/${exercise.id}`)} className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Text className="shrink text-[15px] font-semibold leading-5" numberOfLines={1}>
            {exercise.name}
          </Text>
          <Icon icon={Scale} size={12} tone="muted-foreground" />
        </Press>
        {!!supersetId && (
          <View className="h-5 items-center justify-center rounded-full bg-secondary px-2">
            <Text className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("session.superset")}</Text>
          </View>
        )}
        {delta != null && <Text className={cn("font-numeric text-[12px] font-semibold", delta >= 0 ? "text-strain" : "text-recovery-red-text")}>{`${delta >= 0 ? "+" : ""}${delta}%`}</Text>}
        <View ref={menuRef} collapsable={false}>
          <Press accessibilityRole="button" accessibilityLabel={t("session.exerciseMenu")} hitSlop={10} onPress={openMenu} className="size-7 items-center justify-center">
            <Icon icon={MoreHorizontal} size={18} tone="muted-foreground" />
          </Press>
        </View>
      </View>

      <View className="mb-1 flex-row items-center gap-2 px-1">
        <Text className="w-6 text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.set")}</Text>
        <Text className="min-w-0 flex-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.previous")}</Text>
        {!hold && <Text className="w-[62px] text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{unit === "lb" ? t("session.lb") : t("session.kg")}</Text>}
        {hold && <Text className="w-[62px] text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.sec")}</Text>}
        {cardio && <Text className="w-[54px] text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.km")}</Text>}
        {cardio && <Text className="w-[54px] text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.min")}</Text>}
        {!hold && !cardio && <Text className="w-[54px] text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground">{t("session.reps")}</Text>}
        <View className="size-8" />
      </View>

      <View>
        {block.sets.map((set, i) => (
          <SetRow
            key={set.id}
            set={set}
            prev={block.prev[i] ?? null}
            unit={unit}
            cardio={cardio}
            hold={hold}
            onSave={(d) => onSave(set, d)}
            onTick={(d) => onTick(set, d)}
            onMenu={() => setNoting(set)}
          />
        ))}
      </View>

      <Press accessibilityRole="button" onPress={() => onAddSet(block)} className="mt-2 h-10 items-center justify-center">
        <Text className="text-[12px] font-bold uppercase tracking-[0.1em] text-strain">{t("session.addSet")}</Text>
      </Press>

      <MenuPanel anchor={anchor} onClose={closeMenu} align="end">
        {supersetId ? (
          <MenuItem icon={Scale} label={t("session.removeSuperset")} onPress={() => (closeMenu(), onSuperset(block, null, false))} />
        ) : next ? (
          <MenuItem icon={Plus} label={t("session.supersetWith", { name: next.exercise.name })} onPress={() => (closeMenu(), onSuperset(block, next, true))} />
        ) : null}
        <MenuItem icon={Scale} label={t("session.changeUnit", { unit: unit === "kg" ? "LB" : "KG" })} onPress={() => (closeMenu(), void setUnit(exercise, unit === "kg" ? "lb" : "kg"))} />
        <MenuItem icon={History} label={t("exercise.history")} onPress={() => (closeMenu(), push(`/gym/exercise/${exercise.id}`))} />
        <MenuItem icon={Trash2} label={t("session.removeExercise")} danger onPress={() => (closeMenu(), setRemove(true))} />
      </MenuPanel>

      <ConfirmDialog
        open={remove}
        title={t("session.removeExercise")}
        body={t("session.removeExerciseBody", { count: block.sets.length })}
        confirm={t("session.removeExercise")}
        onCancel={() => setRemove(false)}
        onConfirm={() => {
          setRemove(false);
          onRemoveExercise(block);
        }}
      />
      {noting && (
        <NoteDialog
          initial={noting.note ?? ""}
          type={noting.type}
          onType={(type) => {
            onType(noting, type);
            setNoting(null);
          }}
          onClose={() => setNoting(null)}
          onSave={(text) => {
            onNote(noting, text);
            setNoting(null);
          }}
          onDelete={() => {
            onRemoveSet(noting);
            setNoting(null);
          }}
        />
      )}
      {/* A note on any set shows under the exercise: the file's notes, and the ones typed here. */}
      {block.sets.some((s) => s.note) && (
        <View className="mt-1 gap-1 px-1">
          {block.sets
            .filter((s) => s.note)
            .map((s) => (
              <Text key={s.id} className="text-[12px] leading-4 text-muted-foreground" onPress={() => setNoting(s)}>
                {`${s.setNo}. ${s.note}`}
              </Text>
            ))}
        </View>
      )}
      <Text className="mt-1 px-1 text-[11px] text-muted-foreground">{whenText(block.prev[0]?.ts ?? null, now)}</Text>
    </Card>
  );
}

/** One set: number, last time, weight, reps, tick. */
function SetRow({ set, prev, unit, cardio, hold, onSave, onTick, onMenu }: { set: GymSet; prev: GymSet | null; unit: "kg" | "lb"; cardio: boolean; hold: boolean; onSave: (d: Draft) => void; onTick: (d: Draft) => void; onMenu: () => void }) {
  const { t } = useTranslation("gym");
  const [weight, setWeight] = useState(() => loadText(set.weightKg, unit));
  const [reps, setReps] = useState(() => String(set.reps));
  const [secs, setSecs] = useState(() => (set.seconds ? String(Math.round(set.seconds)) : ""));
  const [km, setKm] = useState(() => (set.distanceM ? String(Math.round(set.distanceM / 10) / 100) : ""));
  const [mins, setMins] = useState(() => (set.seconds ? String(Math.round((set.seconds / 60) * 10) / 10) : ""));
  const typed = useRef(false);

  // A reload from the store refreshes the fields, but never while one is being typed in.
  useEffect(() => {
    if (typed.current) return;
    setWeight(loadText(set.weightKg, unit));
    setReps(String(set.reps));
    setSecs(set.seconds ? String(Math.round(set.seconds)) : "");
    setKm(set.distanceM ? String(Math.round(set.distanceM / 10) / 100) : "");
    setMins(set.seconds ? String(Math.round((set.seconds / 60) * 10) / 10) : "");
  }, [set.weightKg, set.reps, set.seconds, set.distanceM, unit]);

  const n = (v: string) => {
    const x = parseFloat(v.replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  };
  const draft = (): Draft => ({
    weightKg: hold || cardio ? 0 : fromUnit(n(weight), unit),
    reps: hold || cardio ? 0 : Math.max(0, Math.round(n(reps))),
    seconds: cardio ? Math.round(n(mins) * 60) || null : hold ? Math.round(n(secs)) || null : null,
    distanceM: cardio ? Math.round(n(km) * 1000) || null : null,
  });
  const commit = () => {
    typed.current = false;
    onSave(draft());
  };
  const prevText = prev
    ? hold
      ? `${Math.round(prev.seconds ?? 0)} s`
      : cardio
        ? `${Math.round((prev.distanceM ?? 0) / 10) / 100} km`
        : `${loadText(prev.weightKg, unit)} ${unit} × ${prev.reps}`
    : "—";

  return (
    <Press onLongPress={onMenu} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`${t("session.set")} ${set.setNo}`} className="flex-row items-center gap-2 rounded-lg px-1 py-1">
      <Press onPress={onMenu} hitSlop={10} className="w-6 items-center justify-center">
        <Text className={cn("font-numeric text-[13px]", set.completed ? "text-foreground" : "text-muted-foreground")}>{set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : set.setNo}</Text>
      </Press>
      <Text className="min-w-0 flex-1 font-numeric text-[12px] leading-4 text-muted-foreground" numberOfLines={1}>
        {prevText}
      </Text>
      {!hold && (
        <NumCell value={weight} onChangeText={(v) => ((typed.current = true), setWeight(v))} onEnd={commit} className="w-[62px]" dim={set.completed} />
      )}
      {hold && <NumCell value={secs} onChangeText={(v) => ((typed.current = true), setSecs(v))} onEnd={commit} className="w-[62px]" dim={set.completed} />}
      {cardio && <NumCell value={km} onChangeText={(v) => ((typed.current = true), setKm(v))} onEnd={commit} className="w-[54px]" dim={set.completed} />}
      {cardio && <NumCell value={mins} onChangeText={(v) => ((typed.current = true), setMins(v))} onEnd={commit} className="w-[54px]" dim={set.completed} />}
      {!hold && !cardio && <NumCell value={reps} onChangeText={(v) => ((typed.current = true), setReps(v))} onEnd={commit} className="w-[54px]" dim={set.completed} />}
      <Press
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.completed }}
        onPress={() => onTick(draft())}
        hitSlop={6}
        className={cn("size-8 items-center justify-center rounded-full", set.completed ? "bg-primary" : "border border-input")}
      >
        {set.completed && <Icon icon={Check} size={16} tone="primary-foreground" strokeWidth={2.6} />}
      </Press>
    </Press>
  );
}

/** The number cell: a filled rounded box, the way Strong draws a set's weight. */
function NumCell({ value, onChangeText, onEnd, className, dim }: { value: string; onChangeText: (v: string) => void; onEnd: () => void; className?: string; dim?: boolean }) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onBlur={onEnd}
      onSubmitEditing={onEnd}
      keyboardType="decimal-pad"
      selectTextOnFocus
      returnKeyType="done"
      placeholder="0"
      placeholderTextColor={c["muted-foreground"]}
      className={cn("h-9 rounded-lg bg-secondary text-center font-numeric text-[15px] font-semibold text-foreground", dim && "text-muted-foreground", className)}
      style={{ fontFamily: FACES.numeric.semibold }}
    />
  );
}

/** The rest countdown, a bar at the foot of the screen. It reads the session's start instant, so it stays right if the
 *  phone slept through it. */
function RestBar({ left, total, onSkip }: { left: number; total: number; onSkip: () => void }) {
  const { t } = useTranslation("gym");
  const cardStyle = useCardStyle("overlay");
  const share = Math.max(0, Math.min(1, left / total));
  return (
    <View className="absolute inset-x-3 bottom-3 overflow-hidden rounded-2xl bg-card px-4 py-3" style={cardStyle}>
      <View className="flex-row items-center gap-3">
        <Icon icon={Clock} size={18} tone="strain" />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("session.rest")}</Text>
          <Text className="font-numeric text-[18px] font-semibold leading-6">{clockText(left)}</Text>
        </View>
        <Press accessibilityRole="button" onPress={onSkip} className="h-9 items-center justify-center rounded-full bg-secondary px-4">
          <Text className="text-[12px] font-bold uppercase tracking-[0.08em]">{t("session.restSkip")}</Text>
        </Press>
      </View>
      <View className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <View className="h-full rounded-full bg-strain" style={{ width: `${share * 100}%` }} />
      </View>
    </View>
  );
}

/** The session's name. */
function RenameDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation("gym");
  const [text, setText] = useState(initial);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-dim-strong px-4">
        <Pressable onPress={() => {}} className="w-full max-w-[384px] gap-4 rounded-3xl bg-popover p-5">
          <Text className="text-[17px] font-semibold">{t("session.rename")}</Text>
          <Input autoFocus value={text} onChangeText={setText} placeholder={t("session.namePlaceholder")} maxLength={60} />
          <View className="gap-2">
            <Button onPress={() => onSave(text)}>{t("session.save")}</Button>
            <Button variant="outline" onPress={onClose}>
              {i18n.t("common:actions.cancel")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A set's note, and the way to delete the set or change what it was. */
function NoteDialog({ initial, type, onType, onClose, onSave, onDelete }: { initial: string; type: SetType; onType: (type: SetType) => void; onClose: () => void; onSave: (text: string) => void; onDelete?: () => void }) {
  const { t } = useTranslation("gym");
  const [text, setText] = useState(initial);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-dim-strong px-4">
        <Pressable onPress={() => {}} className="w-full max-w-[384px] gap-4 rounded-3xl bg-popover p-5">
          <Text className="text-[17px] font-semibold">{t("session.notePlaceholder")}</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {(["normal", "warmup", "drop", "failure"] as const).map((kind) => (
              <Text
                key={kind}
                onPress={() => onType(kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: type === kind }}
                className={cn("h-8 rounded-full px-3 text-center text-[12px] font-medium leading-8", type === kind ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}
              >
                {t(`session.${kind}`)}
              </Text>
            ))}
          </View>
          <Input autoFocus multiline value={text} onChangeText={setText} placeholder={t("session.notePlaceholder")} maxLength={240} className="min-h-20" />
          <View className="gap-2">
            <Button onPress={() => onSave(text)}>{t("session.save")}</Button>
            <Button variant="outline" onPress={onClose}>
              {i18n.t("common:actions.cancel")}
            </Button>
            {!!onDelete && (
              <Button variant="ghost" textClassName="text-recovery-red-text" onPress={onDelete}>
                {t("session.delete")}
              </Button>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

async function setUnit(exercise: GymExercise, unit: "kg" | "lb") {
  await setExerciseUnit(actionCtx().store, exercise, unit);
  dataChanged();
}
