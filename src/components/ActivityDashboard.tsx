import { useState, useSyncExternalStore } from "react";
import { formatDistanceKm, formatLocalActivityDate, type ActivityView } from "@/lib/strava/activity-view.ts";

interface ImportResponse {
  outcome: "complete" | "partial" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  message?: string;
  activities?: ActivityView[];
}

interface Props {
  connectionStatus: "connected" | "not-connected" | "unavailable";
  initialActivities: ActivityView[];
  initialLoadError: boolean;
}

const subscribeToLocalTimeZone = (_onChange: () => void) => () => undefined;

function isImportResponse(value: unknown): value is ImportResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    (response.outcome === "complete" || response.outcome === "partial" || response.outcome === "failed") &&
    typeof response.inserted === "number" &&
    typeof response.updated === "number" &&
    typeof response.skipped === "number" &&
    (response.message === undefined || typeof response.message === "string") &&
    (response.activities === undefined || Array.isArray(response.activities))
  );
}

function LocalActivityDate({ value }: { value: string }) {
  const date = useSyncExternalStore(
    subscribeToLocalTimeZone,
    () => formatLocalActivityDate(value),
    () => formatLocalActivityDate(value, "en-US", "UTC"),
  );

  return <time dateTime={value}>{date}</time>;
}

function resultMessage(result: ImportResponse): string {
  if (result.outcome === "partial")
    return result.message ?? "The import stopped early. Saved activities are safe to retry.";
  if (result.outcome === "failed") return result.message ?? "The activity import failed. Please try again.";
  if (result.inserted === 0 && result.updated === 0 && result.activities?.length === 0) {
    return "Import complete. No bike-linked activities were found.";
  }
  return "Import complete. Your bike-linked history is up to date.";
}

export default function ActivityDashboard({ connectionStatus, initialActivities, initialLoadError }: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function importActivities() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/strava/import", { method: "POST" });
      const payload: unknown = await response.json();
      if (!isImportResponse(payload)) throw new Error("The activity import returned an invalid response.");
      if (!response.ok) throw new Error(payload.message ?? "The activity import could not be started.");
      setResult(payload);
      if (payload.activities) setActivities(payload.activities);
    } catch (error) {
      setResult({
        outcome: "failed",
        inserted: 0,
        updated: 0,
        skipped: 0,
        message: error instanceof Error ? error.message : "The activity import could not be completed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 text-white sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-white/15 pb-8">
        <div>
          <p className="text-sm font-semibold text-orange-300 uppercase">ChainTrack</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your rides</h1>
          <p className="mt-2 text-sm text-blue-100/70">Bike-linked activity history from Strava</p>
        </div>
        <form method="POST" action="/api/auth/signout">
          <button
            type="submit"
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col justify-between gap-5 border-b border-white/15 py-7 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold text-blue-100/55 uppercase">Strava connection</p>
          <p className="mt-2 flex items-center gap-2 text-base font-medium">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connectionStatus === "connected" ? "bg-emerald-400" : "bg-white/35"}`}
            />
            {connectionStatus === "connected"
              ? "Connected"
              : connectionStatus === "not-connected"
                ? "Not connected"
                : "Connection status unavailable"}
          </p>
        </div>
        {connectionStatus === "connected" ? (
          <button
            type="button"
            onClick={importActivities}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Importing activities..." : "Import activities"}
          </button>
        ) : connectionStatus === "not-connected" ? (
          <a
            href="/api/strava/connect"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200"
          >
            Connect Strava
          </a>
        ) : null}
      </section>

      <section className="py-7" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/15 pb-4">
          <div>
            <p className="text-xs font-semibold text-blue-100/55 uppercase">History</p>
            <h2 id="activity-heading" className="mt-2 text-xl font-semibold">
              Activities
            </h2>
          </div>
          <p className="text-sm text-blue-100/60">
            {activities.length} {activities.length === 1 ? "activity" : "activities"}
          </p>
        </div>

        {loading && (
          <p className="border-b border-white/10 py-4 text-sm text-blue-100" role="status" aria-live="polite">
            Fetching bike details and activity history from Strava...
          </p>
        )}
        {initialLoadError && (
          <p className="border-b border-white/10 py-4 text-sm text-amber-200" role="status">
            Activities could not be loaded. You can retry by importing history.
          </p>
        )}
        {result && (
          <div
            className={`border-b border-white/10 py-4 ${result.outcome === "failed" ? "text-rose-200" : result.outcome === "partial" ? "text-amber-200" : "text-emerald-200"}`}
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium">{resultMessage(result)}</p>
            {result.outcome !== "failed" && (
              <p className="mt-1 text-sm text-blue-100/70">
                {result.inserted} new, {result.updated} updated, {result.skipped} skipped
              </p>
            )}
            {result.skipped > 0 && (
              <p className="mt-2 text-sm text-blue-100/70">
                {result.skipped} {result.skipped === 1 ? "activity was" : "activities were"} skipped because no matching
                bike was found.
              </p>
            )}
          </div>
        )}

        {activities.length === 0 ? (
          <p className="py-8 text-sm text-blue-100/65">
            {result?.outcome === "complete"
              ? "No bike-linked activities were found in your Strava history."
              : "No imported activities yet."}
          </p>
        ) : (
          <ul className="divide-y divide-white/10">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="grid gap-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-base font-medium text-white">{activity.name}</h3>
                  <p className="mt-1 text-sm text-blue-100/60">{activity.bikeName}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-blue-100/75 sm:justify-end">
                  <span className="font-medium text-white">{formatDistanceKm(activity.distanceMeters)}</span>
                  <LocalActivityDate value={activity.startedAt} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
