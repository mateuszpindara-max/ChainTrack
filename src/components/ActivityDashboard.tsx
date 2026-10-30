import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Menu, Sparkles, X } from "lucide-react";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChainDetails from "@/components/ChainDetails";
import ChainManager from "@/components/ChainManager";
import YearSummary from "@/components/YearSummary";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/components/hooks/useDashboardData";
import type { LifecycleChainView } from "@/lib/chains/chain.ts";
import { formatDistanceKm, formatLocalActivityDate, type ActivityView } from "@/lib/strava/activity-view.ts";
import type { BikeRow } from "@/lib/strava/activity-view.ts";
import {
  activeRunAfterSync,
  buildStravaSyncRequest,
  INVALID_STRAVA_SYNC_RESPONSE_MESSAGE,
  shouldOfferStravaReauthorization,
  stravaCallbackMessage,
  syncCountSummary,
  syncResultMessage,
  type ActiveStravaSyncRun,
  type InitialImportResponse,
  type StravaCallbackStatus,
  type StravaSyncResponse,
} from "@/lib/strava/sync-contract.ts";

type ImportResponse = InitialImportResponse & Partial<StravaSyncResponse>;
type ActiveSyncRun = ActiveStravaSyncRun;

interface Props {
  connectionStatus: "connected" | "not-connected" | "unavailable";
  callbackStatus: StravaCallbackStatus | null;
  initialBikes: BikeRow[];
  initialBikesHasMore: boolean;
  initialBikesError: boolean;
  initialChains: LifecycleChainView[];
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
    (response.authorizationFailure === undefined || response.authorizationFailure === true) &&
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
  callbackStatus,
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
  const waxingSelectRefs = useRef(new Map<string, HTMLSelectElement>());
  const waxingActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const waxingFocusRequest = useRef<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const selection = data.dashboard.selection;
  const selectedBikeId = selection.kind === "activities" ? selection.bikeId : null;
  const selectedBikeTitle =
    selectedBikeId !== null
      ? (data.bikes.items.find((bike) => bike.id === selectedBikeId)?.name ?? "Selected bike")
      : "All bikes";
  const callbackMessage = stravaCallbackMessage(callbackStatus);
  const showReauthorization = shouldOfferStravaReauthorization(
    connectionStatus,
    result?.authorizationFailure === true,
    result?.message,
    callbackStatus,
  );

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  useEffect(() => {
    if (editingActivityId === null) return;
    waxingSelectRefs.current.get(editingActivityId)?.focus();
  }, [editingActivityId]);

  useEffect(() => {
    const activityId = waxingFocusRequest.current;
    if (data.waxingMarkSave.isBusy || activityId === null) return;
    waxingFocusRequest.current = null;
    if (data.waxingMarkSave.error === null) {
      setEditingActivityId((current) => (current === activityId ? null : current));
    }
    waxingActionRefs.current.get(activityId)?.focus();
  }, [data.waxingMarkSave.error, data.waxingMarkSave.isBusy]);

  function closeDrawer() {
    setDrawerOpen(false);
    drawerRef.current?.close();
    drawerTriggerRef.current?.focus();
  }

