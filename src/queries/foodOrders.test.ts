import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { QueryCtx } from "./ctx";
import { getFoodOrders } from "./foodOrders";

const NOW = Date.parse("2026-11-05T09:00:00Z") / 1000;
const PROFILE = { birthDate: "1990-01-01", sex: "male" as const, maxHr: null, heightCm: null, timeZone: "UTC" };
let store: Store;
const ctx = (): QueryCtx => ({ store, profile: PROFILE, timeZone: "UTC", today: "2026-11-05", now: NOW, sync: { lastSyncTs: null, firstDay: null, lastError: null } });
const order = (id: string, day: string, ts: number) => ({ id, key: `key-${id}`, day, ts, merchant: id, source: "SWIGGY" });

beforeEach(() => {
  store = openMemoryStore();
});

describe("the food orders card", () => {
  it("counts today, the week from Monday, and the last seven days", async () => {
    await store.putFoodOrder(order("old", "2026-10-30", NOW - 6 * 86_400));
    await store.putFoodOrder(order("monday", "2026-11-02", NOW - 3 * 86_400));
    await store.putFoodOrder(order("tuesday", "2026-11-03", NOW - 2 * 86_400));
    await store.putFoodOrder(order("today-a", "2026-11-05", NOW - 3600));
    await store.putFoodOrder(order("today-b", "2026-11-05", NOW - 60));
    const vm = await getFoodOrders(ctx());
    expect(vm).toMatchObject({ today: 2, week: 4, last: { id: "today-b" } });
    expect(vm.days).toHaveLength(7);
    expect(vm.days.find((d) => d.day === "2026-11-05")?.count).toBe(2);
    expect(vm.days.find((d) => d.day === "2026-10-30")?.count).toBe(1);
  });
});
