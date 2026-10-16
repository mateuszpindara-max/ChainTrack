import assert from "node:assert/strict";
import { test } from "node:test";
import {
  importStravaHistory,
  syncRepairStravaActivities,
  syncNewStravaActivities,
  STRAVA_ACTIVITY_PAGE_SIZE,
  STRAVA_ACTIVITY_PAGES_PER_SYNC,
  type NewActivityInsert,
  type NewActivitySyncRun,
  type NewActivitySyncStore,
  type RepairActivitySyncRun,
  type RepairActivitySyncStore,
  type RepairActivityUpsert,
  type ImportResult,
  type ImportedActivity,
  type ImportStore,
  type StravaBike,
} from "./import.ts";
import { toActivityViews } from "./activity-view.ts";

class MemoryImportStore implements ImportStore {
  bikes = new Map<string, StravaBike>();
  activities = new Map<number, ImportedActivity>();

  upsertBikes(bikes: StravaBike[]) {
    for (const bike of bikes) this.bikes.set(bike.id, bike);
    return Promise.resolve();
  }

  upsertActivities(activities: ImportedActivity[]) {
    let inserted = 0;
    let updated = 0;
    for (const activity of activities) {
      if (this.activities.has(activity.stravaActivityId)) updated += 1;
      else inserted += 1;
      this.activities.set(activity.stravaActivityId, activity);
    }
    return Promise.resolve({ inserted, updated });
  }
}

class MemoryNewActivitySyncStore implements NewActivitySyncStore {
  bikes = new Map<string, StravaBike>();
  activities = new Map<number, ImportedActivity & { bikeId: string }>();
  run: NewActivitySyncRun;

  constructor(runId = "sync-1") {
    this.run = { id: runId, status: "running", nextPage: 1, insertedCount: 0, skippedCount: 0 };
  }

  upsertBikes(bikes: StravaBike[]) {
    for (const bike of bikes) this.bikes.set(bike.id, bike);
    return Promise.resolve();
  }

  getExistingActivityIds(activityIds: number[]) {
    return Promise.resolve(new Set(activityIds.filter((activityId) => this.activities.has(activityId))));
  }

  getBikeIds(gearIds: string[]) {
    return Promise.resolve(
      new Map(gearIds.filter((gearId) => this.bikes.has(gearId)).map((gearId) => [gearId, `bike-row-${gearId}`])),
    );
  }

  insertActivitiesOnly(activities: NewActivityInsert[]) {
    let inserted = 0;
    for (const activity of activities) {
      if (this.activities.has(activity.stravaActivityId)) continue;
      this.activities.set(activity.stravaActivityId, {
        stravaActivityId: activity.stravaActivityId,
        name: activity.name,
        distanceMeters: activity.distanceMeters,
        startedAt: activity.startedAt,
        gearId: "bike-1",
        bikeId: activity.bikeId,
      });
      inserted += 1;
    }
    return Promise.resolve(inserted);
  }

  advanceRun(input: {
    runId: string;
    expectedPage: number;
    nextPage: number;
    insertedDelta: number;
    skippedDelta: number;
    status: "running" | "partial" | "completed";
  }) {
    if (this.run.id !== input.runId || this.run.nextPage !== input.expectedPage) return Promise.resolve(null);
    this.run = {
      ...this.run,
      status: input.status,
      nextPage: input.nextPage,
      insertedCount: this.run.insertedCount + input.insertedDelta,
      skippedCount: this.run.skippedCount + input.skippedDelta,
    };
    return Promise.resolve(this.run);
  }
}

interface StoredRepairActivity extends RepairActivityUpsert {
  id: string;
  userId: string;
  createdAt: string;
}

class MemoryRepairActivitySyncStore implements RepairActivitySyncStore {
  bikes = new Map<string, { id: string; name: string }>();
  activities = new Map<number, StoredRepairActivity>();
  stagedActivityIds = new Set<number>();
  stagedActivityHistory = new Set<number>();
  verifiedMissingActivityIds = new Set<number>();
  dependentActivityIds = new Set<number>();
  run: RepairActivitySyncRun;

  constructor(runId = "repair-1") {
    this.run = {
      id: runId,
      status: "running",
      nextPage: 1,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      removedCount: 0,
      scanComplete: false,
      verificationStep: 0,
    };
  }

