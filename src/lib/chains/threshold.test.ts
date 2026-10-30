import assert from "node:assert/strict";
import { test } from "node:test";
import { thresholdSchema } from "./threshold.ts";

void test("threshold accepts null or positive kilometers with at most one decimal", () => {
  for (const thresholdKm of [null, 0.1, 123.4, 100_000]) {
    assert.equal(thresholdSchema.safeParse({ thresholdKm }).success, true);
  }
  for (const thresholdKm of [0, -0.1, 100_000.1, 1.01, "12", NaN, Infinity, undefined]) {
    assert.equal(thresholdSchema.safeParse({ thresholdKm }).success, false);
  }
});
