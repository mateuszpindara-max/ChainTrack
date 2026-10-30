import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivityView } from "./activity-view.ts";
import {
  createDashboardState,
  dashboardStateReducer,
  getDashboardRequestKey,
  getDashboardViewState,
} from "./dashboard-state.ts";

const firstActivity: ActivityView = {
  id: "activity-1",
  name: "Morning ride",
  distanceMeters: 12_500,
  startedAt: "2026-06-01T08:00:00.000Z",
  bikeName: "Road bike",
  chainId: null,
  chainName: null,
  isWaxingStart: false,
};

void test("dashboard starts on the summary and transitions between All bikes and a selected bike", () => {
  const summary = createDashboardState();
  assert.equal(getDashboardViewState(summary), "summary");

  const allBikes = dashboardStateReducer(summary, { type: "select-all-bikes" });
  assert.deepEqual(allBikes.selection, { kind: "activities", bikeId: null, chainId: null });
  assert.equal(getDashboardViewState(allBikes), "loading");

  const selectedBike = dashboardStateReducer(allBikes, { type: "select-bike", bikeId: "bike-1" });
  assert.deepEqual(selectedBike.selection, { kind: "activities", bikeId: "bike-1", chainId: null });
  assert.deepEqual(selectedBike.activities, []);
  assert.equal(getDashboardRequestKey(selectedBike).selection, "activities:bike-1:chain:any");
});

void test("chain filters require a bike, reset on bike changes, and distinguish request keys", () => {
  const allBikes = dashboardStateReducer(createDashboardState(), { type: "select-all-bikes" });
  const ignoredFilter = dashboardStateReducer(allBikes, { type: "select-chain-filter", filter: "none" });
  assert.equal(ignoredFilter, allBikes);

  let state = dashboardStateReducer(allBikes, { type: "select-bike", bikeId: "bike-1" });
  const anyChainKey = getDashboardRequestKey(state).selection;
  state = dashboardStateReducer(state, { type: "select-chain-filter", filter: "none" });
  const noChainKey = getDashboardRequestKey(state).selection;
  assert.deepEqual(state.selection, { kind: "activities", bikeId: "bike-1", chainId: "none" });
  assert.notEqual(noChainKey, anyChainKey);

  state = dashboardStateReducer(state, { type: "select-chain-filter", filter: "chain-1" });
  const specificChainKey = getDashboardRequestKey(state).selection;
  assert.notEqual(specificChainKey, noChainKey);

  state = dashboardStateReducer(state, { type: "select-bike", bikeId: "bike-2" });
  assert.deepEqual(state.selection, { kind: "activities", bikeId: "bike-2", chainId: null });
  assert.notEqual(getDashboardRequestKey(state).selection, anyChainKey);
});

void test("chain and management selections have distinct keys and are cleared by bike or summary selection", () => {
  let state = dashboardStateReducer(createDashboardState(), { type: "select-chain", chainId: "chain-1" });
  assert.equal(getDashboardRequestKey(state).selection, "chain:chain-1");
  state = dashboardStateReducer(state, { type: "select-bike", bikeId: "bike-1" });
  assert.deepEqual(state.selection, { kind: "activities", bikeId: "bike-1", chainId: null });
  state = dashboardStateReducer(state, { type: "select-manage-chains" });
  assert.equal(getDashboardRequestKey(state).selection, "manage-chains");
  state = dashboardStateReducer(state, { type: "select-summary" });
  assert.deepEqual(state.selection, { kind: "summary" });
});

void test("a selected bike with a loaded empty page has an empty state", () => {
  let state = dashboardStateReducer(createDashboardState(), { type: "select-bike", bikeId: "bike-empty" });
  state = dashboardStateReducer(state, {
    type: "activities-loaded",
    key: getDashboardRequestKey(state),
    activities: [],
    hasMore: false,
  });

  assert.equal(getDashboardViewState(state), "empty");
});

