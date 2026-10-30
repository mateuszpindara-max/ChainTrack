import assert from "node:assert/strict";
import { test } from "node:test";
import { isChainMetricsPage, parseBikeStatuses } from "./dashboard-lifecycle.ts";

void test("bike alerts use the effective threshold and distinguish warning from critical", () => {
  const status = (bikeId: string, activeDistanceMeters: number, thresholdKm: number | null) => ({
    bikeId,
    chainId: "chain-1",
    chainName: "Road chain",
    activeDistanceMeters,
    thresholdKm,
    status: "active",
  });
  const result = parseBikeStatuses({ statuses: [status("bike-1", 225_000, null), status("bike-2", 100_000, 100)] });
  assert.deepEqual(result?.["bike-1"], { chainName: "Road chain", level: "warning", percent: 75 });
  assert.deepEqual(result["bike-2"], { chainName: "Road chain", level: "critical", percent: 100 });
  assert.equal(parseBikeStatuses({ statuses: [status("bike-1", 1, 0)] }), null);
});

void test("chain metric pages reject malformed cycles and accept paged lifecycle data", () => {
  const chain = {
    id: "chain-1",
    name: "Road",
    startingDistanceMeters: 0,
    createdAt: "2026-01-01",
    thresholdKm: null,
    stoppedAt: null,
    status: "active",
    totalDistanceMeters: 500,
    activeDistanceMeters: 500,
    completedCycleCount: 0,
    averageCompletedDistanceMeters: null,
  };
  const cycle = {
    markActivityId: "ride-1",
    bikeId: "bike-1",
    cycleStartedAt: "2026-01-01",
    cycleEndedAt: null,
    distanceMeters: 500,
    isOpen: true,
  };
  assert.equal(isChainMetricsPage({ chain, cycles: [cycle], hasMore: true }), true);
  assert.equal(isChainMetricsPage({ chain, cycles: [{ ...cycle, distanceMeters: "500" }], hasMore: false }), false);
});
