import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { isLifecycleChainView, parseChainInput, toChainView, toLifecycleChainView } from "./chain.ts";

function parseValid(input: unknown) {
  const result = parseChainInput(input);
  assert.equal(result.success, true);
  return result.data;
}

function assertInvalid(input: unknown, field: "name" | "startingKm") {
  const result = parseChainInput(input);
  assert.equal(result.success, false);
  assert.equal(typeof result.fieldErrors[field], "string");
}

void test("chain names are trimmed and accept the inclusive length boundaries", () => {
  assert.equal(parseValid({ name: "  Road chain  " }).name, "Road chain");
  assert.equal(parseValid({ name: "x" }).name, "x");
  assert.equal(parseValid({ name: "x".repeat(60) }).name.length, 60);
  assertInvalid({ name: "   " }, "name");
  assertInvalid({ name: "x".repeat(61) }, "name");
});

void test("starting kilometers default to zero and convert to whole meters", () => {
  assert.equal(parseValid({ name: "Chain" }).startingDistanceMeters, 0);
  assert.equal(parseValid({ name: "Chain", startingKm: null }).startingDistanceMeters, 0);
  assert.equal(parseValid({ name: "Chain", startingKm: "   " }).startingDistanceMeters, 0);
  assert.equal(parseValid({ name: "Chain", startingKm: "12.3" }).startingDistanceMeters, 12_300);
  assert.equal(parseValid({ name: "Chain", startingKm: 12.3 }).startingDistanceMeters, 12_300);
  assert.equal(parseValid({ name: "Chain", startingKm: 100_000 }).startingDistanceMeters, 100_000_000);
  assert.equal(parseValid({ name: "Chain", startingKm: 0 }).startingDistanceMeters, 0);
});

void test("starting kilometers reject unsupported precision and invalid boundaries", () => {
  for (const startingKm of ["12.34", -1, 100_000.1, "abc", Number.NaN]) {
    assertInvalid({ name: "Chain", startingKm }, "startingKm");
  }
});

void test("chain rows map to the public view shape", () => {
  assert.deepEqual(
    toChainView({
      id: "chain-1",
      name: "Road chain",
      starting_distance_meters: 12_300,
      created_at: "2026-10-22T12:00:00Z",
    }),
    {
      id: "chain-1",
      name: "Road chain",
      startingDistanceMeters: 12_300,
      createdAt: "2026-10-22T12:00:00Z",
    },
  );
});

void test("lifecycle mapping adds metrics without changing the base DTO", () => {
  const row = {
    id: "chain-1",
    name: "Road",
    starting_distance_meters: 100,
    created_at: "2026-10-30",
    threshold_km: null,
    stopped_at: null,
    status: "active" as const,
    total_distance_meters: 1200,
    active_distance_meters: 1100,
    completed_cycle_count: 2,
    average_completed_distance_meters: 550,
  };
  const view = toLifecycleChainView(row);
  assert.deepEqual(view, {
    id: "chain-1",
    name: "Road",
    startingDistanceMeters: 100,
    createdAt: "2026-10-30",
    thresholdKm: null,
    stoppedAt: null,
    status: "active",
    totalDistanceMeters: 1200,
    activeDistanceMeters: 1100,
    completedCycleCount: 2,
    averageCompletedDistanceMeters: 550,
  });
  assert.equal(isLifecycleChainView(view), true);
  assert.equal(isLifecycleChainView(toChainView(row)), false);
  assert.deepEqual(Object.keys(toChainView(row)).sort(), ["createdAt", "id", "name", "startingDistanceMeters"]);
});

void test("dashboard starts from metric rows while CRUD routes return base chain views", () => {
  const dashboard = readFileSync(new URL("../../pages/dashboard.astro", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../pages/api/chains/index.ts", import.meta.url), "utf8");
  const item = readFileSync(new URL("../../pages/api/chains/[id].ts", import.meta.url), "utf8");
  assert.match(dashboard, /\.from\("chain_metrics"\)/);
  assert.match(dashboard, /\.map\(toLifecycleChainView\)/);
  assert.match(index, /chain: toChainView\(data\)/);
  assert.match(item, /chain: toChainView\(data\)/);
});