  function refreshAfterChainMutation() {
    data.refreshAfterSavedChanges({ outcome: "complete", inserted: 0, updated: 0 });
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
        data.refreshAfterSavedChanges(payload);
        setResult(payload);
        return;
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
      if (!isImportResponse(payload)) throw new Error(INVALID_STRAVA_SYNC_RESPONSE_MESSAGE);
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
    <main className="text-foreground mx-auto min-h-screen w-full max-w-[90rem] px-5 py-6 sm:px-8 sm:py-10">
      <header className="border-border flex flex-wrap items-start justify-between gap-5 border-b pb-6">
        <div>
          <p className="text-primary text-sm font-semibold uppercase">ChainTrack</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your rides</h1>
          <p className="text-muted-foreground/80 mt-2 text-sm">Bike-linked activity history from Strava</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            ref={drawerTriggerRef}
            type="button"
            onClick={() => {
              setDrawerOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="dashboard-navigation-dialog"
            variant="outline"
            className="min-h-10 md:hidden"
          >
            <Menu aria-hidden="true" size={18} />
            Menu
          </Button>
          <form method="POST" action="/api/auth/signout">
            <Button type="submit" variant="outline" className="min-h-10">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <section className="border-border flex flex-col justify-between gap-5 border-b py-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-muted-foreground/70 text-xs font-semibold uppercase">Strava connection</p>
          <p className="mt-2 flex items-center gap-2 text-base font-medium">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connectionStatus === "connected" ? "bg-success" : "bg-muted-foreground/35"}`}
            />
            {connectionStatus === "connected"
              ? "Connected"
              : connectionStatus === "not-connected"
                ? "Not connected"
                : "Connection status unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showReauthorization && (
            <Button asChild variant="outline" className="border-primary/60 text-primary hover:bg-primary/10 min-h-11">
              <a href="/api/strava/connect">Reauthorize Strava</a>
            </Button>
          )}
          {connectionStatus === "connected" && importCompleted ? (
            <details className="relative">
              <summary className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                Synchronize
              </summary>
              <div className="border-border bg-popover absolute right-0 z-10 mt-2 grid w-72 max-w-[calc(100vw-2.5rem)] gap-1 rounded-md border p-1 shadow-xl">
                <Button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    void synchronizeActivities("new");
                  }}
                  disabled={loading || activeSyncRun?.mode === "repair"}
                  variant="ghost"
                  className="min-h-10 w-full justify-start text-left"
                >
                  {loading && loadingAction === "new"
                    ? "Synchronizing..."
                    : activeSyncRun?.mode === "new"
                      ? "Continue Import new"
                      : "Import new"}
                </Button>
                <Button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    void synchronizeActivities("repair");
                  }}
                  disabled={loading || activeSyncRun?.mode === "new"}
                  variant="ghost"
                  className="h-auto min-h-10 w-full justify-items-start gap-1 text-left whitespace-normal"
                >
                  <span>
                    {loading && loadingAction === "repair"
                      ? "Repairing..."
                      : activeSyncRun?.mode === "repair"
                        ? "Continue full-history repair"
                        : "Repair full history"}
                  </span>
                  <span className="text-warning text-xs leading-snug font-normal">
                    Repair permanently removes local activities Strava confirms as deleted, including their linked data.
                  </span>
                </Button>
              </div>
            </details>
          ) : connectionStatus === "connected" ? (
            <Button type="button" onClick={importActivities} disabled={loading} size="lg" className="min-h-11">
              {loading ? "Importing activities..." : importBatchHasMore ? "Continue import" : "Import activities"}
            </Button>
          ) : connectionStatus === "not-connected" ? (
            <Button asChild size="lg" className="min-h-11">
              <a href="/api/strava/connect">Connect Strava</a>
            </Button>
          ) : null}
        </div>
      </section>

      {callbackMessage && (
        <p
          className={`border-border/70 border-b py-4 text-sm ${callbackStatus === "connected" ? "text-success" : "text-warning"}`}
          role="status"
          aria-live="polite"
        >
          {callbackMessage}
        </p>
      )}
      {loading && (
        <p className="border-border/70 text-muted-foreground border-b py-4 text-sm" role="status" aria-live="polite">
          {loadingAction === "new"
            ? "Checking Strava for newly visible activities..."
            : loadingAction === "repair"
              ? "Repairing your full Strava history..."
              : "Fetching bike details and activity history from Strava..."}
        </p>
      )}
      {result && (
        <div
          className={`border-border/70 border-b py-4 ${result.outcome === "failed" ? "text-destructive" : result.outcome === "partial" ? "text-warning" : "text-success"}`}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium">{syncResultMessage(result)}</p>
          {(result.outcome !== "failed" || result.mode === "new" || result.mode === "repair") && (
            <p className="text-muted-foreground/80 mt-1 text-sm">{syncCountSummary(result)}</p>
          )}
          {result.skipped > 0 && (
            <p className="text-muted-foreground/80 mt-2 text-sm">
              {result.mode === "repair"
                ? `${result.skipped} ${result.skipped === 1 ? "activity remains" : "activities remain"} hidden because no unambiguous bike was found.`
                : `${result.skipped} ${result.skipped === 1 ? "activity was" : "activities were"} skipped because no matching bike was found.`}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
        <aside className="border-border/70 hidden border-r py-8 pr-5 md:block">
          <DashboardSidebar
            selection={data.dashboard.selection}
            bikes={data.bikes}
            chains={data.chains}
            bikeStatuses={data.bikeStatuses}
            onSelectSummary={data.selectSummary}
            onSelectAllBikes={data.selectAllBikes}
            onSelectBike={data.selectBike}
            onSelectChain={data.selectChain}
            onSelectManageChains={data.selectManageChains}
            onRetryLifecycle={data.retryLifecycle}
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
          ) : selection.kind === "chain" ? (
            <ChainDetails
              key={selection.chainId}
              metrics={data.chainMetrics}
              onRetry={data.retryLifecycle}
              onLoadMore={data.loadMoreCycles}
              onMutation={refreshAfterChainMutation}
            />
          ) : selection.kind === "manage-chains" ? (
            <ChainManager
              embedded
              initialChains={data.chains.items}
              initialHasMore={data.chains.hasMore}
              initialLoadError={Boolean(data.chains.error)}
              onMutation={refreshAfterChainMutation}
            />
          ) : (
            <section aria-labelledby="activity-heading">
              <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-muted-foreground/70 text-xs font-semibold uppercase">History</p>
                  <h2 id="activity-heading" className="mt-2 text-xl font-semibold">
                    {selectedBikeTitle}
                  </h2>
                </div>
                {data.dashboard.activityStatus === "ready" && (
                  <p className="text-muted-foreground/75 text-sm">
                    {data.dashboard.activities.length}{" "}
                    {data.dashboard.activities.length === 1 ? "activity" : "activities"}
                  </p>
                )}
              </div>
              {selectedBikeId !== null && (
                <div className="border-border/70 grid gap-2 border-b py-4 sm:max-w-md">
                  <label htmlFor="activity-chain-filter" className="text-muted-foreground/90 text-sm font-medium">
                    Filter by chain
                  </label>
                  <select
                    id="activity-chain-filter"
                    value={selection.kind === "activities" ? (selection.chainId ?? "all") : "all"}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      data.selectChainFilter(value === "all" ? null : value);
                    }}
                    disabled={data.chains.loading}
                    aria-describedby={
                      data.chains.loading
                        ? "activity-chain-filter-loading"
                        : data.chains.error
                          ? "activity-chain-filter-error"
                          : undefined
                    }
                    className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 w-full rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                  >
                    <option value="all">All chains</option>
                    {data.chains.items.map((chain) => (
                      <option key={chain.id} value={chain.id}>
                        {chain.name}
                      </option>
                    ))}
                    <option value="none">No chain</option>
                  </select>
                  {data.chains.loading && (
                    <p
                      id="activity-chain-filter-loading"
                      className="text-muted-foreground/80 text-sm"
                      role="status"
                      aria-live="polite"
                    >
                      Loading chains...
                    </p>
                  )}
                  {data.chains.error && (
                    <div id="activity-chain-filter-error" className="text-warning text-sm" role="alert">
                      <p>{data.chains.error}</p>
                      <Button type="button" variant="link" onClick={data.retryChains} className="mt-1 min-h-10 px-2">
                        Retry chains
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {data.dashboard.activityStatus === "loading" && (
                <p className="text-muted-foreground/80 py-6 text-sm" role="status">
                  Loading activities...
                </p>
              )}
              {data.dashboard.activityStatus === "error" && (
                <div className="text-warning py-6 text-sm" role="alert">
                  <p>{data.dashboard.activityError}</p>
                  <Button type="button" variant="link" onClick={data.retryActivities} className="mt-2 min-h-10 px-3">
                    Retry activities
                  </Button>
                </div>
              )}
              {data.dashboard.activityStatus === "ready" && data.dashboard.activities.length === 0 && (
                <p className="text-muted-foreground/80 py-8 text-sm">
                  {selectedBikeId !== null
                    ? selection.kind === "activities" && selection.chainId !== null
                      ? "No activities match this chain filter."
                      : "No visible activities for this bike yet."
                    : "No bike-linked activities yet."}
                </p>
              )}
              {data.dashboard.activities.length > 0 && (
                <ul className="divide-border/70 divide-y">
                  {data.dashboard.activities.map((activity: ActivityView) => (
                    <li key={activity.id} className="grid gap-2.5 py-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-foreground min-w-0 flex-1 truncate text-base font-medium">
                            {activity.name}
                          </h3>
                          <span className="text-muted-foreground/75 shrink-0 text-sm">
                            <LocalActivityDate value={activity.startedAt} />
                          </span>
                        </div>
                        <Button
                          ref={(element) => {
                            if (element) waxingActionRefs.current.set(activity.id, element);
                            else {
                              waxingActionRefs.current.delete(activity.id);
                            }
                          }}
                          type="button"
                          onClick={() => {
                            setEditingActivityId((current) => (current === activity.id ? null : activity.id));
                          }}
                          aria-label={`${editingActivityId === activity.id ? "Close" : "Edit"} fresh-wax mark for ${activity.name}`}
                          aria-expanded={editingActivityId === activity.id}
                          aria-controls={
                            editingActivityId === activity.id ? `waxing-mark-editor-${activity.id}` : undefined
                          }
                          title={`${editingActivityId === activity.id ? "Close" : "Edit"} fresh-wax mark`}
                          disabled={data.waxingMarkSave.isBusy}
                          variant="outline"
                          size="icon"
                          className="text-primary size-10 shrink-0"
                        >
                          <Sparkles aria-hidden="true" size={17} />
                        </Button>
                      </div>
                      <div>
                        <span className="border-border bg-accent/50 text-muted-foreground/90 inline-flex max-w-full items-center rounded-sm border px-2 py-0.5 text-xs font-medium">
                          {activity.bikeName}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 sm:gap-x-5">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <dt className="text-muted-foreground/70 shrink-0 text-xs font-medium">Chain</dt>
                          <dd className="min-w-0">
                            <span
                              className="border-border bg-accent/50 text-foreground inline-flex max-w-full truncate rounded-sm border px-1.5 py-0.5 text-xs font-medium"
                              title={
                                activity.isWaxingStart && activity.chainId === null
                                  ? "Chain removed"
                                  : (activity.chainName ?? "No chain")
                              }
                            >
                              {activity.isWaxingStart && activity.chainId === null
                                ? "Chain removed"
                                : (activity.chainName ?? "No chain")}
                            </span>
                          </dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <dt className="text-muted-foreground/70 shrink-0 text-xs font-medium">Fresh wax</dt>
                          <dd>
                            <span className="border-primary/30 bg-primary/10 text-primary inline-flex rounded-sm border px-1.5 py-0.5 text-xs font-medium">
                              {activity.isWaxingStart ? "Marked" : "Not marked"}
                            </span>
                          </dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <dt className="text-muted-foreground/70 shrink-0 text-xs font-medium">Ride</dt>
                          <dd className="text-foreground text-right text-sm font-medium">
                            {formatDistanceKm(activity.distanceMeters)}
                          </dd>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <dt className="text-muted-foreground/70 shrink-0 text-xs font-medium">Bike total</dt>
                          <dd className="text-foreground text-right text-sm font-medium">
                            {activity.cumulativeDistanceMeters == null
                              ? "N/A"
                              : formatDistanceKm(activity.cumulativeDistanceMeters)}
                          </dd>
                        </div>
                      </dl>
                      {editingActivityId === activity.id && (
                        <div id={`waxing-mark-editor-${activity.id}`} className="grid gap-1 sm:max-w-sm">
                          <label
                            htmlFor={`waxing-mark-${activity.id}`}
                            className="text-muted-foreground/90 text-sm font-medium"
                          >
                            Fresh-wax mark for {activity.name}
                          </label>
                          <select
                            ref={(element) => {
                              if (element) waxingSelectRefs.current.set(activity.id, element);
                              else waxingSelectRefs.current.delete(activity.id);
                            }}
                            id={`waxing-mark-${activity.id}`}
                            value={activity.isWaxingStart ? (activity.chainId ?? "chain-removed") : ""}
                            onChange={(event) => {
                              waxingFocusRequest.current = activity.id;
                              void data.saveWaxingMark(activity.id, event.currentTarget.value || null);
                            }}
                            disabled={data.waxingMarkSave.isBusy}
                            aria-busy={data.waxingMarkSave.isBusy}
                            aria-describedby={
                              data.waxingMarkSave.activityId === activity.id && data.waxingMarkSave.error
                                ? `waxing-mark-error-${activity.id}`
                                : undefined
                            }
                            className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 w-full rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                          >
                            <option value="">Not a fresh-wax ride</option>
                            {activity.isWaxingStart && activity.chainId === null && (
                              <option value="chain-removed" disabled>
                                Chain removed
                              </option>
                            )}
                            {data.chains.items.map((chain) => (
                              <option key={chain.id} value={chain.id}>
                                {chain.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {data.waxingMarkSave.activityId === activity.id &&
                        (data.waxingMarkSave.phase === "saving" || data.waxingMarkSave.phase === "refreshing") && (
                          <p className="text-muted-foreground/80 text-sm" role="status" aria-live="polite">
                            {data.waxingMarkSave.phase === "saving"
                              ? "Saving fresh-wax mark..."
                              : "Refreshing rides..."}
                          </p>
                        )}
                      {data.waxingMarkSave.activityId === activity.id && data.waxingMarkSave.error && (
                        <div id={`waxing-mark-error-${activity.id}`} className="text-destructive text-sm" role="alert">
                          <p>{data.waxingMarkSave.error}</p>
                          {data.waxingMarkSave.canRetryRefresh && (
                            <Button
                              type="button"
                              variant="link"
                              onClick={() => {
                                waxingFocusRequest.current = activity.id;
                                void data.retryWaxingRefresh();
                              }}
                              className="mt-1 min-h-10 px-2"
                            >
                              Retry refresh
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.dashboard.loadMoreError && (
                <p className="text-warning py-4 text-sm" role="alert">
                  {data.dashboard.loadMoreError}
                </p>
              )}
              {data.dashboard.hasMoreActivities && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={data.loadMoreActivities}
                  disabled={data.dashboard.loadingMoreActivities}
                  className="mt-5 min-h-10"
                >
                  {data.dashboard.loadingMoreActivities ? "Loading activities..." : "Load more"}
                </Button>
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
        className="border-border bg-popover text-popover-foreground backdrop:bg-background/70 fixed inset-y-0 left-0 m-0 h-full max-h-none w-[min(22rem,calc(100vw-2.5rem))] max-w-none border-r p-5 md:hidden"
      >
        <div className="border-border mb-6 flex items-center justify-between border-b pb-4">
          <p className="text-primary text-sm font-semibold">Navigation</p>
          <Button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            variant="outline"
            size="icon"
            className="size-10"
          >
            <X aria-hidden="true" size={18} />
          </Button>
        </div>
        <DashboardSidebar
          selection={data.dashboard.selection}
          bikes={data.bikes}
          chains={data.chains}
          bikeStatuses={data.bikeStatuses}
          onSelectSummary={data.selectSummary}
          onSelectAllBikes={data.selectAllBikes}
          onSelectBike={data.selectBike}
          onSelectChain={data.selectChain}
          onSelectManageChains={data.selectManageChains}
          onRetryLifecycle={data.retryLifecycle}
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