  upsertBikes(bikes: StravaBike[]) {
    for (const bike of bikes) this.bikes.set(bike.id, { id: `bike-row-${bike.id}`, name: bike.name });
    return Promise.resolve();
  }

  getBikeIds(gearIds: string[]) {
    const bikeIds = new Map<string, string>();
    for (const gearId of gearIds) {
      const bike = this.bikes.get(gearId);
      if (bike) bikeIds.set(gearId, bike.id);
    }
    return Promise.resolve(bikeIds);
  }

  upsertActivities(activities: RepairActivityUpsert[]) {
    let inserted = 0;
    let updated = 0;
    for (const activity of activities) {
      const existing = this.activities.get(activity.stravaActivityId);
      if (existing) {
        updated += 1;
        this.activities.set(activity.stravaActivityId, { ...existing, ...activity });
      } else {
        inserted += 1;
        this.activities.set(activity.stravaActivityId, {
          ...activity,
          id: `activity-row-${activity.stravaActivityId}`,
          userId: "user-a",
          createdAt: "2020-01-01T00:00:00.000Z",
        });
      }
    }
    return Promise.resolve({ inserted, updated });
  }

  stageActivityIds(_runId: string, activityIds: number[]) {
    for (const activityId of activityIds) {
      this.stagedActivityIds.add(activityId);
      this.stagedActivityHistory.add(activityId);
    }
    return Promise.resolve();
  }

  advanceRun(input: {
    runId: string;
    expectedPage: number;
    nextPage: number;
    insertedDelta: number;
    updatedDelta: number;
    skippedDelta: number;
    scanComplete: boolean;
    status: "running" | "partial";
  }) {
    if (this.run.id !== input.runId || this.run.nextPage !== input.expectedPage) return Promise.resolve(null);
    this.run = {
      ...this.run,
      nextPage: input.nextPage,
      insertedCount: this.run.insertedCount + input.insertedDelta,
      updatedCount: this.run.updatedCount + input.updatedDelta,
      skippedCount: this.run.skippedCount + input.skippedDelta,
      scanComplete: input.scanComplete,
      status: input.status,
    };
    return Promise.resolve(this.run);
  }

  getLocalActivityIds() {
    return Promise.resolve(new Set(this.activities.keys()));
  }

  getStagedActivityIds() {
    return Promise.resolve(new Set(this.stagedActivityIds));
  }

  getVerifiedMissingActivityIds() {
    return Promise.resolve(new Set(this.verifiedMissingActivityIds));
  }

  recordVerification(input: {
    runId: string;
    expectedStep: number;
    seenActivityIds: number[];
    verifiedMissingActivityIds: number[];
    insertedDelta: number;
    updatedDelta: number;
    skippedDelta: number;
  }) {
    if (this.run.id !== input.runId || this.run.verificationStep !== input.expectedStep) return Promise.resolve(null);
    for (const activityId of input.seenActivityIds) this.stagedActivityIds.add(activityId);
    for (const activityId of input.verifiedMissingActivityIds) this.verifiedMissingActivityIds.add(activityId);
    this.run = {
      ...this.run,
      status: "partial",
      verificationStep: this.run.verificationStep + 1,
      insertedCount: this.run.insertedCount + input.insertedDelta,
      updatedCount: this.run.updatedCount + input.updatedDelta,
      skippedCount: this.run.skippedCount + input.skippedDelta,
    };
    return Promise.resolve(this.run);
  }

  pauseRun(input: { runId: string; expectedPage: number; expectedStep: number }) {
    if (
      this.run.id !== input.runId ||
      this.run.nextPage !== input.expectedPage ||
      this.run.verificationStep !== input.expectedStep
    ) {
      return Promise.resolve(null);
    }
    this.run = { ...this.run, status: "partial" };
    return Promise.resolve(this.run);
  }

  finalizeRun(runId: string, expectedStep: number) {
    if (this.run.id !== runId || !this.run.scanComplete || this.run.verificationStep !== expectedStep) {
      return Promise.resolve(null);
    }
    let removedCount = 0;
    for (const activityId of this.verifiedMissingActivityIds) {
      if (this.stagedActivityIds.has(activityId)) continue;
      if (this.activities.delete(activityId)) {
        removedCount += 1;
        this.dependentActivityIds.delete(activityId);
      }
    }
    this.run = { ...this.run, status: "completed", removedCount: this.run.removedCount + removedCount };
    this.stagedActivityIds.clear();
    this.verifiedMissingActivityIds.clear();
    return Promise.resolve(removedCount);
  }
}

function inputUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (input instanceof Request) return new URL(input.url);
  return new URL(input);
}

function activity(id: number, gearId: string | null = "bike-1") {
  return {
    id,
    name: `Ride ${id}`,
    distance: id * 100,
    start_date: "2026-10-13T12:00:00Z",
    gear_id: gearId,
  };
}

function responseFor(value: unknown): Response {
  return Response.json(value);
}

void test("imports every page, matches source bike IDs, and skips missing or unmatched bikes", async () => {
  const store = new MemoryImportStore();
  const firstPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  firstPage[1] = activity(2, null);
  firstPage[2] = activity(3, "unknown-bike");
  const secondPage = [activity(STRAVA_ACTIVITY_PAGE_SIZE + 1), activity(1)];
  const requestedPages: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    return Promise.resolve(responseFor(page === 1 ? firstPage : secondPage));
  };

  const result = await importStravaHistory("fixture-token", store, fetcher);

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(result, {
    outcome: "complete",
    inserted: STRAVA_ACTIVITY_PAGE_SIZE - 1,
    updated: 0,
    skipped: 2,
    nextPage: 3,
  });
  assert.equal(store.bikes.get("bike-1")?.name, "Road bike");
  assert.equal(store.activities.has(1), true);
  assert.equal(store.activities.has(2), false);
  assert.equal(store.activities.has(3), false);
  assert.equal(store.activities.has(STRAVA_ACTIVITY_PAGE_SIZE + 1), true);
  assert.equal(store.activities.size, STRAVA_ACTIVITY_PAGE_SIZE - 1);
});

void test("repair refreshes old provider fields and bike assignment while retaining unmatched rows hidden", async () => {
  const store = new MemoryRepairActivitySyncStore();
  store.bikes.set("old-bike", { id: "bike-row-old-bike", name: "Old bike" });
  store.activities.set(42, {
    id: "stable-row-42",
    userId: "user-a",
    createdAt: "2019-04-02T00:00:00.000Z",
    stravaActivityId: 42,
    name: "Old name",
    distanceMeters: 100,
    startedAt: "2019-04-02T12:00:00Z",
    bikeId: "bike-row-old-bike",
  });
  store.activities.set(43, {
    id: "stable-row-43",
    userId: "user-a",
    createdAt: "2019-04-03T00:00:00.000Z",
    stravaActivityId: 43,
    name: "Was linked",
    distanceMeters: 200,
    startedAt: "2019-04-03T12:00:00Z",
    bikeId: "bike-row-old-bike",
  });
  const changed = {
    ...activity(42, "new-bike"),
    name: "Current name",
    distance: 12_345,
    start_date: "2018-06-07T08:30:00Z",
  };
  const requestedPages: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "new-bike", name: "Current bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    return Promise.resolve(responseFor(page === 1 ? [changed, activity(43, null), activity(44, null)] : []));
  };

  const result = await syncRepairStravaActivities("fixture-token", store.run, store, fetcher);

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(result.outcome, "complete");
  assert.equal(result.inserted, 1);
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.removed, 0);
  assert.deepEqual(store.activities.get(42), {
    id: "stable-row-42",
    userId: "user-a",
    createdAt: "2019-04-02T00:00:00.000Z",
    stravaActivityId: 42,
    name: "Current name",
    distanceMeters: 12_345,
    startedAt: "2018-06-07T08:30:00Z",
    bikeId: "bike-row-new-bike",
  });
  assert.equal(store.activities.get(43)?.bikeId, null);
  assert.equal(store.activities.get(44)?.bikeId, null);
  assert.deepEqual(
    [...store.stagedActivityHistory].sort((first, second) => first - second),
    [42, 43, 44],
  );
  assert.deepEqual([...store.stagedActivityIds], []);
  const linkedRows = [...store.activities.values()].filter(
    (row): row is StoredRepairActivity & { bikeId: string } => row.bikeId !== null,
  );
  const views = toActivityViews(
    linkedRows.map((row) => ({
      id: row.id,
      name: row.name,
      distance_meters: row.distanceMeters,
      started_at: row.startedAt,
      bike_id: row.bikeId,
    })),
    [...store.bikes.values()],
  );
  assert.equal(
    views.some((view) => view.id === "stable-row-43"),
    false,
  );
});

