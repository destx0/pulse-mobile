// The exercise rows on Habits: the glyph and name for each Health Connect exercise type in the table.
import { Activity, Bike, Dumbbell, Feather, Footprints, PersonStanding, Timer, Waves, type LucideIcon } from "lucide-react-native";
import { i18n } from "@/i18n/config";

/** The glyph a workout type gets in its name column: a racquet for badminton, a dumbbell for the gym, and so on. */
export function exerciseIcon(type: string): LucideIcon {
  if (/BADMINTON|TENNIS|SQUASH|PADEL|TABLE_TENNIS/.test(type)) return Feather;
  if (/SWIM/.test(type)) return Waves;
  if (/ELLIPTICAL/.test(type)) return Activity;
  if (/BIK|CYCL|RIDE/.test(type)) return Bike;
  if (/WALK|HIK/.test(type)) return Footprints;
  if (/RUN/.test(type)) return PersonStanding;
  if (/STRENGTH|WEIGHT|CALISTHEN|HIIT/.test(type)) return Dumbbell;
  if (/YOGA|PILATES|STRETCH/.test(type)) return PersonStanding;
  return Timer;
}

/**
 * The row's name: the app's translated names for the common kinds, else the type made readable
 * ("ELLIPTICAL" → "Elliptical"), since Health Connect's type list is longer than any translation set.
 */
export function exerciseName(type: string): string {
  if (/RUN/.test(type)) return i18n.t("ui:activityName.run");
  if (/BIK|CYCL|RIDE/.test(type)) return i18n.t("ui:activityName.ride");
  if (/WALK|HIK/.test(type)) return i18n.t("ui:activityName.walk");
  if (/STRENGTH|WEIGHT|CALISTHEN|HIIT/.test(type)) return i18n.t("strain:activities.kindStrength");
  return type.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