void test("saved import and synchronization changes refresh the selected activity view", () => {
  let state = dashboardStateReducer(createDashboardState(), { type: "select-bike", bikeId: "bike-1" });
  const key = getDashboardRequestKey(state);
  state = dashboardStateReducer(state, {
    type: "activities-loaded",
    key,
    activities: [firstActivity],
    hasMore: true,
  });

  state = dashboardStateReducer(state, {
    type: "refresh-after-save",
    result: { outcome: "partial", inserted: 1, updated: 0 },
  });
  assert.equal(state.refreshGeneration, 1);
  assert.deepEqual(state.activities, []);
  assert.equal(getDashboardViewState(state), "loading");

  state = dashboardStateReducer(state, {
    type: "refresh-after-save",
    result: { outcome: "complete", inserted: 0, updated: 0, removed: 1 },
  });
  assert.equal(state.refreshGeneration, 2);
});

void test("failed import responses refresh when the server reports saved changes", () => {
  const state = dashboardStateReducer(createDashboardState(), {
    type: "refresh-after-save",
    result: { outcome: "failed", inserted: 0, updated: 0, savedChanges: true },
  });

  assert.equal(state.refreshGeneration, 1);
});

void test("chain mutations and saved partial failures invalidate old lifecycle request keys", () => {
  let state = dashboardStateReducer(createDashboardState(), { type: "select-chain", chainId: "chain-1" });
  const originalKey = getDashboardRequestKey(state);
  for (const result of [
    { outcome: "complete" as const, inserted: 0, updated: 0 },
    { outcome: "partial" as const, inserted: 1, updated: 0 },
    { outcome: "failed" as const, inserted: 0, updated: 0, savedChanges: true },
  ]) {
    const previousKey = getDashboardRequestKey(state);
    state = dashboardStateReducer(state, { type: "refresh-after-save", result });
    assert.notDeepEqual(getDashboardRequestKey(state), previousKey);
    assert.deepEqual(state.selection, { kind: "chain", chainId: "chain-1" });
  }
  assert.equal(state.refreshGeneration, 3);
  assert.notDeepEqual(getDashboardRequestKey(state), originalKey);
  const stale = dashboardStateReducer(state, {
    type: "activities-loaded",
    key: originalKey,
    activities: [firstActivity],
    hasMore: false,
  });
  assert.equal(stale, state);
});

void test("unchanged failed operations do not refresh and stale activity responses are discarded", () => {
  const selectedBike = dashboardStateReducer(createDashboardState(), { type: "select-bike", bikeId: "bike-1" });
  const staleKey = getDashboardRequestKey(selectedBike);
  const differentSelection = dashboardStateReducer(selectedBike, { type: "select-all-bikes" });
  const unchanged = dashboardStateReducer(differentSelection, {
    type: "refresh-after-save",
    result: { outcome: "failed", inserted: 0, updated: 0 },
  });
  const afterStaleResponse = dashboardStateReducer(unchanged, {
    type: "activities-loaded",
    key: staleKey,
    activities: [firstActivity],
    hasMore: false,
  });

  assert.equal(unchanged.refreshGeneration, 0);
  assert.equal(afterStaleResponse, unchanged);
  assert.deepEqual(afterStaleResponse.activities, []);
});

void test("responses for an old chain filter are discarded", () => {
  let state = dashboardStateReducer(createDashboardState(), { type: "select-bike", bikeId: "bike-1" });
  state = dashboardStateReducer(state, { type: "select-chain-filter", filter: "chain-1" });
  const staleKey = getDashboardRequestKey(state);
  state = dashboardStateReducer(state, { type: "select-chain-filter", filter: "chain-2" });
  const currentState = state;

  state = dashboardStateReducer(state, {
    type: "activities-loaded",
    key: staleKey,
    activities: [firstActivity],
    hasMore: false,
  });

  assert.equal(state, currentState);
  assert.deepEqual(state.activities, []);
});
