import { toActivityViews, type ActivityRow, type ActivityView, type BikeRow } from "./activity-view.ts";
import type { DashboardSelection } from "./dashboard-state.ts";

export const DASHBOARD_PAGE_SIZE = 100;
export const MAX_DASHBOARD_PAGE_SIZE = 500;
const MAX_OFFSET = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedOffset = { success: true; value: number } | { success: false };
export type ParsedBikeFilter = { success: true; bikeId: string | null } | { success: false };
export type ActivityChainFilter = string | null;
export type ParsedChainFilter = { success: true; chainId: ActivityChainFilter } | { success: false };
export type ParsedActivityLimit = { success: true; limit: number } | { success: false };

export function buildActivityQueryString(
  selection: Extract<DashboardSelection, { kind: "activities" }>,
  offset: number,
  limit?: number,
): string {
  const params = new URLSearchParams({ offset: String(offset) });
  if (selection.bikeId !== null) params.set("bikeId", selection.bikeId);
  if (selection.chainId !== null) params.set("chainId", selection.chainId);
  if (limit !== undefined) params.set("limit", String(limit));
  return params.toString();
}

export function getActivityRefreshRowCount(loadedRowCount: number): number {
  return Math.max(DASHBOARD_PAGE_SIZE, loadedRowCount);
}

export interface DashboardActivityStore {
  readActivities(input: {
    userId: string;
    bikeId: string | null;
    chainId: ActivityChainFilter;
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

export function parseActivityChainFilter(params: URLSearchParams, bikeId: string | null): ParsedChainFilter {
  const chainId = params.get("chainId");
  if (chainId === null) return { success: true, chainId: null };
  if (bikeId === null) return { success: false };
  if (chainId === "none") return { success: true, chainId };
  if (!UUID_PATTERN.test(chainId)) return { success: false };
  return { success: true, chainId };
}

export function parseActivityLimit(params: URLSearchParams): ParsedActivityLimit {
  const rawLimit = params.get("limit");
  if (rawLimit === null) return { success: true, limit: DASHBOARD_PAGE_SIZE };
  if (!/^\d+$/.test(rawLimit)) return { success: false };
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DASHBOARD_PAGE_SIZE) return { success: false };
  return { success: true, limit };
}

export async function getActivityPage(
  store: DashboardActivityStore,
  userId: string,
  options: { offset: number; bikeId: string | null; chainId: ActivityChainFilter; limit: number },
): Promise<{ activities: ActivityView[]; hasMore: boolean }> {
  const rows = await store.readActivities({
    userId,
    bikeId: options.bikeId,
    chainId: options.chainId,
    offset: options.offset,
    limit: options.limit + 1,
  });
  const pageRows = rows.slice(0, options.limit);
  const bikeIds = [...new Set(pageRows.map((activity) => activity.bike_id))];
  const bikes = await store.readBikes({ userId, ids: bikeIds });
  return {
    activities: toActivityViews(pageRows, bikes),
    hasMore: rows.length > options.limit,
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
