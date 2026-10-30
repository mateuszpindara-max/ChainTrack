import { isLifecycleChainView, type LifecycleChainView } from "./chain.ts";
import { effectiveThresholdKm, SUGGESTED_THRESHOLD_KM, wearLevel, wearPercent } from "./lifecycle.ts";

export interface ChainCycle {
  markActivityId: string;
  bikeId: string;
  cycleStartedAt: string;
  cycleEndedAt: string | null;
  distanceMeters: number;
  isOpen: boolean;
}

export interface ChainMetricsPage {
  chain: LifecycleChainView;
  cycles: ChainCycle[];
  hasMore: boolean;
}

export interface BikeStatus {
  chainName: string;
  level: ReturnType<typeof wearLevel>;
  percent: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isChainMetricsPage(value: unknown): value is ChainMetricsPage {
  return (
    isRecord(value) &&
    isLifecycleChainView(value.chain) &&
    typeof value.hasMore === "boolean" &&
    Array.isArray(value.cycles) &&
    value.cycles.every(
      (cycle: unknown) =>
        isRecord(cycle) &&
        typeof cycle.markActivityId === "string" &&
        typeof cycle.bikeId === "string" &&
        typeof cycle.cycleStartedAt === "string" &&
        (cycle.cycleEndedAt === null || typeof cycle.cycleEndedAt === "string") &&
        typeof cycle.distanceMeters === "number" &&
        Number.isFinite(cycle.distanceMeters) &&
        typeof cycle.isOpen === "boolean",
    )
  );
}

export function parseBikeStatuses(value: unknown): Partial<Record<string, BikeStatus>> | null {
  if (!isRecord(value) || !Array.isArray(value.statuses)) return null;
  const statuses: Partial<Record<string, BikeStatus>> = {};
  for (const item of value.statuses as unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.bikeId !== "string" ||
      typeof item.chainId !== "string" ||
      typeof item.chainName !== "string" ||
      typeof item.activeDistanceMeters !== "number" ||
      !Number.isFinite(item.activeDistanceMeters) ||
      !(
        item.thresholdKm === null ||
        (typeof item.thresholdKm === "number" && Number.isFinite(item.thresholdKm) && item.thresholdKm > 0)
      ) ||
      !(item.status === "active" || item.status === "stopped" || item.status === "not_started")
    )
      return null;
    const threshold = effectiveThresholdKm(item.thresholdKm, SUGGESTED_THRESHOLD_KM);
    statuses[item.bikeId] = {
      chainName: item.chainName,
      level: wearLevel(item.activeDistanceMeters, threshold),
      percent: wearPercent(item.activeDistanceMeters, threshold),
    };
  }
  return statuses;
}