void test("repair verifies absent local IDs only after the empty page and deletes dependents", async () => {
  const store = new MemoryRepairActivitySyncStore();
  store.bikes.set("bike-1", { id: "bike-row-bike-1", name: "Road bike" });
  for (const activityId of [101, 102, 103]) {
    store.activities.set(activityId, {
      id: `row-${activityId}`,
      userId: "user-a",
      createdAt: "2020-01-01T00:00:00.000Z",
      stravaActivityId: activityId,
      name: activityId === 101 ? "Present" : activityId === 102 ? "Provider result changed" : "Deleted at provider",
      distanceMeters: 100,
      startedAt: "2020-01-01T00:00:00Z",
      bikeId: "bike-row-bike-1",
    });
  }
  store.dependentActivityIds.add(103);
  const requestedPages: number[] = [];
  const requestedIds: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(
        responseFor({
          bikes: [
            { id: "bike-1", name: "Road bike" },
            { id: "bike-2", name: "Touring bike" },
          ],
        }),
      );
    }
    if (url.pathname.endsWith("/athlete/activities")) {
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return Promise.resolve(responseFor(page === 1 ? [activity(101)] : []));
    }
    const activityId = Number(url.pathname.split("/").at(-1));
    requestedIds.push(activityId);
    if (activityId === 102) {
      return Promise.resolve(
        responseFor({
          ...activity(102, "bike-2"),
          name: "Refreshed by ID lookup",
          distance: 9_876,
          start_date: "2020-02-03T04:05:00Z",
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };

  const result = await syncRepairStravaActivities("fixture-token", store.run, store, fetcher);

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(requestedIds, [102, 103]);
  assert.equal(result.outcome, "complete");
  assert.equal(result.removed, 1);
  assert.equal(result.updated, 2);
  assert.equal(store.activities.has(101), true);
  assert.deepEqual(store.activities.get(102), {
    id: "row-102",
    userId: "user-a",
    createdAt: "2020-01-01T00:00:00.000Z",
    stravaActivityId: 102,
    name: "Refreshed by ID lookup",
    distanceMeters: 9_876,
    startedAt: "2020-02-03T04:05:00Z",
    bikeId: "bike-row-bike-2",
  });
  assert.equal(store.activities.has(103), false);
  assert.equal(store.dependentActivityIds.has(103), false);
});

void test("repair keeps candidates intact after scan or provider-verification failures", async () => {
  const fullPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  const store = new MemoryRepairActivitySyncStore("partial-scan");
  store.activities.set(999, {
    id: "row-999",
    userId: "user-a",
    createdAt: "2020-01-01T00:00:00.000Z",
    stravaActivityId: 999,
    name: "Unverified",
    distanceMeters: 100,
    startedAt: "2020-01-01T00:00:00Z",
    bikeId: null,
  });
  let failNextPage = true;
  const scanFailureFetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
    if (url.pathname.endsWith("/athlete/activities")) {
      if (url.searchParams.get("page") === "1") return Promise.resolve(responseFor(fullPage));
      if (failNextPage) {
        failNextPage = false;
        return Promise.reject(new Error("temporary provider failure"));
      }
      return Promise.resolve(responseFor([]));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  const interrupted = await syncRepairStravaActivities("fixture-token", store.run, store, scanFailureFetcher);
  assert.equal(interrupted.outcome, "partial");
  assert.equal(interrupted.scanComplete, false);
  assert.equal(store.activities.has(999), true);
  assert.equal(store.verifiedMissingActivityIds.size, 0);
  const resumed = await syncRepairStravaActivities("fixture-token", store.run, store, scanFailureFetcher);
  assert.equal(resumed.outcome, "complete");
  assert.equal(resumed.removed, 1);
  assert.equal(store.activities.has(999), false);

  const verifyStore = new MemoryRepairActivitySyncStore("partial-verification");
  verifyStore.run = { ...verifyStore.run, scanComplete: true, nextPage: 3 };
  verifyStore.activities.set(1000, {
    id: "row-1000",
    userId: "user-a",
    createdAt: "2020-01-01T00:00:00.000Z",
    stravaActivityId: 1000,
    name: "Verification failure",
    distanceMeters: 100,
    startedAt: "2020-01-01T00:00:00Z",
    bikeId: null,
  });
  const verifyFailureFetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
    return Promise.resolve(new Response(null, { status: 429 }));
  };
  const partialVerification = await syncRepairStravaActivities(
    "fixture-token",
    verifyStore.run,
    verifyStore,
    verifyFailureFetcher,
  );
  assert.equal(partialVerification.outcome, "partial");
  assert.equal(partialVerification.scanComplete, true);
  assert.equal(verifyStore.activities.has(1000), true);
  assert.equal(verifyStore.verifiedMissingActivityIds.has(1000), false);
});

void test("repair never finalizes from a stale page cursor", async () => {
  const store = new MemoryRepairActivitySyncStore("concurrent-repair");
  store.run = { ...store.run, nextPage: 2 };
  const staleRun = { ...store.run, nextPage: 1 };
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
    return Promise.resolve(responseFor([activity(1)]));
  };

  const result = await syncRepairStravaActivities("fixture-token", staleRun, store, fetcher);

  assert.equal(result.outcome, "failed");
  assert.equal(store.run.nextPage, 2);
  assert.equal(store.run.scanComplete, false);
});

void test("repair does not mark malformed activity pages complete", async () => {
  const store = new MemoryRepairActivitySyncStore("malformed-page");
  store.activities.set(3000, {
    id: "row-3000",
    userId: "user-a",
    createdAt: "2020-01-01T00:00:00.000Z",
    stravaActivityId: 3000,
    name: "Must remain",
    distanceMeters: 100,
    startedAt: "2020-01-01T00:00:00Z",
    bikeId: null,
  });
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
    return Promise.resolve(responseFor({ activities: [] }));
  };

  const result = await syncRepairStravaActivities("fixture-token", store.run, store, fetcher);

  assert.equal(result.outcome, "failed");
  assert.equal(result.scanComplete, false);
  assert.equal(store.activities.has(3000), true);
});

