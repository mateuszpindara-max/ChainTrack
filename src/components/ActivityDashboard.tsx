import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Menu, X } from "lucide-react";
import DashboardSidebar from "@/components/DashboardSidebar";
import YearSummary from "@/components/YearSummary";
import { useDashboardData } from "@/components/hooks/useDashboardData";
import type { ChainView } from "@/lib/chains/chain.ts";
import { formatDistanceKm, formatLocalActivityDate, type ActivityView } from "@/lib/strava/activity-view.ts";
import type { BikeRow } from "@/lib/strava/activity-view.ts";
import {
  activeRunAfterSync,
  buildStravaSyncRequest,
  syncCountSummary,
  syncResultMessage,
  type ActiveStravaSyncRun,
  type InitialImportResponse,
  type StravaSyncResponse,
} from "@/lib/strava/sync-contract.ts";

type ImportResponse = InitialImportResponse & Partial<StravaSyncResponse>;
type ActiveSyncRun = ActiveStravaSyncRun;

interface Props {
  connectionStatus: "connected" | "not-connected" | "unavailable";
  initialBikes: BikeRow[];
  initialBikesHasMore: boolean;
  initialBikesError: boolean;
  initialChains: ChainView[];
  initialChainsHasMore: boolean;
  initialChainsError: boolean;
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
    (response.savedChanges === undefined || typeof response.savedChanges === "boolean") &&
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
  initialBikes,
  initialBikesHasMore,
  initialBikesError,
  initialChains,
  initialChainsHasMore,
  initialChainsError,
  initialImportCompleted,
  initialActiveSyncRun,
}: Props) {
  const data = useDashboardData({
    initialBikes,
    initialBikesHasMore,
    initialBikesError,
    initialChains,
    initialChainsHasMore,
    initialChainsError,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [importCompleted, setImportCompleted] = useState(initialImportCompleted);
  const [importBatchHasMore, setImportBatchHasMore] = useState(false);
  const [activeSyncRun, setActiveSyncRun] = useState(initialActiveSyncRun);
  const [loadingAction, setLoadingAction] = useState<"initial" | "new" | "repair" | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const selection = data.dashboard.selection;
  const selectedBikeId = selection.kind === "activities" ? selection.bikeId : null;
  const selectedBikeTitle =
    selectedBikeId !== null
      ? (data.bikes.items.find((bike) => bike.id === selectedBikeId)?.name ?? "Selected bike")
      : "All bikes";

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    drawerRef.current?.close();
    drawerTriggerRef.current?.focus();
  }

  async function importActivities() {
    setLoading(true);
    setLoadingAction("initial");
    setResult(null);
    try {
      const response = await fetch("/api/strava/import", { method: "POST" });
      const payload: unknown = await response.json();
      if (!isImportResponse(payload)) throw new Error("The activity import returned an invalid response.");
      if (!response.ok) {
        if (payload.savedChanges) data.refreshAfterSavedChanges(payload);
        throw new Error(payload.message ?? "The activity import could not be started.");
      }
      setResult(payload);
      data.refreshAfterSavedChanges(payload);
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
      data.refreshAfterSavedChanges(payload);
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-[90rem] px-5 py-6 text-white sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/15 pb-6">
        <div>
          <p className="text-sm font-semibold text-orange-300 uppercase">ChainTrack</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your rides</h1>
          <p className="mt-2 text-sm text-blue-100/70">Bike-linked activity history from Strava</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            ref={drawerTriggerRef}
            type="button"
            onClick={() => {
              setDrawerOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="dashboard-navigation-dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 md:hidden"
          >
            <Menu aria-hidden="true" size={18} />
            Menu
          </button>
          <form method="POST" action="/api/auth/signout">
            <button
              type="submit"
              className="min-h-10 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-col justify-between gap-5 border-b border-white/15 py-6 sm:flex-row sm:items-center">
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

      {loading && (
        <p className="border-b border-white/10 py-4 text-sm text-blue-100" role="status" aria-live="polite">
          {loadingAction === "new"
            ? "Checking Strava for newly visible activities..."
            : loadingAction === "repair"
              ? "Repairing your full Strava history..."
              : "Fetching bike details and activity history from Strava..."}
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

      <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
        <aside className="hidden border-r border-white/10 py-8 pr-5 md:block">
          <DashboardSidebar
            selection={data.dashboard.selection}
            bikes={data.bikes}
            chains={data.chains}
            onSelectSummary={data.selectSummary}
            onSelectAllBikes={data.selectAllBikes}
            onSelectBike={data.selectBike}
            onRetryBikes={data.retryBikes}
            onRetryChains={data.retryChains}
            onLoadMoreBikes={data.loadMoreBikes}
            onLoadMoreChains={data.loadMoreChains}
          />
        </aside>

        <section className="min-w-0 py-5 md:py-8" aria-live="polite">
          {data.dashboard.selection.kind === "summary" ? (
            <YearSummary
              year={data.summaryYear}
              summary={data.summary.value}
              loading={data.summary.loading}
              error={data.summary.error}
              onRetry={data.retrySummary}
            />
          ) : (
            <section aria-labelledby="activity-heading">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/15 pb-4">
                <div>
                  <p className="text-xs font-semibold text-blue-100/55 uppercase">History</p>
                  <h2 id="activity-heading" className="mt-2 text-xl font-semibold">
                    {selectedBikeTitle}
                  </h2>
                </div>
                {data.dashboard.activityStatus === "ready" && (
                  <p className="text-sm text-blue-100/60">
                    {data.dashboard.activities.length}{" "}
                    {data.dashboard.activities.length === 1 ? "activity" : "activities"}
                  </p>
                )}
              </div>
              {data.dashboard.activityStatus === "loading" && (
                <p className="py-6 text-sm text-blue-100/70" role="status">
                  Loading activities...
                </p>
              )}
              {data.dashboard.activityStatus === "error" && (
                <div className="py-6 text-sm text-amber-200" role="alert">
                  <p>{data.dashboard.activityError}</p>
                  <button
                    type="button"
                    onClick={data.retryActivities}
                    className="mt-2 min-h-10 rounded px-3 py-2 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                  >
                    Retry activities
                  </button>
                </div>
              )}
              {data.dashboard.activityStatus === "ready" && data.dashboard.activities.length === 0 && (
                <p className="py-8 text-sm text-blue-100/65">
                  {selectedBikeId !== null
                    ? "No visible activities for this bike yet."
                    : "No bike-linked activities yet."}
                </p>
              )}
              {data.dashboard.activities.length > 0 && (
                <ul className="divide-y divide-white/10">
                  {data.dashboard.activities.map((activity: ActivityView) => (
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
              {data.dashboard.loadMoreError && (
                <p className="py-4 text-sm text-amber-200" role="alert">
                  {data.dashboard.loadMoreError}
                </p>
              )}
              {data.dashboard.hasMoreActivities && (
                <button
                  type="button"
                  onClick={data.loadMoreActivities}
                  disabled={data.dashboard.loadingMoreActivities}
                  className="mt-5 min-h-10 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {data.dashboard.loadingMoreActivities ? "Loading activities..." : "Load more"}
                </button>
              )}
            </section>
          )}
        </section>
      </div>

      <dialog
        id="dashboard-navigation-dialog"
        ref={drawerRef}
        onClose={() => {
          setDrawerOpen(false);
          drawerTriggerRef.current?.focus();
        }}
        aria-label="Dashboard navigation"
        className="fixed inset-y-0 left-0 m-0 h-full max-h-none w-[min(22rem,calc(100vw-2.5rem))] max-w-none border-r border-white/15 bg-slate-950 p-5 text-white backdrop:bg-black/65 md:hidden"
      >
        <div className="mb-6 flex items-center justify-between border-b border-white/15 pb-4">
          <p className="text-sm font-semibold text-orange-300">Navigation</p>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            className="grid size-10 place-items-center rounded border border-white/20 text-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <DashboardSidebar
          selection={data.dashboard.selection}
          bikes={data.bikes}
          chains={data.chains}
          onSelectSummary={data.selectSummary}
          onSelectAllBikes={data.selectAllBikes}
          onSelectBike={data.selectBike}
          onRetryBikes={data.retryBikes}
          onRetryChains={data.retryChains}
          onLoadMoreBikes={data.loadMoreBikes}
          onLoadMoreChains={data.loadMoreChains}
          onNavigate={closeDrawer}
        />
      </dialog>
    </main>
  );
}
