import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { SmsMessage } from "@/core/food/orders";
import { recordFoodOrders } from "./foodOrderStore";

const NOW = Date.parse("2026-11-02T13:30:00Z");
const sms = (id: string, body: string, date = NOW): SmsMessage => ({ id, address: "SWIGGY", body, date });
let store: Store;

beforeEach(() => {
  store = openMemoryStore();
});

describe("recording food orders", () => {
  it("writes the distinct orders and ignores the follow-up text", async () => {
    const placed = sms("1", "Your order from Biryani Blues has been placed. Order ID: 123456");
    const confirmed = sms("2", "Your order from Biryani Blues has been confirmed. Order ID: 123456", NOW + 60_000);
    expect(await recordFoodOrders(store, [placed, confirmed], "UTC")).toBe(1);
    expect((await store.foodOrders())[0]).toMatchObject({ merchant: "Biryani Blues", day: "2026-11-02" });
    expect(await recordFoodOrders(store, [placed, confirmed], "UTC")).toBe(0);
  });

  it("keeps two orders from the same restaurant apart when the ids differ", async () => {
    expect(
      await recordFoodOrders(
        store,
        [
          sms("1", "Your order from Faasos has been placed. Order ID: 11111"),
          sms("2", "Your order from Faasos has been placed. Order ID: 22222", NOW + 7_200_000),
        ],
        "UTC",
      ),
    ).toBe(2);
    expect(await store.foodOrders()).toHaveLength(2);
  });

  it("drops a false detection", async () => {
    await recordFoodOrders(store, [sms("1", "Your order from Faasos has been placed. Order ID: 11111")], "UTC");
    const order = (await store.foodOrders())[0];
    await store.deleteFoodOrder(order.id);
    expect(await store.foodOrders()).toEqual([]);
  });
});