void test("repair treats authorization, rate-limit, provider, and malformed activity responses as unverified", async () => {
  const providerFailures: (Response | Error)[] = [
    new Response(null, { status: 401 }),
    new Response(null, { status: 403 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 503 }),
    new Response("not-json", { status: 200 }),
  ];

  for (const [index, providerFailure] of providerFailures.entries()) {
    const store = new MemoryRepairActivitySyncStore(`provider-failure-${index}`);
    store.run = { ...store.run, scanComplete: true, nextPage: 3 };
    store.activities.set(2000 + index, {
      id: `row-${2000 + index}`,
      userId: "user-a",
      createdAt: "2020-01-01T00:00:00.000Z",
      stravaActivityId: 2000 + index,
      name: "Must remain",
      distanceMeters: 100,
      startedAt: "2020-01-01T00:00:00Z",
      bikeId: null,
    });
    const fetcher: typeof fetch = (input) => {
      const url = inputUrl(input);
      if (url.pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
      if (providerFailure instanceof Error) return Promise.reject(providerFailure);
      return Promise.resolve(providerFailure);
    };

    const result = await syncRepairStravaActivities("fixture-token", store.run, store, fetcher);

    assert.equal(result.outcome, "partial");
    assert.equal(store.activities.has(2000 + index), true);
    assert.equal(store.verifiedMissingActivityIds.has(2000 + index), false);
  }
});

void test("later-page failure resumes from the failed page without duplicate rows", async () => {
  const store = new MemoryImportStore();
  const firstPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  let failNextSecondPage = true;
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    if (page === 1) return Promise.resolve(responseFor(firstPage));
    if (failNextSecondPage) {
      failNextSecondPage = false;
      return Promise.reject(new Error("temporary network failure"));
    }
    return Promise.resolve(responseFor([activity(STRAVA_ACTIVITY_PAGE_SIZE + 1)]));
  };

  const interrupted = await importStravaHistory("fixture-token", store, fetcher);
  const retried: ImportResult = await importStravaHistory("fixture-token", store, fetcher, {
    startPage: Number.parseInt(String(interrupted.nextPage), 10),
  });

  assert.equal(interrupted.outcome, "partial");
  assert.equal(interrupted.inserted, STRAVA_ACTIVITY_PAGE_SIZE);
  assert.equal(interrupted.nextPage, 2);
  assert.equal(store.activities.size, STRAVA_ACTIVITY_PAGE_SIZE + 1);
  assert.deepEqual(retried, {
    outcome: "complete",
    inserted: 1,
    updated: 0,
    skipped: 0,
    nextPage: 3,
  });
  assert.equal(store.activities.size, STRAVA_ACTIVITY_PAGE_SIZE + 1);
});

