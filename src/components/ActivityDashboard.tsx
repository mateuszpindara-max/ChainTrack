import { useState, useSyncExternalStore } from "react";
import { formatDistanceKm, formatLocalActivityDate, type ActivityView } from "@/lib/strava/activity-view.ts";
import {
  activeRunAfterSync,
  activitiesAfterSync,
  buildStravaSyncRequest,
  syncCountSummary,
  syncResultMessage,
  type ActiveStravaSyncRun,
  type InitialImportResponse,
  type StravaSyncResponse,
} from "@/lib/strava/sync-contract.ts";

type ImportResponse = InitialImportResponse & Partial<StravaSyncResponse>;
type ActiveSyncRun = ActiveStravaSyncRun;

interface ActivityPage {
  activities: ActivityView[];
  hasMore: boolean;
}

interface Props {
  connectionStatus: "connected" | "not-connected" | "unavailable";
  initialActivities: ActivityView[];
  initialLoadError: boolean;
  initialHasMoreActivities: boolean;
  initialImportCompleted: boolean;
  initialActiveSyncRun: ActiveSyncRun | null;
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
    (response.removed === undefined || typeof response.removed === "number") &&
    (response.mode === undefined || response.mode === "new" || response.mode === "repair") &&
    (response.runId === undefined || typeof response.runId === "string") &&
    (response.nextPage === undefined || typeof response.nextPage === "number") &&
    (response.status === undefined ||
      response.status === "running" ||
      response.status === "partial" ||
      response.status === "completed") &&
    (response.message === undefined || typeof response.message === "string") &&
    (response.activities === undefined || Array.isArray(response.activities))
  );
}

function isActivityPage(value: unknown): value is ActivityPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.activities) && typeof page.hasMore === "boolean";
}

function LocalActivityDate({ value }: { value: string }) {
  const date = useSyncExternalStore(
    subscribeToLocalTimeZone,
    () => formatLocalActivityDate(value),
    () => formatLocalActivityDate(value, "en-US", "UTC"),
  );

  return <time dateTime={value}>{date}</time>;
}

