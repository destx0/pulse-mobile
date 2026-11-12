// Habits `/habits`: the daily list, Loop's cards. Each card carries the habit icon, its period progress and the last
// seven days, whose last mark is today; the menu edits, skips, archives or deletes. The tracker is Pulse's own: local
// SQLite, no health source.
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, CircleCheckBig, MoreHorizontal, Pencil, Plus, SkipForward, Trash2, type LucideIcon } from "lucide-react-native";
import type { Habit } from "@/core/habits/types";
import { habitIcon } from "@/core/habits/icons";
import type { HabitCardVM } from "@/queries/habits";
import { getHabits } from "@/queries/habits";
import { archiveHabit, clearHabitEntry, deleteHabit, setHabitEntry, skipHabitDay, toggleHabit } from "@/actions/habits";
import { actionCtx } from "@/state/app";
import { habitsChanged } from "@/state/habits";
import { useScreen } from "@/screens/useScreen";
import { formatDay } from "@/lib/format";
import { periodText, streakText } from "@/lib/habits";
import { Card, CardFill } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { MenuPanel, useMenu } from "@/ui/Menu";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { ConfirmDialog } from "@/screens/gym/parts";
import { EmptyState } from "@/ui/shells/EmptyState";
import { PageShell } from "@/ui/shells/PageShell";
import { QueryError } from "@/ui/shells/QueryError";
import { SectionShell } from "@/ui/shells/SectionShell";
import { push } from "@/ui/navigate";
import { toast } from "@/ui/Toast";
import { DayMark, HabitValueDialog, habitColor } from "./parts";
import { FoodOrdersCard } from "./FoodOrdersCard";

const nowS = () => Math.floor(Date.now() / 1000);

