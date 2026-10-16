import assert from "node:assert/strict";
import { test } from "node:test";
import {
  importStravaHistory,
  STRAVA_ACTIVITY_PAGE_SIZE,
  type ImportResult,
  type ImportedActivity,
  type ImportStore,
  type StravaBike,
} from "./import.ts";

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
