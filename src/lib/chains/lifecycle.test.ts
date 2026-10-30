import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageCompletedKm,
  effectiveThresholdKm,
  SUGGESTED_THRESHOLD_KM,
  wearLevel,
  wearPercent,
} from "./lifecycle.ts";

void test("thresholds use manual values before suggestions", () => {
  assert.equal(effectiveThresholdKm(200, 300), 200);
  assert.equal(effectiveThresholdKm(null, 300), 300);
  assert.equal(effectiveThresholdKm(null, null), null);
  assert.equal(SUGGESTED_THRESHOLD_KM, 300);
});

void test("wear levels use exact boundaries and percentages remain uncapped", () => {
  for (const [meters, level] of [
    [74_900, "normal"],
    [75_000, "warning"],
    [99_900, "warning"],
    [100_000, "critical"],
    [120_000, "critical"],
  ] as const) {
    assert.equal(wearLevel(meters, 100), level);
  }
  assert.equal(wearLevel(0, 100), "normal");
  assert.equal(wearLevel(100_000, null), "none");
  assert.equal(wearPercent(0, 100), 0);
  assert.equal(wearPercent(120_000, 100), 120);
  assert.equal(wearPercent(74_900, 100), 75);
  assert.equal(wearPercent(100_000, null), null);
});

void test("completed cycle averages are rounded to one decimal kilometer", () => {
  assert.equal(averageCompletedKm(null), null);
  assert.equal(averageCompletedKm(123_456), 123.5);
});