export function HabitsScreen() {
  const { t } = useTranslation("habits");
  const { data, error, reload } = useScreen(getHabits, ["habits"], { eager: true, freshMs: 0 });
  const [value, setValue] = useState<{ habit: Habit; day: string; initial: number | null } | null>(null);
  const [removing, setRemoving] = useState<Habit | null>(null);
  const changed = () => habitsChanged();

  const store = () => actionCtx().store;
  const toggle = async (habit: Habit, day: string) => {
    if (habit.kind === "numeric") {
      const entry = (await store().habitEntries(day, day)).find((e) => e.habitId === habit.id);
      setValue({ habit, day, initial: entry && !entry.skip ? entry.value : null });
      return;
    }
    await toggleHabit(store(), habit, day, nowS());
    changed();
  };
  const skip = async (habit: Habit, day: string) => {
    await skipHabitDay(store(), habit, day, nowS());
    changed();
  };
  const saveValue = async (habit: Habit, day: string, amount: number) => {
    await setHabitEntry(store(), habit, { day, value: amount }, nowS());
    setValue(null);
    changed();
  };
  const clearValue = async (habit: Habit, day: string) => {
    await clearHabitEntry(store(), habit.id, day);
    setValue(null);
    changed();
  };
  const archive = async (habit: Habit) => {
    await archiveHabit(store(), habit.id, true, nowS());
    changed();
    toast.success(t("menu.archived"));
  };
  const restore = async (habit: Habit) => {
    await archiveHabit(store(), habit.id, false, nowS());
    changed();
    toast.success(t("menu.unarchived"));
  };

  return (
    <PageShell
      title={t("title")}
      loading={!data}
      actions={
        <Press activeScale={0.96} accessibilityRole="button" accessibilityLabel={t("new")} onPress={() => push("/habits/edit")} className="h-9 flex-row items-center gap-1.5 rounded-full bg-secondary px-3">
          <Icon icon={Plus} size={16} tone="foreground" strokeWidth={2.4} />
          <Text className="text-[12px] font-bold uppercase leading-4 tracking-[0.1em]">{t("new")}</Text>
        </Press>
      }
    >
      {!data ? (
        error ? <QueryError compact error={error} reload={reload} /> : <View className="h-40" />
      ) : (
        <View className="gap-3">
          {data.habits.length === 0 ? (
            <EmptyState icon={CircleCheckBig} body={t("emptyBody")} action={{ label: t("new"), onClick: () => push("/habits/edit") }} />
          ) : (
            <View className="gap-2.5">
              {data.habits.map((card) => (
                <HabitCard key={card.habit.id} card={card} today={data.today} onToggle={toggle} onSkip={skip} onDelete={setRemoving} onArchive={archive} />
              ))}
            </View>
          )}
          {data.archived.length > 0 && (
            <SectionShell variant="section" title={t("archived")}>
              <Card className="px-3 py-1">
                <CardFill />
                {data.archived.map((card, i) => (
                  <View key={card.habit.id} className={cn("flex-row items-center gap-2 py-1.5", i > 0 && "border-t border-border")}>
                    <Text className="min-w-0 flex-1 text-[14px] leading-5 text-foreground-secondary" numberOfLines={1}>
                      {card.habit.name}
                    </Text>
                    <Press accessibilityRole="button" accessibilityLabel={t("menu.unarchive")} onPress={() => void restore(card.habit)} className="h-8 flex-row items-center gap-1.5 rounded-full bg-secondary px-3">
                      <Icon icon={ArchiveRestore} size={14} tone="foreground-secondary" />
                      <Text className="text-[11px] font-bold uppercase tracking-[0.08em]">{t("menu.unarchive")}</Text>
                    </Press>
                  </View>
                ))}
              </Card>
            </SectionShell>
          )}
          <FoodOrdersCard />
        </View>
      )}

      {value && (
        <HabitValueDialog
          key={`${value.habit.id}-${value.day}`}
          habit={value.habit}
          day={value.day}
          initial={value.initial}
          onClose={() => setValue(null)}
          onSave={(amount) => void saveValue(value.habit, value.day, amount)}
          onClear={() => void clearValue(value.habit, value.day)}
          onSkip={() => {
            void skip(value.habit, value.day);
            setValue(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirm={t("delete")}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await deleteHabit(store(), removing.id);
          setRemoving(null);
          changed();
        }}
      />
    </PageShell>
  );
}

function HabitCard({
  card,
  today,
  onToggle,
  onSkip,
  onDelete,
  onArchive,
}: {
  card: HabitCardVM;
  today: string;
  onToggle: (habit: Habit, day: string) => Promise<void>;
  onSkip: (habit: Habit, day: string) => Promise<void>;
  onDelete: (habit: Habit) => void;
  onArchive: (habit: Habit) => Promise<void>;
}) {
  const { t } = useTranslation("habits");
  const { c } = useTheme();
  const color = habitColor(c, card.habit.color);
  const { ref: menuRef, anchor, open: openMenu, close: closeMenu } = useMenu();
  const current = card.stats.current;
  return (
    <Card className="gap-2 px-4 py-2.5">
      <CardFill />
      <View className="flex-row items-center gap-2.5">
        <Text className="text-[18px] leading-6">{habitIcon(card.habit)}</Text>
        <Press accessibilityRole="link" accessibilityLabel={card.habit.name} onPress={() => push(`/habits/${card.habit.id}`)} className="min-w-0 flex-1 gap-0.5">
          <Text className="shrink text-[15px] font-semibold leading-5" numberOfLines={1}>
            {card.habit.name}
          </Text>
          <Text className="text-[11px] leading-[14px] text-muted-foreground" numberOfLines={1}>
            {periodText(card.habit, card.stats)}
            {current > 0 ? ` · ${streakText(card.habit, current)}` : ""}
          </Text>
        </Press>
        <View ref={menuRef} collapsable={false}>
          <Press accessibilityRole="button" accessibilityLabel={t("menu.label")} onPress={openMenu} className="size-9 items-center justify-center">
            <Icon icon={MoreHorizontal} size={18} tone="muted-foreground" />
          </Press>
        </View>
      </View>
      {/* The week row is the tick: its last mark is today. */}
      <View className="flex-row">
        {card.week.map((d) => (
          <Press key={d.day} accessibilityRole="button" accessibilityLabel={formatDay(d.day, { weekday: "long" })} disabled={d.state.state === "off"} accessibilityState={{ disabled: d.state.state === "off" }} onPress={() => void onToggle(card.habit, d.day)} className="flex-1 items-center gap-1 py-1">
            <Text className={cn("text-[9px] font-semibold uppercase leading-3 tracking-[0.04em]", d.day === today ? "text-foreground" : "text-muted-foreground")}>{formatDay(d.day, { weekday: "narrow" })}</Text>
            <DayMark habit={card.habit} state={d.state} color={color} size={22} today={d.day === today} />
          </Press>
        ))}
      </View>
      <MenuPanel anchor={anchor} onClose={closeMenu} align="end">
        <MenuItem icon={Pencil} label={t("menu.edit")} onPress={() => (closeMenu(), push(`/habits/edit?id=${card.habit.id}`))} />
        <MenuItem icon={SkipForward} label={t("menu.skip")} onPress={() => (closeMenu(), void onSkip(card.habit, today))} />
        <MenuItem icon={Archive} label={t("menu.archive")} onPress={() => (closeMenu(), void onArchive(card.habit))} />
        <MenuItem icon={Trash2} label={t("menu.delete")} danger onPress={() => (closeMenu(), onDelete(card.habit))} />
      </MenuPanel>
    </Card>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Press activeBg="bg-fill-hover" accessibilityRole="button" onPress={onPress} className="h-11 flex-row items-center gap-3 rounded-xl px-3">
      <Icon icon={icon} size={18} tone={danger ? "recovery-red-text" : "foreground-secondary"} />
      <Text className={cn("text-[15px] font-medium", danger && "text-recovery-red-text")}>{label}</Text>
    </Press>
  );
}
