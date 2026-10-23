export const DASHBOARD_SUMMARY_PAGE_SIZE = 1_000;
const MAX_INTERVAL_MILLISECONDS = 367 * 24 * 60 * 60 * 1_000;
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

export interface DashboardSummaryInterval {
  start: string;
  end: string;
}

export interface DashboardSummaryActivity {
  id: string;
  bike_id: string | null;
  distance_meters: number;
  started_at: string;
}

export interface DashboardSummaryStore {
  readActivities(input: {
    userId: string;
    start: string;
    end: string;
    offset: number;
    limit: number;
  }): Promise<DashboardSummaryActivity[]>;
}

export interface DashboardSummary {
  bikesRidden: number;
  distanceMeters: number;
}

function isValidIsoTimestamp(value: string): boolean {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return true;
}

export function parseDashboardSummaryInterval(
  start: string | null,
  end: string | null,
): DashboardSummaryInterval | null {
  if (!start || !end || !isValidIsoTimestamp(start) || !isValidIsoTimestamp(end)) return null;
  const startMilliseconds = Date.parse(start);
  const endMilliseconds = Date.parse(end);
  if (startMilliseconds >= endMilliseconds || endMilliseconds - startMilliseconds > MAX_INTERVAL_MILLISECONDS)
    return null;
  return { start, end };
}

export function getLocalYearInterval(now: Date = new Date()): DashboardSummaryInterval {
  const year = now.getFullYear();
  return {
    start: new Date(year, 0, 1).toISOString(),
    end: new Date(year + 1, 0, 1).toISOString(),
  };
}

export async function summarizeDashboardActivities(
  store: DashboardSummaryStore,
  userId: string,
  interval: DashboardSummaryInterval,
): Promise<DashboardSummary> {
  const bikeIds = new Set<string>();
  let distanceMeters = 0;

  for (let offset = 0; ; offset += DASHBOARD_SUMMARY_PAGE_SIZE) {
    const activities = await store.readActivities({
      userId,
      start: interval.start,
      end: interval.end,
      offset,
      limit: DASHBOARD_SUMMARY_PAGE_SIZE,
    });
    for (const activity of activities) {
      if (activity.bike_id === null) continue;
      bikeIds.add(activity.bike_id);
      distanceMeters += activity.distance_meters;
    }
    if (activities.length < DASHBOARD_SUMMARY_PAGE_SIZE) break;
  }

  return { bikesRidden: bikeIds.size, distanceMeters };
}
