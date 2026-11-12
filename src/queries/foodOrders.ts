// The food-order card's read: this week's count from the SMS confirmations, today's, and the last order.
import type { FoodOrder } from "@/core/food/orders";
import { addDays } from "@/lib/time";
import type { QueryCtx } from "./ctx";

export type FoodOrdersVM = {
  /** Orders in the last 30 days, newest first. */
  orders: FoodOrder[];
  today: number;
  /** Orders this week, Monday to Sunday. */
  week: number;
  last: FoodOrder | null;
};

export async function getFoodOrders(ctx: QueryCtx): Promise<FoodOrdersVM> {
  const from = addDays(ctx.today, -29);
  const orders = await ctx.store.foodOrders(from, ctx.today);
  const byDay = new Map<string, number>();
  for (const order of orders) byDay.set(order.day, (byDay.get(order.day) ?? 0) + 1);
  const dow = new Date(`${ctx.today}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(ctx.today, -((dow + 6) % 7));
  return {
    orders,
    today: byDay.get(ctx.today) ?? 0,
    week: orders.filter((o) => o.day >= weekStart).length,
    last: orders[0] ?? null,
  };
}
