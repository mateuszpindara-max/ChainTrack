import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChainInput, toChainView } from "./chain.ts";

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
