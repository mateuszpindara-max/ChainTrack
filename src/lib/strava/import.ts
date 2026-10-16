export const STRAVA_ACTIVITY_PAGE_SIZE = 200;
export const STRAVA_ACTIVITY_PAGES_PER_IMPORT = 5;
export const STRAVA_ACTIVITY_PAGES_PER_SYNC = 5;
const STRAVA_REQUEST_TIMEOUT_MS = 10_000;

export interface StravaBike {
  id: string;
  name: string;
}

export interface ImportedActivity {
  stravaActivityId: number;
  name: string;
  distanceMeters: number;
  startedAt: string;
  gearId: string;
}

export interface ActivityUpsertCounts {
  inserted: number;
  updated: number;
}

export interface ImportStore {
  upsertBikes(bikes: StravaBike[]): Promise<void>;
  upsertActivities(activities: ImportedActivity[]): Promise<ActivityUpsertCounts>;
}

export interface ImportResult extends ActivityUpsertCounts {
  outcome: "complete" | "partial" | "failed";
  skipped: number;
  nextPage: number;
  message?: string;
}

export interface NewActivitySyncRun {
  id: string;
  status: "running" | "partial" | "completed";
  nextPage: number;
  insertedCount: number;
  skippedCount: number;
}

export interface NewActivityInsert {
  stravaActivityId: number;
  name: string;
  distanceMeters: number;
  startedAt: string;
  bikeId: string;
}

export interface NewActivitySyncStore {
  upsertBikes(bikes: StravaBike[]): Promise<void>;
  getExistingActivityIds(activityIds: number[]): Promise<Set<number>>;
  getBikeIds(gearIds: string[]): Promise<Map<string, string>>;
  insertActivitiesOnly(activities: NewActivityInsert[]): Promise<number>;
  advanceRun(input: {
    runId: string;
    expectedPage: number;
    nextPage: number;
    insertedDelta: number;
    skippedDelta: number;
    status: "running" | "partial" | "completed";
  }): Promise<NewActivitySyncRun | null>;
}

export interface NewActivitySyncResult {
  outcome: "complete" | "partial" | "failed";
  runId: string;
  inserted: number;
  skipped: number;
  nextPage: number;
  status: "running" | "partial" | "completed";
  message?: string;
}

export interface RepairActivitySyncRun {
  id: string;
  status: "running" | "partial" | "completed";
  nextPage: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  removedCount: number;
  scanComplete: boolean;
  verificationStep: number;
}

export interface RepairActivityUpsert {
  stravaActivityId: number;
  name: string;
  distanceMeters: number;
  startedAt: string;
  bikeId: string | null;
}

export interface RepairActivitySyncStore {
  upsertBikes(bikes: StravaBike[]): Promise<void>;
  getBikeIds(gearIds: string[]): Promise<Map<string, string>>;
  upsertActivities(activities: RepairActivityUpsert[]): Promise<ActivityUpsertCounts>;
  stageActivityIds(runId: string, activityIds: number[]): Promise<void>;
  advanceRun(input: {
    runId: string;
    expectedPage: number;
    nextPage: number;
    insertedDelta: number;
    updatedDelta: number;
    skippedDelta: number;
    scanComplete: boolean;
    status: "running" | "partial";
  }): Promise<RepairActivitySyncRun | null>;
  getLocalActivityIds(): Promise<Set<number>>;
  getStagedActivityIds(runId: string): Promise<Set<number>>;
  getVerifiedMissingActivityIds(runId: string): Promise<Set<number>>;
  recordVerification(input: {
    runId: string;
    expectedStep: number;
    seenActivityIds: number[];
    verifiedMissingActivityIds: number[];
    insertedDelta: number;
    updatedDelta: number;
    skippedDelta: number;
  }): Promise<RepairActivitySyncRun | null>;
  pauseRun(input: { runId: string; expectedPage: number; expectedStep: number }): Promise<RepairActivitySyncRun | null>;
  finalizeRun(runId: string, expectedStep: number): Promise<number | null>;
}

export interface RepairActivitySyncResult {
  outcome: "complete" | "partial" | "failed";
  runId: string;
  inserted: number;
  updated: number;
  skipped: number;
  removed: number;
  nextPage: number;
  status: "running" | "partial" | "completed";
  scanComplete: boolean;
  message?: string;
}

