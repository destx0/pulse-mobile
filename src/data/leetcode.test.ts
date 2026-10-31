// LeetCode snapshots are stored per username: two connected profiles never overwrite each other, and disconnect
// removes only that user's data.
import { describe, expect, it } from "vitest";
import type { LeetCodeSnapshot } from "@/leetcode/types";
import { MemoryStore } from "./memory";

const snapshot = (username: string): LeetCodeSnapshot => ({
  username,
  fetchedAt: 1,
  profile: { name: null, avatarUrl: null, ranking: null },
  solved: { total: 1, easy: 1, medium: 0, hard: 0 },
  streak: 1,
  activeDays: 1,
  calendar: {},
  recent: [],
});

describe("Store LeetCode snapshots", () => {
  it("keeps each username's snapshot separate", async () => {
    const store = new MemoryStore();
    await store.putLeetCode(snapshot("alice"));
    await store.putLeetCode(snapshot("bob"));
    expect((await store.getLeetCode("alice"))?.username).toBe("alice");
    expect((await store.getLeetCode("bob"))?.username).toBe("bob");
    expect(await store.getLeetCode("carol")).toBeNull();
  });

  it("disconnecting one username leaves the other's data", async () => {
    const store = new MemoryStore();
    await store.putLeetCode(snapshot("alice"));
    await store.putLeetCode(snapshot("bob"));
    await store.deleteLeetCode("alice");
    expect(await store.getLeetCode("alice")).toBeNull();
    expect((await store.getLeetCode("bob"))?.username).toBe("bob");
  });

  it("Delete everything clears every LeetCode snapshot", async () => {
    const store = new MemoryStore();
    await store.putLeetCode(snapshot("alice"));
    await store.putLeetCode(snapshot("bob"));
    await store.clearLeetCode();
    expect(await store.getLeetCode("alice")).toBeNull();
    expect(await store.getLeetCode("bob")).toBeNull();
  });

  it("switching the health source does not disconnect LeetCode", async () => {
    const store = new MemoryStore();
    await store.putLeetCode(snapshot("alice"));
    await store.clearAll();
    expect((await store.getLeetCode("alice"))?.username).toBe("alice");
  });
});
