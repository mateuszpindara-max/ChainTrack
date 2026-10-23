import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWaxingMarkInput, setWaxingMark, type WaxingMarkStore } from "./waxing.ts";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const activityA = "10000000-0000-4000-8000-000000000101";
const chainA = "10000000-0000-4000-8000-000000000111";
const chainB = "10000000-0000-4000-8000-000000000112";

class MemoryWaxingStore implements WaxingMarkStore {
  activities = new Map<string, { userId: string; bikeId: string | null }>();
  chains = new Map<string, string>();
  marks = new Map<string, { userId: string; chainId: string | null }>();
  writes = 0;

  readActivity(input: { userId: string; activityId: string }) {
    const activity = this.activities.get(input.activityId);
    return Promise.resolve(activity?.userId === input.userId ? { bikeId: activity.bikeId } : null);
  }

  chainExists(input: { userId: string; chainId: string }) {
    return Promise.resolve(this.chains.get(input.chainId) === input.userId);
  }

  readMark(input: { userId: string; activityId: string }) {
    const mark = this.marks.get(input.activityId);
    return Promise.resolve(mark?.userId === input.userId ? { chainId: mark.chainId } : null);
  }

  upsertMark(input: { userId: string; activityId: string; chainId: string }) {
    this.writes += 1;
    this.marks.set(input.activityId, { userId: input.userId, chainId: input.chainId });
    return Promise.resolve();
  }

  deleteMark(input: { userId: string; activityId: string }) {
    this.writes += 1;
    if (this.marks.get(input.activityId)?.userId === input.userId) this.marks.delete(input.activityId);
    return Promise.resolve();
  }
}

function createStore() {
  const store = new MemoryWaxingStore();
  store.activities.set(activityA, { userId: userA, bikeId: "bike-a" });
  store.chains.set(chainA, userA);
  store.chains.set(chainB, userA);
  store.chains.set("20000000-0000-4000-8000-000000000222", userB);
  return store;
}

void test("parses only a single chainId property containing a UUID or null", () => {
  assert.deepEqual(parseWaxingMarkInput({ chainId: chainA }), { success: true, data: { chainId: chainA } });
  assert.deepEqual(parseWaxingMarkInput({ chainId: null }), { success: true, data: { chainId: null } });
  for (const input of [
    {},
    { chainId: chainA, extra: true },
    Object.assign({ chainId: chainA }, { [Symbol("extra")]: true }),
    { chainId: undefined },
    { chainId: 123 },
    { chainId: "not-a-uuid" },
    null,
    [],
    "body",
  ]) {
    assert.deepEqual(parseWaxingMarkInput(input), { success: false });
  }
});

void test("sets and replaces a mark on an owned visible activity", async () => {
  const store = createStore();
  assert.deepEqual(await setWaxingMark(store, userA, activityA, chainA), { outcome: "saved", chainId: chainA });
  assert.deepEqual(store.marks.get(activityA), { userId: userA, chainId: chainA });
  assert.deepEqual(await setWaxingMark(store, userA, activityA, chainB), { outcome: "saved", chainId: chainB });
  assert.deepEqual(store.marks.get(activityA), { userId: userA, chainId: chainB });
  assert.equal(store.writes, 2);
});

void test("clears a mark and treats repeated set or clear requests as no-op successes", async () => {
  const store = createStore();
  store.marks.set(activityA, { userId: userA, chainId: chainA });

  assert.deepEqual(await setWaxingMark(store, userA, activityA, chainA), { outcome: "saved", chainId: chainA });
  assert.equal(store.writes, 0);
  assert.deepEqual(await setWaxingMark(store, userA, activityA, null), { outcome: "saved", chainId: null });
  assert.equal(store.marks.has(activityA), false);
  assert.equal(store.writes, 1);
  assert.deepEqual(await setWaxingMark(store, userA, activityA, null), { outcome: "saved", chainId: null });
  assert.equal(store.writes, 1);
});

void test("clears a retained mark whose chain was deleted", async () => {
  const store = createStore();
  store.marks.set(activityA, { userId: userA, chainId: null });

  assert.deepEqual(await setWaxingMark(store, userA, activityA, null), { outcome: "saved", chainId: null });
  assert.equal(store.marks.has(activityA), false);
  assert.equal(store.writes, 1);
});

void test("treats hidden and foreign activities as not found", async () => {
  const store = createStore();
  store.activities.set("hidden-activity", { userId: userA, bikeId: null });
  store.activities.set("foreign-activity", { userId: userB, bikeId: "bike-b" });

  assert.deepEqual(await setWaxingMark(store, userA, "hidden-activity", chainA), { outcome: "activity-not-found" });
  assert.deepEqual(await setWaxingMark(store, userA, "foreign-activity", chainA), { outcome: "activity-not-found" });
});

void test("treats a foreign chain as not found", async () => {
  const store = createStore();
  assert.deepEqual(await setWaxingMark(store, userA, activityA, "20000000-0000-4000-8000-000000000222"), {
    outcome: "chain-not-found",
  });
  assert.deepEqual(await setWaxingMark(store, userA, activityA, "30000000-0000-4000-8000-000000000333"), {
    outcome: "chain-not-found",
  });
  assert.equal(store.writes, 0);
});
