export interface ActivityRow {
  id: string;
  name: string;
  distance_meters: number;
  started_at: string;
  bike_id: string;
  chain_id?: string | null;
  chain_name?: string | null;
  is_waxing_start?: boolean;
}

export interface BikeRow {
  id: string;
  name: string;
}

export interface ActivityView {
  id: string;
  name: string;
  distanceMeters: number;
  startedAt: string;
  bikeName: string;
  chainId: string | null;
  chainName: string | null;
  isWaxingStart: boolean;
}

export function toActivityViews(activities: ActivityRow[], bikes: BikeRow[]): ActivityView[] {
  const bikeNames = new Map(bikes.map((bike) => [bike.id, bike.name]));
  return activities
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      distanceMeters: activity.distance_meters,
      startedAt: activity.started_at,
      bikeName: bikeNames.get(activity.bike_id) ?? "Unknown bike",
      chainId: activity.chain_id ?? null,
      chainName: activity.chain_name ?? null,
      isWaxingStart: activity.is_waxing_start ?? false,
    }))
    .sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));
}

export function formatDistanceKm(distanceMeters: number, locale = "en-US"): string {
  const distance = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    distanceMeters / 1000,
  );
  return `${distance} km`;
}

export function formatLocalActivityDate(startedAt: string, locale = "en-US", timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(startedAt));
}
