// The food orders' writes, without React Native: the parser batch is recorded here so the Node tests can use the store.
import { ordersFromMessages, type FoodOrder, type SmsMessage } from "@/core/food/orders";
import type { Store } from "@/data/store";

/** Writes the distinct orders in a batch; returns how many were new. A follow-up text with the same key replaces nothing. */
export async function recordFoodOrders(store: Store, messages: readonly SmsMessage[], timeZone: string): Promise<number> {
  const orders = ordersFromMessages(messages, timeZone);
  if (!orders.length) return 0;
  const known = new Set((await store.foodOrders()).map((o) => o.key));
  let added = 0;
  for (const order of orders) {
    if (known.has(order.key)) continue;
    await store.putFoodOrder(order);
    known.add(order.key);
    added++;
  }
  return added;
}

export async function deleteFoodOrder(store: Store, order: FoodOrder): Promise<void> {
  await store.deleteFoodOrder(order.id);
}
