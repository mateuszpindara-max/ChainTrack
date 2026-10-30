import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_CHAIN_COLUMNS, toLifecycleChainView } from "./chain.ts";
import type { ChainsDatabase } from "./database.ts";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const CYCLE_PAGE_SIZE = 50;
type DatabaseClient = SupabaseClient<ChainsDatabase>;

export function parseOffset(rawOffset: string | null): number | null {
  if (rawOffset !== null && rawOffset.trim() === "") return null;
  const offset = Number(rawOffset ?? "0");
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : null;
}

export async function readChainMetrics(db: DatabaseClient, userId: string, chainId: string, offset: number) {
  const { data: chain, error: chainError } = await db
    .from("chain_metrics")
    .select(LIFECYCLE_CHAIN_COLUMNS)
    .eq("user_id", userId)
    .eq("id", chainId)
    .maybeSingle();
  if (chainError) throw chainError;
  if (!chain) return null;
  const { data: cycles, error: cycleError } = await db
    .from("chain_cycles")
    .select("mark_activity_id, bike_id, cycle_started_at, cycle_ended_at, distance_meters, is_open")
    .eq("user_id", userId)
    .eq("chain_id", chainId)
    .order("cycle_started_at", { ascending: false })
    .order("mark_activity_id", { ascending: false })
    .range(offset, offset + CYCLE_PAGE_SIZE);
  if (cycleError) throw cycleError;
  return {
    chain: toLifecycleChainView(chain),
    cycles: cycles.slice(0, CYCLE_PAGE_SIZE).map((cycle) => ({
      markActivityId: cycle.mark_activity_id,
      bikeId: cycle.bike_id,
      cycleStartedAt: cycle.cycle_started_at,
      cycleEndedAt: cycle.cycle_ended_at,
      distanceMeters: cycle.distance_meters,
      isOpen: cycle.is_open,
    })),
    hasMore: cycles.length > CYCLE_PAGE_SIZE,
  };
}

export async function readBikeStatuses(db: DatabaseClient, userId: string) {
  const statuses: {
    bikeId: string;
    chainId: string;
    chainName: string;
    activeDistanceMeters: number;
    thresholdKm: number | null;
    status: "active" | "stopped" | "not_started";
  }[] = [];
  const metrics = new Map<
    string,
    {
      name: string;
      active_distance_meters: number;
      threshold_km: number | null;
      status: "active" | "stopped" | "not_started";
    }
  >();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("chain_metrics")
      .select("id, name, active_distance_meters, threshold_km, status")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data) metrics.set(row.id, row);
    if (data.length < PAGE_SIZE) break;
  }
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("bike_chain_status")
      .select("bike_id, chain_id")
      .eq("user_id", userId)
      .order("bike_id", { ascending: true })
      .order("chain_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data) {
      const metric = metrics.get(row.chain_id);
      if (!metric) throw new Error("Bike status references an unavailable chain.");
      statuses.push({
        bikeId: row.bike_id,
        chainId: row.chain_id,
        chainName: metric.name,
        activeDistanceMeters: metric.active_distance_meters,
        thresholdKm: metric.threshold_km,
        status: metric.status,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return statuses;
}
