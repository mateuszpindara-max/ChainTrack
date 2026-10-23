import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivityRow, BikeRow } from "./activity-view.ts";
import {
  DASHBOARD_PAGE_SIZE,
  MAX_DASHBOARD_PAGE_SIZE,
  getActivityPage,
  getBikePage,
  parseActivityBikeFilter,
  parseActivityChainFilter,
  parseActivityLimit,
  parseDashboardOffset,
  type DashboardActivityStore,
  type DashboardBikeStore,
} from "./dashboard-query.ts";

const bikeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bikeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

class MemoryDashboardStore implements DashboardActivityStore, DashboardBikeStore {
  bikes: (BikeRow & { userId: string })[] = [];
  activities: (ActivityRow & { userId: string })[] = [];

  readActivities(input: {
    userId: string;
    bikeId: string | null;
    chainId: string | null;
    offset: number;
    limit: number;
  }) {
    return Promise.resolve(
      this.activities
        .filter(
          (activity) =>
            activity.userId === input.userId &&
            (input.bikeId === null || activity.bike_id === input.bikeId) &&
            (input.chainId === null ||
              (input.chainId === "none"
                ? activity.chain_id === null || activity.chain_id === undefined
                : activity.chain_id === input.chainId)),
        )
        .sort((first, second) => second.started_at.localeCompare(first.started_at) || second.id.localeCompare(first.id))
        .slice(input.offset, input.offset + input.limit),
    );
  }

  readBikes(input: { userId: string; ids?: string[]; offset?: number; limit?: number }) {
    const rows = this.bikes
      .filter((bike) => bike.userId === input.userId && (!input.ids || input.ids.includes(bike.id)))
      .sort((first, second) => first.name.localeCompare(second.name) || first.id.localeCompare(second.id));
    const page = input.offset === undefined ? rows : rows.slice(input.offset, input.offset + (input.limit ?? 0));
    return Promise.resolve(page.map(({ id, name }) => ({ id, name })));
  }
}

void test("parses bounded offsets and optional UUID bike filters", () => {
  assert.deepEqual(parseDashboardOffset(new URLSearchParams()), { success: true, value: 0 });
  assert.deepEqual(parseDashboardOffset(new URLSearchParams("offset=1000000")), { success: true, value: 1_000_000 });
  for (const value of ["", "-1", "1.5", "1000001", "9007199254740992"]) {
    assert.deepEqual(parseDashboardOffset(new URLSearchParams(`offset=${value}`)), { success: false });
  }
  assert.deepEqual(parseActivityBikeFilter(new URLSearchParams()), { success: true, bikeId: null });
  assert.deepEqual(parseActivityBikeFilter(new URLSearchParams(`bikeId=${bikeA}`)), { success: true, bikeId: bikeA });
  assert.deepEqual(parseActivityBikeFilter(new URLSearchParams("bikeId=not-a-uuid")), { success: false });
  assert.deepEqual(parseActivityChainFilter(new URLSearchParams(`chainId=${bikeB}`), bikeA), {
    success: true,
    chainId: bikeB,
  });
  assert.deepEqual(parseActivityChainFilter(new URLSearchParams("chainId=none"), bikeA), {
    success: true,
    chainId: "none",
  });
  assert.deepEqual(parseActivityChainFilter(new URLSearchParams(`chainId=${bikeB}`), null), { success: false });
  assert.deepEqual(parseActivityChainFilter(new URLSearchParams("chainId=invalid"), bikeA), { success: false });
});

void test("parses activity limits with a default, positive bounds, and a fixed cap", () => {
  assert.deepEqual(parseActivityLimit(new URLSearchParams()), { success: true, limit: DASHBOARD_PAGE_SIZE });
  assert.deepEqual(parseActivityLimit(new URLSearchParams("limit=1")), { success: true, limit: 1 });
  assert.deepEqual(parseActivityLimit(new URLSearchParams(`limit=${MAX_DASHBOARD_PAGE_SIZE}`)), {
    success: true,
    limit: MAX_DASHBOARD_PAGE_SIZE,
  });
  for (const value of ["", "0", "501", "1.5", "1e2", "-1"]) {
    assert.deepEqual(parseActivityLimit(new URLSearchParams(`limit=${value}`)), { success: false });
  }
});

