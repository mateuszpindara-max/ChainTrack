import { toActivityViews, type ActivityRow, type ActivityView, type BikeRow } from "./activity-view.ts";

export const DASHBOARD_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedOffset = { success: true; value: number } | { success: false };
export type ParsedBikeFilter = { success: true; bikeId: string | null } | { success: false };

export interface DashboardActivityStore {
  readActivities(input: {
    userId: string;
    bikeId: string | null;
    offset: number;
    limit: number;
  }): Promise<ActivityRow[]>;
  readBikes(input: { userId: string; ids: string[] }): Promise<BikeRow[]>;
}

export interface DashboardBikeStore {
  readBikes(input: { userId: string; offset: number; limit: number }): Promise<BikeRow[]>;
}

export function parseDashboardOffset(params: URLSearchParams): ParsedOffset {
  const rawOffset = params.get("offset");
  if (rawOffset !== null && rawOffset.trim() === "") return { success: false };
  const value = Number(rawOffset ?? "0");
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OFFSET) return { success: false };
  return { success: true, value };
}

export function parseActivityBikeFilter(params: URLSearchParams): ParsedBikeFilter {
  const bikeId = params.get("bikeId");
  if (bikeId === null) return { success: true, bikeId: null };
  if (!UUID_PATTERN.test(bikeId)) return { success: false };
  return { success: true, bikeId };
}

export async function getActivityPage(
  store: DashboardActivityStore,
  userId: string,
  offset: number,
  bikeId: string | null,
): Promise<{ activities: ActivityView[]; hasMore: boolean }> {
  const rows = await store.readActivities({ userId, bikeId, offset, limit: DASHBOARD_PAGE_SIZE + 1 });
  const pageRows = rows.slice(0, DASHBOARD_PAGE_SIZE);
  const bikeIds = [...new Set(pageRows.map((activity) => activity.bike_id))];
  const bikes = await store.readBikes({ userId, ids: bikeIds });
  return {
    activities: toActivityViews(pageRows, bikes),
    hasMore: rows.length > DASHBOARD_PAGE_SIZE,
  };
}

export async function getBikePage(
  store: DashboardBikeStore,
  userId: string,
  offset: number,
): Promise<{ bikes: BikeRow[]; hasMore: boolean }> {
  const rows = await store.readBikes({ userId, offset, limit: DASHBOARD_PAGE_SIZE + 1 });
  return { bikes: rows.slice(0, DASHBOARD_PAGE_SIZE), hasMore: rows.length > DASHBOARD_PAGE_SIZE };
}