void test("bounds each request to five pages and continues from the next page", async () => {
  const store = new MemoryImportStore();
  const fullPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  const requestedPages: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    return Promise.resolve(
      responseFor(page < 6 ? fullPage.map((item) => ({ ...item, id: (page - 1) * 200 + item.id })) : [activity(1001)]),
    );
  };

  const firstBatch = await importStravaHistory("fixture-token", store, fetcher);
  assert.equal(firstBatch.outcome, "partial");
  assert.equal(firstBatch.inserted, 1000);
  assert.equal(firstBatch.nextPage, 6);
  assert.deepEqual(requestedPages, [1, 2, 3, 4, 5]);

  const secondBatch: ImportResult = await importStravaHistory("fixture-token", store, fetcher, {
    startPage: Number.parseInt(String(firstBatch.nextPage), 10),
  });
  assert.equal(secondBatch.outcome, "complete");
  assert.equal(secondBatch.inserted, 1);
  assert.equal(store.activities.size, 1001);
  assert.deepEqual(requestedPages, [1, 2, 3, 4, 5, 6]);
});

void test("returns a failed outcome when no activity page can be saved", async () => {
  const result = await importStravaHistory("fixture-token", new MemoryImportStore(), (input) => {
    if (inputUrl(input).pathname.endsWith("/athlete")) return Promise.resolve(responseFor({ bikes: [] }));
    return Promise.reject(new Error("provider unavailable"));
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.inserted, 0);
  assert.equal(result.updated, 0);
});

void test("discovers an old-dated activity once and leaves an existing activity unchanged", async () => {
  const store = new MemoryNewActivitySyncStore();
  const existing = {
    stravaActivityId: 42,
    name: "Locally preserved name",
    distanceMeters: 9876,
    startedAt: "2019-04-02T12:00:00Z",
    gearId: "bike-1",
    bikeId: "existing-bike-row",
  };
  store.activities.set(42, existing);
  const lateVisible = { ...activity(43), start_date: "2017-05-01T08:00:00Z" };
  const requestedPages: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    return Promise.resolve(responseFor(page === 1 ? [lateVisible, activity(42)] : []));
  };

  const first = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(first.outcome, "complete");
  assert.equal(first.inserted, 1);
  assert.deepEqual(store.activities.get(42), existing);
  assert.equal(store.activities.get(43)?.startedAt, "2017-05-01T08:00:00Z");

  const secondStore = new MemoryNewActivitySyncStore("sync-2");
  secondStore.bikes = new Map(store.bikes);
  secondStore.activities = new Map(store.activities);
  const second = await syncNewStravaActivities("fixture-token", secondStore.run, secondStore, fetcher);
  assert.equal(second.inserted, 0);
  assert.deepEqual(secondStore.activities.get(42), existing);
  assert.deepEqual(requestedPages, [1, 2, 1, 2]);
  assert.equal(STRAVA_ACTIVITY_PAGES_PER_SYNC, 5);
});

void test("bounds batches to five pages and continues after a short non-empty page through the empty page", async () => {
  const store = new MemoryNewActivitySyncStore();
  const fullPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  const requestedPages: number[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    if (page <= STRAVA_ACTIVITY_PAGES_PER_SYNC) {
      return Promise.resolve(
        responseFor(fullPage.map((item) => ({ ...item, id: (page - 1) * STRAVA_ACTIVITY_PAGE_SIZE + item.id }))),
      );
    }
    return Promise.resolve(responseFor(page === 6 ? [activity(1001)] : []));
  };

  const firstBatch = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(firstBatch.outcome, "partial");
  assert.equal(firstBatch.inserted, STRAVA_ACTIVITY_PAGE_SIZE * STRAVA_ACTIVITY_PAGES_PER_SYNC);
  assert.equal(firstBatch.nextPage, 6);
  assert.deepEqual(requestedPages, [1, 2, 3, 4, 5]);

  const secondBatch = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(secondBatch.outcome, "complete");
  assert.equal(secondBatch.inserted, 1001);
  assert.equal(store.activities.size, 1001);
  assert.deepEqual(requestedPages, [1, 2, 3, 4, 5, 6, 7]);
});