void test("activity pages are owner-scoped, optionally bike-filtered, and offset-paginated", async () => {
  const store = new MemoryDashboardStore();
  store.bikes = [
    { id: bikeA, name: "Road", userId: "user-a" },
    { id: bikeB, name: "Touring", userId: "user-a" },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Other", userId: "user-b" },
  ];
  store.activities = Array.from({ length: DASHBOARD_PAGE_SIZE + 2 }, (_, index) => ({
    id: `activity-${String(index).padStart(3, "0")}`,
    name: `Ride ${index}`,
    distance_meters: index * 100,
    started_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    bike_id: index % 2 === 0 ? bikeA : bikeB,
    userId: "user-a",
  }));
  store.activities.push({
    id: "foreign-activity",
    name: "Foreign ride",
    distance_meters: 50,
    started_at: "2026-12-31T00:00:00.000Z",
    bike_id: bikeA,
    userId: "user-b",
  });

  const firstPage = await getActivityPage(store, "user-a", {
    offset: 0,
    bikeId: null,
    chainId: null,
    limit: DASHBOARD_PAGE_SIZE,
  });
  const nextPage = await getActivityPage(store, "user-a", {
    offset: DASHBOARD_PAGE_SIZE,
    bikeId: null,
    chainId: null,
    limit: DASHBOARD_PAGE_SIZE,
  });
  const selectedPage = await getActivityPage(store, "user-a", {
    offset: 0,
    bikeId: bikeA,
    chainId: null,
    limit: DASHBOARD_PAGE_SIZE,
  });
  const unownedPage = await getActivityPage(store, "user-a", {
    offset: 0,
    bikeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    chainId: null,
    limit: DASHBOARD_PAGE_SIZE,
  });

  assert.equal(firstPage.activities.length, DASHBOARD_PAGE_SIZE);
  assert.equal(firstPage.hasMore, true);
  assert.equal(nextPage.activities.length, 2);
  assert.equal(nextPage.hasMore, false);
  assert.equal(firstPage.activities[0]?.id, `activity-${String(DASHBOARD_PAGE_SIZE + 1).padStart(3, "0")}`);
  assert.ok(selectedPage.activities.every((activity) => activity.bikeName === "Road"));
  assert.deepEqual(unownedPage, { activities: [], hasMore: false });
});

void test("activity pages filter by chain before paging and honor a custom limit", async () => {
  const store = new MemoryDashboardStore();
  store.bikes = [{ id: bikeA, name: "Road", userId: "user-a" }];
  store.activities = [1, 2, 3, 4].map((number) => ({
    id: `activity-${number}`,
    name: `Ride ${number}`,
    distance_meters: number * 100,
    started_at: new Date(Date.UTC(2026, 0, 1, 0, number)).toISOString(),
    bike_id: bikeA,
    chain_id: number === 1 ? null : number < 4 ? bikeB : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    chain_name: number === 1 ? null : number < 4 ? "Chain B" : "Other chain",
    is_waxing_start: false,
    userId: "user-a",
  }));

  const page = await getActivityPage(store, "user-a", { offset: 0, bikeId: bikeA, chainId: bikeB, limit: 1 });
  assert.deepEqual(
    page.activities.map((activity) => activity.id),
    ["activity-3"],
  );
  assert.equal(page.activities[0]?.chainName, "Chain B");
  assert.equal(page.hasMore, true);
});

void test("bike pages are owner-scoped, sorted, and report continuation", async () => {
  const store = new MemoryDashboardStore();
  store.bikes = Array.from({ length: DASHBOARD_PAGE_SIZE + 1 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Bike ${String(DASHBOARD_PAGE_SIZE - index).padStart(3, "0")}`,
    userId: "user-a",
  }));
  store.bikes.push({ id: bikeA, name: "A foreign bike", userId: "user-b" });

  const firstPage = await getBikePage(store, "user-a", 0);
  const nextPage = await getBikePage(store, "user-a", DASHBOARD_PAGE_SIZE);

  assert.equal(firstPage.bikes.length, DASHBOARD_PAGE_SIZE);
  assert.equal(firstPage.hasMore, true);
  assert.equal(nextPage.bikes.length, 1);
  assert.equal(nextPage.hasMore, false);
  assert.deepEqual(
    firstPage.bikes.slice(0, 2).map((bike) => bike.name),
    ["Bike 000", "Bike 001"],
  );
});
