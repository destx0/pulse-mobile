// Reading food-order confirmations from the SMS inbox. The permission and the native read live here; the parsing and the
// dedupe are pure (src/core/food/orders), so the tests run in Node on sample messages.
import { PermissionsAndroid, Platform } from "react-native";
import type { Store } from "@/data/store";
import { i18n } from "@/i18n/config";
import { readInbox } from "../../modules/pulse-sms";
import { recordFoodOrders } from "./foodOrderStore";

/** The one-month history the first scan reads, then the same window again: an order's follow-up texts replace its row. */
export const FOOD_SCAN_DAYS = 30;
const MAX_MESSAGES = 3000;
const READ_SMS = "android.permission.READ_SMS" as const;

export type FoodScanResult = { ok: true; messages: number; added: number } | { ok: false; error: "permission" | "unsupported" };

/**
 * Asks for READ_SMS, reads the last month and records the confirmations. Android only: on another platform the module
 * is absent and the result says so. A denied permission changes nothing and leaves the card's connect button.
 */
export async function scanFoodOrders(store: Store, timeZone: string, now: number): Promise<FoodScanResult> {
  if (Platform.OS !== "android") return { ok: false, error: "unsupported" };
  try {
    const check = await PermissionsAndroid.check(READ_SMS);
    const granted = check || (await PermissionsAndroid.request(READ_SMS, {
      title: i18n.t("habits:food.permissionTitle"),
      message: i18n.t("habits:food.permissionBody"),
      buttonPositive: i18n.t("common:actions.allow"),
    })) === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) return { ok: false, error: "permission" };
    const messages = await readInbox((now - FOOD_SCAN_DAYS * 86_400) * 1000, MAX_MESSAGES);
    return { ok: true, messages: messages.length, added: await recordFoodOrders(store, messages, timeZone) };
  } catch {
    return { ok: false, error: "permission" };
  }
}
