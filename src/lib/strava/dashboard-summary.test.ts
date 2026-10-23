import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASHBOARD_SUMMARY_PAGE_SIZE,
  getLocalYearInterval,
  parseDashboardSummaryInterval,
  summarizeDashboardActivities,
  type DashboardSummaryActivity,
  type DashboardSummaryStore,
} from "./dashboard-summary.ts";

class MemorySummaryStore implements DashboardSummaryStore {
  activities: (DashboardSummaryActivity & { userId: string })[] = [];
  offsets: number[] = [];

  readActivities(input: { userId: string; start: string; end: string; offset: number; limit: number }) {
    this.offsets.push(input.offset);
    return Promise.resolve(
      this.activities
        .filter(
          (activity) =>
            activity.userId === input.userId &&
            Date.parse(activity.started_at) >= Date.parse(input.start) &&
            Date.parse(activity.started_at) < Date.parse(input.end),
        )
        .sort((first, second) => first.started_at.localeCompare(second.started_at) || first.id.localeCompare(second.id))
        .slice(input.offset, input.offset + input.limit),
    );
  }
}

void test("summary counts distinct linked bikes and sums distance across paginated year activities", async () => {
  const store = new MemorySummaryStore();
  store.activities = Array.from({ length: DASHBOARD_SUMMARY_PAGE_SIZE + 2 }, (_, index) => ({
    id: `activity-${String(index).padStart(4, "0")}`,
    bike_id: index === 1 ? null : index % 2 === 0 ? "bike-a" : "bike-b",
    distance_meters: 100 + index,
    started_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    userId: "user-a",
  }));
  store.activities.push(
    {
      id: "before-year",
      bike_id: "bike-outside",
      distance_meters: 10_000,
      started_at: "2025-12-31T23:59:59.999Z",
      userId: "user-a",
    },
    {
      id: "at-end",
      bike_id: "bike-outside",
      distance_meters: 20_000,
      started_at: "2027-01-01T00:00:00.000Z",
      userId: "user-a",
    },
    {
      id: "foreign",
      bike_id: "foreign-bike",
      distance_meters: 30_000,
      started_at: "2026-06-01T00:00:00.000Z",
      userId: "user-b",
    },
  );

  const summary = await summarizeDashboardActivities(store, "user-a", {
    start: "2026-01-01T00:00:00.000Z",
    end: "2027-01-01T00:00:00.000Z",
  });

  assert.deepEqual(store.offsets, [0, DASHBOARD_SUMMARY_PAGE_SIZE]);
  assert.equal(summary.bikesRidden, 2);
  assert.equal(
    summary.distanceMeters,
    Array.from({ length: DASHBOARD_SUMMARY_PAGE_SIZE + 2 }, (_, index) => 100 + index)
      .filter((_, index) => index !== 1)
      .reduce((total, distance) => total + distance, 0),
  );
});

void test("summary returns zero totals when there are no activities", async () => {
  const summary = await summarizeDashboardActivities(new MemorySummaryStore(), "user-a", {
    start: "2026-01-01T00:00:00.000Z",
    end: "2027-01-01T00:00:00.000Z",
  });
  assert.deepEqual(summary, { bikesRidden: 0, distanceMeters: 0 });
});

void test("summary interval validation requires ordered parseable ISO timestamps within 367 days", () => {
  assert.deepEqual(parseDashboardSummaryInterval("2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"), {
    start: "2026-01-01T00:00:00.000Z",
    end: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(parseDashboardSummaryInterval("2026-02-30T00:00:00Z", "2027-01-01T00:00:00Z"), null);
  assert.equal(parseDashboardSummaryInterval("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"), null);
  assert.notEqual(parseDashboardSummaryInterval("2026-01-01T00:00:00Z", "2027-01-03T00:00:00Z"), null);
  assert.equal(parseDashboardSummaryInterval("2026-01-01T00:00:00Z", "2027-01-04T00:00:00Z"), null);
  assert.equal(parseDashboardSummaryInterval("2026-01-01", "2026-02-01T00:00:00Z"), null);
});

void test("local-year interval uses local midnight at both year boundaries", () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.deepEqual(getLocalYearInterval(new Date("2026-06-15T12:00:00.000Z")), {
      start: "2026-01-01T08:00:00.000Z",
      end: "2027-01-01T08:00:00.000Z",
    });
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});