void test("resumes from the saved page after a provider failure without duplicate inserts", async () => {
  const store = new MemoryNewActivitySyncStore();
  const firstPage = Array.from({ length: STRAVA_ACTIVITY_PAGE_SIZE }, (_, index) => activity(index + 1));
  let failSecondPage = true;
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    const page = Number(url.searchParams.get("page"));
    if (page === 1) return Promise.resolve(responseFor(firstPage));
    if (page === 2 && failSecondPage) {
      failSecondPage = false;
      return Promise.reject(new Error("temporary provider failure"));
    }
    return Promise.resolve(responseFor(page === 2 ? [activity(201)] : []));
  };

  const interrupted = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(interrupted.outcome, "partial");
  assert.equal(interrupted.inserted, 200);
  assert.equal(interrupted.nextPage, 2);
  assert.equal(store.activities.size, 200);

  const resumed = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(resumed.outcome, "complete");
  assert.equal(resumed.inserted, 201);
  assert.equal(store.activities.size, 201);
});

void test("a stale continuation cannot regress the saved cursor", async () => {
  const store = new MemoryNewActivitySyncStore();
  const existing = {
    stravaActivityId: 1,
    name: "Already stored",
    distanceMeters: 100,
    startedAt: "2026-10-13T12:00:00Z",
    gearId: "bike-1",
    bikeId: "bike-row-bike-1",
  };
  store.activities.set(existing.stravaActivityId, existing);
  store.run = { ...store.run, status: "partial", nextPage: 3, insertedCount: 2, skippedCount: 1 };
  const staleRun = { ...store.run, nextPage: 1 };
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(responseFor({ bikes: [{ id: "bike-1", name: "Road bike" }] }));
    }
    return Promise.resolve(responseFor([activity(1)]));
  };

  const result = await syncNewStravaActivities("fixture-token", staleRun, store, fetcher);
  assert.equal(result.outcome, "failed");
  assert.equal(store.run.nextPage, 3);
  assert.equal(store.run.insertedCount, 2);
  assert.deepEqual(store.activities.get(1), existing);
});

void test("counts ineligible unknown activities and imports one on a later eligible scan", async () => {
  const store = new MemoryNewActivitySyncStore();
  let bikesAvailable = false;
  const fetcher: typeof fetch = (input) => {
    const url = inputUrl(input);
    if (url.pathname.endsWith("/athlete")) {
      return Promise.resolve(
        responseFor({
          bikes: bikesAvailable
            ? [
                { id: "bike-1", name: "Road bike" },
                { id: "unknown-bike", name: "Newly added bike" },
                { id: "ambiguous-bike", name: "First name" },
                { id: "ambiguous-bike", name: "Conflicting name" },
              ]
            : [],
        }),
      );
    }
    const page = Number(url.searchParams.get("page"));
    return Promise.resolve(
      responseFor(
        page === 1
          ? [activity(70, null), activity(71, "bike-1"), activity(72, "unknown-bike"), activity(73, "ambiguous-bike")]
          : [],
      ),
    );
  };

  const first = await syncNewStravaActivities("fixture-token", store.run, store, fetcher);
  assert.equal(first.outcome, "complete");
  assert.equal(first.skipped, 4);
  assert.equal(store.activities.size, 0);

  bikesAvailable = true;
  const laterStore = new MemoryNewActivitySyncStore("sync-later");
  laterStore.activities = new Map(store.activities);
  const later = await syncNewStravaActivities("fixture-token", laterStore.run, laterStore, fetcher);
  assert.equal(later.inserted, 2);
  assert.equal(later.skipped, 2);
  assert.equal(laterStore.activities.has(71), true);
  assert.equal(laterStore.activities.has(72), true);
  assert.equal(laterStore.activities.has(70), false);
  assert.equal(laterStore.activities.has(73), false);
});
