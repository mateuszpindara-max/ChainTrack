export const STRAVA_ACTIVITY_PAGE_SIZE = 200;

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

export async function importStravaHistory(
  accessToken: string,
  store: ImportStore,
  fetcher: typeof fetch = fetch,
): Promise<ImportResult> {
  const counts: ActivityUpsertCounts = { inserted: 0, updated: 0 };
  let skipped = 0;
  let completedPages = 0;

  try {
    const athleteUrl = new URL("https://www.strava.com/api/v3/athlete");
    const athlete = await fetchJson(athleteUrl, accessToken, fetcher);
    if (!isRecord(athlete)) throw new Error("Invalid Strava athlete response");

    const { bikes, ambiguousGearIds } = normalizeBikes(athlete.bikes ?? []);
    const bikesById = new Map(bikes.map((bike) => [bike.id, bike]));
    await store.upsertBikes(bikes);

    const seenActivityIds = new Set<number>();
    for (let page = 1; ; page += 1) {
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
      if (response.length < STRAVA_ACTIVITY_PAGE_SIZE) break;
    }

    return { outcome: "complete", ...counts, skipped };
  } catch {
    const partial = completedPages > 0;
    return {
      outcome: partial ? "partial" : "failed",
      ...counts,
      skipped,
      message: partial
        ? "Some history was saved, but the import stopped before all pages completed. Retry to continue safely."
        : "The Strava history import could not be completed.",
    };
  }
}
