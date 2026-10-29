import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDistanceKm, formatLocalActivityDate, toActivityViews } from "./activity-view.ts";

void test("activity views include the required fields in newest-first order", () => {
  const views = toActivityViews(
    [
      {
        id: "old",
        name: "Morning ride",
        distance_meters: 12_300,
        started_at: "2026-10-12T07:00:00Z",
        bike_id: "b1",
        cumulative_distance_meters: 45_600,
      },
      {
        id: "new",
        name: "Evening ride",
        distance_meters: 5_000,
        started_at: "2026-10-13T18:00:00Z",
        bike_id: "b2",
        chain_id: "chain-2",
        chain_name: "Touring chain",
        is_waxing_start: true,
        cumulative_distance_meters: 5_000,
      },
    ],
    [
      { id: "b1", name: "Road bike" },
      { id: "b2", name: "Touring bike" },
    ],
  );

  assert.deepEqual(
    views.map(({ id }) => id),
    ["new", "old"],
  );
  assert.deepEqual(views[0], {
    id: "new",
    name: "Evening ride",
    distanceMeters: 5_000,
    startedAt: "2026-10-13T18:00:00Z",
    bikeName: "Touring bike",
    chainId: "chain-2",
    chainName: "Touring chain",
    isWaxingStart: true,
    cumulativeDistanceMeters: 5_000,
  });
  assert.deepEqual(views[1], {
    id: "old",
    name: "Morning ride",
    distanceMeters: 12_300,
    startedAt: "2026-10-12T07:00:00Z",
    bikeName: "Road bike",
    chainId: null,
    chainName: null,
    isWaxingStart: false,
    cumulativeDistanceMeters: 45_600,
  });
  assert.equal(
    toActivityViews(
      [{ id: "legacy", name: "Legacy ride", distance_meters: 500, started_at: "2026-10-11T07:00:00Z", bike_id: "b1" }],
      [{ id: "b1", name: "Road bike" }],
    )[0]?.cumulativeDistanceMeters,
    null,
  );
  assert.equal(formatDistanceKm(12_300), "12.3 km");
  assert.equal(formatLocalActivityDate("2026-10-13T01:00:00Z", "en-US", "America/Los_Angeles"), "Oct 12, 2026");
});