export default function ActivityDashboard({
  connectionStatus,
  initialActivities,
  initialLoadError,
  initialHasMoreActivities,
  initialImportCompleted,
  initialActiveSyncRun,
}: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(initialHasMoreActivities);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [importCompleted, setImportCompleted] = useState(initialImportCompleted);
  const [importBatchHasMore, setImportBatchHasMore] = useState(false);
  const [activeSyncRun, setActiveSyncRun] = useState(initialActiveSyncRun);
  const [loadingAction, setLoadingAction] = useState<"initial" | "new" | "repair" | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function importActivities() {
    setLoading(true);
    setLoadingAction("initial");
    setResult(null);
    try {
      const response = await fetch("/api/strava/import", { method: "POST" });
      const payload: unknown = await response.json();
      if (!isImportResponse(payload)) throw new Error("The activity import returned an invalid response.");
      if (!response.ok) throw new Error(payload.message ?? "The activity import could not be started.");
      setResult(payload);
      if (payload.activities) setActivities(payload.activities);
      if (payload.hasMoreActivities !== undefined) setHasMoreActivities(payload.hasMoreActivities);
      if (payload.outcome === "complete") {
        setImportCompleted(true);
        setImportBatchHasMore(false);
      } else if (payload.outcome === "partial" && payload.message?.startsWith("This import batch is saved.")) {
        setImportBatchHasMore(true);
      } else {
        setImportBatchHasMore(false);
      }
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
      setLoadingAction(null);
    }
  }

  async function synchronizeActivities(mode: "new" | "repair") {
    setLoading(true);
    setLoadingAction(mode);
    setResult(null);
    try {
      const response = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStravaSyncRequest(mode, activeSyncRun)),
      });
      const payload: unknown = await response.json();
      if (!isImportResponse(payload)) throw new Error("The Strava synchronization returned an invalid response.");
      setResult({ ...payload, mode });
      setActivities(activitiesAfterSync(activities, payload));
      if (payload.hasMoreActivities !== undefined) setHasMoreActivities(payload.hasMoreActivities);
      setActiveSyncRun(activeRunAfterSync(mode, payload, activeSyncRun));
    } catch (error) {
      setResult({
        outcome: "failed",
        inserted: 0,
        updated: 0,
        skipped: 0,
        mode,
        message: error instanceof Error ? error.message : "Strava synchronization failed.",
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function loadMoreActivities() {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await fetch(`/api/strava/activities?offset=${activities.length}`);
      const payload: unknown = await response.json();
      if (!isActivityPage(payload)) throw new Error("The activity page returned an invalid response.");
      if (!response.ok) throw new Error("Activities could not be loaded.");
      setActivities((current) => [...current, ...payload.activities]);
      setHasMoreActivities(payload.hasMore);
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "Activities could not be loaded.");
    } finally {
      setLoadingMore(false);
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
        <div className="flex items-center gap-3">
          <a
            href="/chains"
            className="inline-flex min-h-10 items-center rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            Chains
          </a>
          <form method="POST" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              Sign out
            </button>
          </form>
        </div>
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
        {connectionStatus === "connected" && importCompleted ? (
          <details className="relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200">
              Synchronize
            </summary>
            <div className="absolute right-0 z-10 mt-2 grid w-72 max-w-[calc(100vw-2.5rem)] gap-1 rounded-md border border-white/15 bg-slate-950 p-1 shadow-xl">
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  void synchronizeActivities("new");
                }}
                disabled={loading || activeSyncRun?.mode === "repair"}
                className="min-h-10 rounded px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && loadingAction === "new"
                  ? "Synchronizing..."
                  : activeSyncRun?.mode === "new"
                    ? "Continue Import new"
                    : "Import new"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  void synchronizeActivities("repair");
                }}
                disabled={loading || activeSyncRun?.mode === "new"}
                className="grid min-h-10 gap-1 rounded px-3 py-2 text-left text-sm font-medium whitespace-normal text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {loading && loadingAction === "repair"
                    ? "Repairing..."
                    : activeSyncRun?.mode === "repair"
                      ? "Continue full-history repair"
                      : "Repair full history"}
                </span>
                <span className="text-xs leading-snug font-normal text-amber-200">
                  Repair permanently removes local activities Strava confirms as deleted, including their linked data.
                </span>
              </button>
            </div>
          </details>
        ) : connectionStatus === "connected" ? (
          <button
            type="button"
            onClick={importActivities}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Importing activities..." : importBatchHasMore ? "Continue import" : "Import activities"}
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
            {loadingAction === "new"
              ? "Checking Strava for newly visible activities..."
              : loadingAction === "repair"
                ? "Repairing your full Strava history..."
                : "Fetching bike details and activity history from Strava..."}
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
            <p className="text-sm font-medium">{syncResultMessage(result)}</p>
            {(result.outcome !== "failed" || result.mode === "new" || result.mode === "repair") && (
              <p className="mt-1 text-sm text-blue-100/70">{syncCountSummary(result)}</p>
            )}
            {result.skipped > 0 && (
              <p className="mt-2 text-sm text-blue-100/70">
                {result.mode === "repair"
                  ? `${result.skipped} ${result.skipped === 1 ? "activity remains" : "activities remain"} hidden because no unambiguous bike was found.`
                  : `${result.skipped} ${result.skipped === 1 ? "activity was" : "activities were"} skipped because no matching bike was found.`}
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
        {loadMoreError && (
          <p className="py-4 text-sm text-amber-200" role="status">
            {loadMoreError}
          </p>
        )}
        {hasMoreActivities && (
          <button
            type="button"
            onClick={loadMoreActivities}
            disabled={loadingMore}
            className="mt-5 min-h-10 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? "Loading activities..." : "Load more"}
          </button>
        )}
      </section>
    </main>
  );
}