interface StravaActivityResponse {
  id: number;
  name: string;
  distance: number;
  start_date: string;
  gear_id?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBikes(value: unknown): { bikes: StravaBike[]; ambiguousGearIds: Set<string> } {
  if (!Array.isArray(value)) throw new Error("Invalid Strava athlete response");

  const bikesById = new Map<string, StravaBike>();
  const ambiguousGearIds = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string") {
      throw new Error("Invalid Strava athlete response");
    }
    const existing = bikesById.get(item.id);
    if (existing && existing.name !== item.name) ambiguousGearIds.add(item.id);
    if (!existing) bikesById.set(item.id, { id: item.id, name: item.name });
  }

  return { bikes: [...bikesById.values()], ambiguousGearIds };
}

function normalizeActivity(value: unknown): StravaActivityResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    typeof value.name !== "string" ||
    typeof value.distance !== "number" ||
    !Number.isFinite(value.distance) ||
    value.distance < 0 ||
    typeof value.start_date !== "string" ||
    !Number.isFinite(Date.parse(value.start_date)) ||
    (value.gear_id !== undefined && value.gear_id !== null && typeof value.gear_id !== "string")
  ) {
    throw new Error("Invalid Strava activity response");
  }
  return value as unknown as StravaActivityResponse;
}

async function fetchJson(url: URL, accessToken: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Strava request failed");
  return response.json();
}

