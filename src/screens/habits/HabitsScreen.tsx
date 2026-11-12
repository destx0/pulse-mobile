// Habits `/habits`: a grid of habits by day, Loop's numbers. The left column holds the habit, the right one a scrollable
// month of ticks with today first; a tap ticks a day, a long press opens the menu. The tracker is Pulse's own: local
// SQLite, no health source.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, CircleCheckBig, Pencil, Plus, SkipForward, Trash2, type LucideIcon } from "lucide-react-native";
import type { Habit } from "@/core/habits/types";
import { habitIcon } from "@/core/habits/icons";
import type { HabitCardVM } from "@/queries/habits";
import { getHabits } from "@/queries/habits";
import { archiveHabit, clearHabitEntry, deleteHabit, setHabitEntry, skipHabitDay, toggleHabit } from "@/actions/habits";
import { actionCtx } from "@/state/app";
import { habitsChanged } from "@/state/habits";
import { useScreen } from "@/screens/useScreen";
import { DAY, formatDay } from "@/lib/format";
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
            <HabitGrid cards={data.habits} today={data.today} onToggle={toggle} onSkip={skip} onDelete={setRemoving} onArchive={archive} />
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

/** The list as a table: a fixed habit column and a month of days that scrolls under today's date header. */
function HabitGrid({
  cards,
  today,
  onToggle,
  onSkip,
  onDelete,
  onArchive,
}: {
  cards: HabitCardVM[];
  today: string;
  onToggle: (habit: Habit, day: string) => Promise<void>;
  onSkip: (habit: Habit, day: string) => Promise<void>;
  onDelete: (habit: Habit) => void;
  onArchive: (habit: Habit) => Promise<void>;
}) {
  const { c } = useTheme();
  const days = cards[0]?.days ?? [];
  return (
    <Card className="py-0">
      <CardFill />
      <View className="flex-row">
        <View className="w-36 shrink-0 border-r border-border">
          <View className="h-9 border-b border-border" />
          {cards.map((card, i) => (
            <HabitNameCell key={card.habit.id} card={card} today={today} first={i === 0} onSkip={onSkip} onDelete={onDelete} onArchive={onArchive} />
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
          <View>
            <View className="h-9 flex-row border-b border-border">
              {days.map((d) => (
                <DayHeading key={d.day} day={d.day} today={today} />
              ))}
            </View>
            {cards.map((card, i) => {
              const color = habitColor(c, card.habit.color);
              return (
                <View key={card.habit.id} className={cn("h-11 flex-row", i > 0 && "border-t border-border")}>
                  {card.days.map((d) => {
                    const off = d.state.state === "off";
                    return (
                      <Press key={d.day} accessibilityRole="button" accessibilityLabel={formatDay(d.day, DAY.long)} disabled={off} accessibilityState={{ disabled: off }} onPress={() => void onToggle(card.habit, d.day)} className="h-11 w-10 items-center justify-center">
                        <DayMark habit={card.habit} state={d.state} color={color} size={24} today={d.day === today} />
                      </Press>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Card>
  );
}

/** One date over its tick: the weekday and the day of the month, today in the foreground. */
function DayHeading({ day, today }: { day: string; today: string }) {
  const now = day === today;
  return (
    <View className="h-9 w-10 items-center justify-center gap-0.5">
      <Text className={cn("text-[9px] font-bold uppercase leading-3 tracking-[0.06em]", now ? "text-foreground" : "text-muted-foreground")}>{formatDay(day, { weekday: "short" })}</Text>
      <Text className={cn("font-numeric text-[10px] font-semibold leading-3", now ? "text-foreground" : "text-muted-foreground")}>{formatDay(day, { day: "numeric" })}</Text>
    </View>
  );
}

/** A habit's fixed cell: tapping opens it, holding opens the menu the tick columns have no room for. */
function HabitNameCell({
  card,
  today,
  first,
  onSkip,
  onDelete,
  onArchive,
}: {
  card: HabitCardVM;
  today: string;
  first: boolean;
  onSkip: (habit: Habit, day: string) => Promise<void>;
  onDelete: (habit: Habit) => void;
  onArchive: (habit: Habit) => Promise<void>;
}) {
  const { t } = useTranslation("habits");
  const { ref, anchor, open, close } = useMenu();
  return (
    <View ref={ref} collapsable={false} className={cn("h-11 flex-row items-center px-3", !first && "border-t border-border")}>
      <Press
        accessibilityRole="link"
        accessibilityLabel={card.habit.name}
        accessibilityHint={t("menu.label")}
        accessibilityActions={[{ name: "longpress", label: t("menu.label") }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && open()}
        onPress={() => push(`/habits/${card.habit.id}`)}
        onLongPress={open}
        delayLongPress={400}
        className="min-w-0 flex-1 flex-row items-center gap-2"
      >
        <Text className="text-[17px] leading-5">{habitIcon(card.habit)}</Text>
        <Text className="shrink text-[15px] font-semibold leading-5" numberOfLines={1}>
          {card.habit.name}
        </Text>
      </Press>
      <MenuPanel anchor={anchor} onClose={close} align="start">
        <MenuItem icon={Pencil} label={t("menu.edit")} onPress={() => (close(), push(`/habits/edit?id=${card.habit.id}`))} />
        <MenuItem icon={SkipForward} label={t("menu.skip")} onPress={() => (close(), void onSkip(card.habit, today))} />
        <MenuItem icon={Archive} label={t("menu.archive")} onPress={() => (close(), void onArchive(card.habit))} />
        <MenuItem icon={Trash2} label={t("menu.delete")} danger onPress={() => (close(), onDelete(card.habit))} />
      </MenuPanel>
    </View>
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