async function fetchRepairJson(url: URL, accessToken: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(STRAVA_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Strava request failed");
  return response.json();
}

export async function importStravaHistory(
  accessToken: string,
  store: ImportStore,
  fetcher: typeof fetch = fetch,
  options: { startPage?: number; maxPages?: number } = {},
): Promise<ImportResult> {
  const counts: ActivityUpsertCounts = { inserted: 0, updated: 0 };
  const startPage = options.startPage ?? 1;
  const maxPages = options.maxPages ?? STRAVA_ACTIVITY_PAGES_PER_IMPORT;
  if (!Number.isSafeInteger(startPage) || startPage < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error("Invalid Strava import page bounds");
  }
  let skipped = 0;
  let completedPages = 0;
  let nextPage = startPage;

  try {
    const athleteUrl = new URL("https://www.strava.com/api/v3/athlete");
    const athlete = await fetchJson(athleteUrl, accessToken, fetcher);
    if (!isRecord(athlete)) throw new Error("Invalid Strava athlete response");

    const { bikes, ambiguousGearIds } = normalizeBikes(athlete.bikes ?? []);
    const bikesById = new Map(bikes.map((bike) => [bike.id, bike]));
    await store.upsertBikes(bikes);

    const seenActivityIds = new Set<number>();
    for (let page = startPage; page < startPage + maxPages; page += 1) {
      const activitiesUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
      activitiesUrl.searchParams.set("page", String(page));
      activitiesUrl.searchParams.set("per_page", String(STRAVA_ACTIVITY_PAGE_SIZE));
      const response = await fetchJson(activitiesUrl, accessToken, fetcher);
      if (!Array.isArray(response)) throw new Error("Invalid Strava activity page");

      const eligible: ImportedActivity[] = [];
      for (const value of response) {
        const activity = normalizeActivity(value);
        if (seenActivityIds.has(activity.id)) continue;
        seenActivityIds.add(activity.id);

        const gearId = activity.gear_id;
        if (!gearId || ambiguousGearIds.has(gearId) || !bikesById.has(gearId)) {
          skipped += 1;
          continue;
        }
        eligible.push({
          stravaActivityId: activity.id,
          name: activity.name,
          distanceMeters: activity.distance,
          startedAt: activity.start_date,
          gearId,
        });
      }

      if (eligible.length > 0) {
        const pageCounts = await store.upsertActivities(eligible);
        counts.inserted += pageCounts.inserted;
        counts.updated += pageCounts.updated;
      }
      completedPages += 1;
      nextPage = page + 1;
      if (response.length < STRAVA_ACTIVITY_PAGE_SIZE) {
        return { outcome: "complete", ...counts, skipped, nextPage };
      }
    }

    return {
      outcome: "partial",
      ...counts,
      skipped,
      nextPage,
      message: "This import batch is saved. Continue the import to fetch the remaining history.",
    };
  } catch {
    const partial = completedPages > 0;
    return {
      outcome: partial ? "partial" : "failed",
      ...counts,
      skipped,
      nextPage,
      message: partial
        ? "Some history was saved, but the import stopped before all pages completed. Retry to continue safely."
        : "The Strava history import could not be completed.",
    };
  }
}

export async function syncNewStravaActivities(
  accessToken: string,
  run: NewActivitySyncRun,
  store: NewActivitySyncStore,
  fetcher: typeof fetch = fetch,
): Promise<NewActivitySyncResult> {
  let currentRun = run;
  let completedPages = 0;

  try {
    const athleteUrl = new URL("https://www.strava.com/api/v3/athlete");
    const athlete = await fetchJson(athleteUrl, accessToken, fetcher);
    if (!isRecord(athlete)) throw new Error("Invalid Strava athlete response");

    const { bikes, ambiguousGearIds } = normalizeBikes(athlete.bikes ?? []);
    const providerGearIds = new Set(bikes.map((bike) => bike.id));
    await store.upsertBikes(bikes);

    for (let pageOffset = 0; pageOffset < STRAVA_ACTIVITY_PAGES_PER_SYNC; pageOffset += 1) {
      const pageNumber = currentRun.nextPage;
      const activitiesUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
      activitiesUrl.searchParams.set("page", String(pageNumber));
      activitiesUrl.searchParams.set("per_page", String(STRAVA_ACTIVITY_PAGE_SIZE));
      const response = await fetchJson(activitiesUrl, accessToken, fetcher);
      if (!Array.isArray(response)) throw new Error("Invalid Strava activity page");

      const normalized = new Map<number, StravaActivityResponse>();
      for (const value of response) {
        const activity = normalizeActivity(value);
        if (!normalized.has(activity.id)) normalized.set(activity.id, activity);
      }

      const existingIds = await store.getExistingActivityIds([...normalized.keys()]);
      const unknownActivities = [...normalized.values()].filter((activity) => !existingIds.has(activity.id));
      const eligible = unknownActivities.filter(
        (activity) =>
          Boolean(activity.gear_id) &&
          providerGearIds.has(activity.gear_id ?? "") &&
          !ambiguousGearIds.has(activity.gear_id ?? ""),
      );
      const gearIds = [
        ...new Set(eligible.map((activity) => activity.gear_id).filter((gearId): gearId is string => Boolean(gearId))),
      ];
      const bikeIds = gearIds.length > 0 ? await store.getBikeIds(gearIds) : new Map<string, string>();
      const insertRows: NewActivityInsert[] = [];

      for (const activity of unknownActivities) {
        const gearId = activity.gear_id;
        const bikeId = gearId ? bikeIds.get(gearId) : undefined;
        if (!gearId || ambiguousGearIds.has(gearId) || !providerGearIds.has(gearId) || !bikeId) continue;
        insertRows.push({
          stravaActivityId: activity.id,
          name: activity.name,
          distanceMeters: activity.distance,
          startedAt: activity.start_date,
          bikeId,
        });
      }

      const skippedDelta = unknownActivities.length - insertRows.length;
      const insertedDelta = insertRows.length > 0 ? await store.insertActivitiesOnly(insertRows) : 0;
      const terminal = response.length === 0;
      const lastPageInBatch = pageOffset === STRAVA_ACTIVITY_PAGES_PER_SYNC - 1;
      const nextRunStatus = terminal ? "completed" : lastPageInBatch ? "partial" : "running";
      const advancedRun = await store.advanceRun({
        runId: currentRun.id,
        expectedPage: pageNumber,
        nextPage: pageNumber + 1,
        insertedDelta,
        skippedDelta,
        status: nextRunStatus,
      });
      if (!advancedRun) {
        return {
          outcome: "failed",
          runId: currentRun.id,
          inserted: currentRun.insertedCount,
          skipped: currentRun.skippedCount,
          nextPage: currentRun.nextPage,
          status: currentRun.status,
          message: "Another synchronization request advanced this run. Continue from its saved progress.",
        };
      }

      currentRun = advancedRun;
      completedPages += 1;
      if (terminal) {
        return {
          outcome: "complete",
          runId: currentRun.id,
          inserted: currentRun.insertedCount,
          skipped: currentRun.skippedCount,
          nextPage: currentRun.nextPage,
          status: "completed",
        };
      }
    }

    return {
      outcome: "partial",
      runId: currentRun.id,
      inserted: currentRun.insertedCount,
      skipped: currentRun.skippedCount,
      nextPage: currentRun.nextPage,
      status: currentRun.status,
      message: "This synchronization batch is saved. Continue to scan the remaining Strava activities.",
    };
  } catch {
    return {
      outcome: completedPages > 0 ? "partial" : "failed",
      runId: currentRun.id,
      inserted: currentRun.insertedCount,
      skipped: currentRun.skippedCount,
      nextPage: currentRun.nextPage,
      status: currentRun.status,
      message:
        completedPages > 0
          ? "Some activities were saved, but Strava stopped responding. Continue from the saved page."
          : "Strava synchronization failed before the next page was saved. Retry from the saved page.",
    };
  }
}

const REPAIR_ACTIVITY_LOOKUPS_PER_SYNC = 50;

function toRepairUpsert(activity: StravaActivityResponse, bikeIds: Map<string, string>, ambiguousGearIds: Set<string>) {
  const gearId = activity.gear_id;
  return {
    stravaActivityId: activity.id,
    name: activity.name,
    distanceMeters: activity.distance,
    startedAt: activity.start_date,
    bikeId: gearId && !ambiguousGearIds.has(gearId) ? (bikeIds.get(gearId) ?? null) : null,
  } satisfies RepairActivityUpsert;
}

function repairResult(
  run: RepairActivitySyncRun,
  outcome: RepairActivitySyncResult["outcome"],
  message?: string,
): RepairActivitySyncResult {
  return {
    outcome,
    runId: run.id,
    inserted: run.insertedCount,
    updated: run.updatedCount,
    skipped: run.skippedCount,
    removed: run.removedCount,
    nextPage: run.nextPage,
    status: run.status,
    scanComplete: run.scanComplete,
    ...(message ? { message } : {}),
  };
}

export async function syncRepairStravaActivities(
  accessToken: string,
  run: RepairActivitySyncRun,
  store: RepairActivitySyncStore,
  fetcher: typeof fetch = fetch,
): Promise<RepairActivitySyncResult> {
  let currentRun = run;
  let completedPages = 0;

  try {
    const athlete = await fetchRepairJson(new URL("https://www.strava.com/api/v3/athlete"), accessToken, fetcher);
    if (!isRecord(athlete)) throw new Error("Invalid Strava athlete response");
    const { bikes, ambiguousGearIds } = normalizeBikes(athlete.bikes);
    await store.upsertBikes(bikes);

    if (!currentRun.scanComplete) {
      for (let pageOffset = 0; pageOffset < STRAVA_ACTIVITY_PAGES_PER_SYNC; pageOffset += 1) {
        const pageNumber = currentRun.nextPage;
        const activitiesUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
        activitiesUrl.searchParams.set("page", String(pageNumber));
        activitiesUrl.searchParams.set("per_page", String(STRAVA_ACTIVITY_PAGE_SIZE));
        const response = await fetchRepairJson(activitiesUrl, accessToken, fetcher);
        if (!Array.isArray(response)) throw new Error("Invalid Strava activity page");

        const activities = new Map<number, StravaActivityResponse>();
        for (const value of response) {
          const activity = normalizeActivity(value);
          if (!activities.has(activity.id)) activities.set(activity.id, activity);
        }
        const gearIds = [
          ...new Set(
            [...activities.values()]
              .map((activity) => activity.gear_id)
              .filter((gearId): gearId is string => typeof gearId === "string" && gearId.length > 0),
          ),
        ];
        const bikeIds = await store.getBikeIds(gearIds);
        const upserts = [...activities.values()].map((activity) => toRepairUpsert(activity, bikeIds, ambiguousGearIds));
        const counts = await store.upsertActivities(upserts);
        const skippedDelta = upserts.filter((activity) => activity.bikeId === null).length;
        await store.stageActivityIds(currentRun.id, [...activities.keys()]);

        const terminal = response.length === 0;
        const lastPageInBatch = pageOffset === STRAVA_ACTIVITY_PAGES_PER_SYNC - 1;
        const advancedRun = await store.advanceRun({
          runId: currentRun.id,
          expectedPage: pageNumber,
          nextPage: pageNumber + 1,
          insertedDelta: counts.inserted,
          updatedDelta: counts.updated,
          skippedDelta,
          scanComplete: terminal,
          status: terminal || !lastPageInBatch ? "running" : "partial",
        });
        if (!advancedRun) {
          return repairResult(
            currentRun,
            "failed",
            "Another synchronization advanced this repair run. Continue from its saved progress.",
          );
        }
        currentRun = advancedRun;
        completedPages += 1;
        if (terminal) break;
      }

      if (!currentRun.scanComplete) {
        return repairResult(
          currentRun,
          "partial",
          "This repair batch is saved. Continue to scan the remaining Strava activities.",
        );
      }
    }

    const [localActivityIds, stagedActivityIds, verifiedMissingActivityIds] = await Promise.all([
      store.getLocalActivityIds(),
      store.getStagedActivityIds(currentRun.id),
      store.getVerifiedMissingActivityIds(currentRun.id),
    ]);
    const candidates = [...localActivityIds].filter(
      (activityId) => !stagedActivityIds.has(activityId) && !verifiedMissingActivityIds.has(activityId),
    );
    const lookupBatch = candidates.slice(0, REPAIR_ACTIVITY_LOOKUPS_PER_SYNC);
    const foundActivities: StravaActivityResponse[] = [];
    const newlyMissingIds: number[] = [];
    let providerFailure = false;

    for (const activityId of lookupBatch) {
      try {
        const activityResponse = await fetcher(new URL(`https://www.strava.com/api/v3/activities/${activityId}`), {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(STRAVA_REQUEST_TIMEOUT_MS),
        });
        if (activityResponse.status === 404) {
          newlyMissingIds.push(activityId);
          continue;
        }
        if (!activityResponse.ok) throw new Error("Strava activity verification failed");
        const activity = normalizeActivity(await activityResponse.json());
        if (activity.id !== activityId) throw new Error("Strava returned a different activity");
        foundActivities.push(activity);
      } catch {
        providerFailure = true;
        break;
      }
    }

    const foundGearIds = [
      ...new Set(
        foundActivities
          .map((activity) => activity.gear_id)
          .filter((gearId): gearId is string => typeof gearId === "string" && gearId.length > 0),
      ),
    ];
    const foundBikeIds = await store.getBikeIds(foundGearIds);
    const foundUpserts = foundActivities.map((activity) => toRepairUpsert(activity, foundBikeIds, ambiguousGearIds));
    const foundCounts = await store.upsertActivities(foundUpserts);
    const foundSkipped = foundUpserts.filter((activity) => activity.bikeId === null).length;
    const foundIds = foundActivities.map((activity) => activity.id);

    const recordedRun = await store.recordVerification({
      runId: currentRun.id,
      expectedStep: currentRun.verificationStep,
      seenActivityIds: foundIds,
      verifiedMissingActivityIds: newlyMissingIds,
      insertedDelta: foundCounts.inserted,
      updatedDelta: foundCounts.updated,
      skippedDelta: foundSkipped,
    });
    if (!recordedRun) {
      return repairResult(
        currentRun,
        "failed",
        "Another synchronization advanced removal verification. Continue from its saved progress.",
      );
    }
    currentRun = recordedRun;

    const resolvedIds = new Set([...foundIds, ...newlyMissingIds]);
    const unresolvedCount = candidates.filter((activityId) => !resolvedIds.has(activityId)).length;
    if (providerFailure || unresolvedCount > 0) {
      const pausedRun = await store.pauseRun({
        runId: currentRun.id,
        expectedPage: currentRun.nextPage,
        expectedStep: currentRun.verificationStep,
      });
      if (!pausedRun) {
        return repairResult(currentRun, "failed", "Another synchronization advanced this repair run.");
      }
      currentRun = pausedRun;
      const message = providerFailure
        ? "Some Strava activities could not be verified. No unverified activities were removed; continue to retry."
        : "Removal verification is saved. Continue to verify the remaining activities.";
      return repairResult(currentRun, "partial", message);
    }

    const removedCount = await store.finalizeRun(currentRun.id, currentRun.verificationStep);
    if (removedCount === null) {
      return repairResult(
        currentRun,
        "failed",
        "Another synchronization finalized this repair run. Refresh the dashboard to load its result.",
      );
    }
    currentRun = {
      ...currentRun,
      status: "completed",
      removedCount: currentRun.removedCount + removedCount,
    };
    return repairResult(currentRun, "complete");
  } catch {
    const partial = completedPages > 0 || currentRun.scanComplete;
    return repairResult(
      currentRun,
      partial ? "partial" : "failed",
      partial
        ? "Repair progress is saved, but Strava or storage stopped responding. Continue from the saved progress."
        : "The Strava repair could not start. Retry from the saved progress.",
    );
  }
}
