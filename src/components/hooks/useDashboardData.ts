import { useEffect, useReducer, useRef, useState } from "react";
import { isLifecycleChainView, type LifecycleChainView } from "@/lib/chains/chain.ts";
import {
  isChainMetricsPage,
  parseBikeStatuses,
  type BikeStatus,
  type ChainMetricsPage,
} from "@/lib/chains/dashboard-lifecycle.ts";
import type { ActivityView, BikeRow } from "@/lib/strava/activity-view.ts";
import { getLocalYearInterval, type DashboardSummary } from "@/lib/strava/dashboard-summary.ts";
import {
  createDashboardState,
  dashboardStateReducer,
  getDashboardRequestKey,
  isCurrentDashboardRequest,
  type DashboardStateAction,
  type DashboardSelection,
  type SavedChangesResult,
} from "@/lib/strava/dashboard-state.ts";
import {
  buildActivityQueryString,
  getActivityRefreshRowCount,
  MAX_DASHBOARD_PAGE_SIZE,
} from "@/lib/strava/dashboard-query.ts";

interface Page<T> {
  items: T[];
  hasMore: boolean;
}

interface DashboardDataOptions {
  initialBikes: BikeRow[];
  initialBikesHasMore: boolean;
  initialBikesError: boolean;
  initialChains: LifecycleChainView[];
  initialChainsHasMore: boolean;
  initialChainsError: boolean;
}

interface DataSection<T> extends Page<T> {
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
}

type ActivitySelection = Extract<DashboardSelection, { kind: "activities" }>;

interface WaxingRefreshContext {
  activityId: string;
  key: ReturnType<typeof getDashboardRequestKey>;
  selection: ActivitySelection;
  rowCount: number;
}

interface WaxingMarkSaveState {
  activityId: string | null;
  phase: "idle" | "saving" | "refreshing" | "error";
  error: string | null;
  canRetryRefresh: boolean;
}

function isPage(
  value: unknown,
  key: "bikes" | "chains",
  isItem: (item: unknown) => boolean,
): value is Record<string, unknown> & { hasMore: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record[key]) && record[key].every(isItem) && typeof record.hasMore === "boolean";
}

function isBike(value: unknown): value is BikeRow {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).name === "string"
  );
}

const isChain = isLifecycleChainView;

function isActivityPage(value: unknown): value is { activities: ActivityView[]; hasMore: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.activities) &&
    page.activities.every((activity) => {
      if (typeof activity !== "object" || activity === null) return false;
      const item = activity as Record<string, unknown>;
      return (
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.distanceMeters === "number" &&
        typeof item.startedAt === "string" &&
        typeof item.bikeName === "string" &&
        (item.chainId === null || typeof item.chainId === "string") &&
        (item.chainName === null || typeof item.chainName === "string") &&
        (item.cumulativeDistanceMeters === null ||
          (typeof item.cumulativeDistanceMeters === "number" && Number.isFinite(item.cumulativeDistanceMeters))) &&
        typeof item.isWaxingStart === "boolean"
      );
    }) &&
    typeof page.hasMore === "boolean"
  );
}

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (typeof value !== "object" || value === null) return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.bikesRidden === "number" && typeof summary.distanceMeters === "number";
}

async function readPayload(response: Response, message: string): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(message);
  }
  if (!response.ok) {
    const responseMessage =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as Record<string, unknown>).message === "string"
        ? (payload as Record<string, string>).message
        : message;
    throw new Error(responseMessage);
  }
  return payload;
}

function initialSection<T>(items: T[], hasMore: boolean, error: boolean): DataSection<T> {
  return {
    items,
    hasMore,
    loading: false,
    error: error ? "Could not load this navigation list." : null,
    loadingMore: false,
    loadMoreError: null,
  };
}

export function useDashboardData(options: DashboardDataOptions) {
  const [dashboard, dispatch] = useReducer(dashboardStateReducer, undefined, createDashboardState);
  const stateRef = useRef(dashboard);
  stateRef.current = dashboard;
  const [summary, setSummary] = useState<{ value: DashboardSummary | null; loading: boolean; error: string | null }>({
    value: null,
    loading: true,
    error: null,
  });
  const [summaryYear, setSummaryYear] = useState<number | null>(null);
  const [bikes, setBikes] = useState(() =>
    initialSection(options.initialBikes, options.initialBikesHasMore, options.initialBikesError),
  );
  const [chains, setChains] = useState(() =>
    initialSection(options.initialChains, options.initialChainsHasMore, options.initialChainsError),
  );
  const bikesRef = useRef(bikes);
  const chainsRef = useRef(chains);
  bikesRef.current = bikes;
  chainsRef.current = chains;
  const [activityRetry, setActivityRetry] = useState(0);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [bikesRetry, setBikesRetry] = useState(0);
  const [chainsRetry, setChainsRetry] = useState(0);
  const [lifecycleRetry, setLifecycleRetry] = useState(0);
  const [bikeStatuses, setBikeStatuses] = useState<{
    items: Partial<Record<string, BikeStatus>>;
    error: string | null;
  }>({
    items: {},
    error: null,
  });
  const [chainMetrics, setChainMetrics] = useState<{
    key: string;
    value: ChainMetricsPage | null;
    loading: boolean;
    error: string | null;
    loadingMore: boolean;
    loadMoreError: string | null;
  }>({ key: "", value: null, loading: false, error: null, loadingMore: false, loadMoreError: null });
  const cycleRequestRef = useRef<AbortController | null>(null);
  const [waxingMarkSave, setWaxingMarkSave] = useState<WaxingMarkSaveState>({
    activityId: null,
    phase: "idle",
    error: null,
    canRetryRefresh: false,
  });
  const waxingOperationRef = useRef(false);
  const waxingRefreshContextRef = useRef<WaxingRefreshContext | null>(null);
  const requestKey = getDashboardRequestKey(dashboard);

  function sendAction(action: DashboardStateAction) {
    stateRef.current = dashboardStateReducer(stateRef.current, action);
    dispatch(action);
  }

  const selectionKey = requestKey.selection;
  const refreshGeneration = requestKey.refreshGeneration;
  const activitySelection = dashboard.selection.kind === "activities" ? dashboard.selection : null;
  const hasActivitySelection = activitySelection !== null;
  const selectedChainId = dashboard.selection.kind === "chain" ? dashboard.selection.chainId : null;
  const metricsKey = `${selectionKey}:${refreshGeneration}`;

  useEffect(() => {
    const key = { selection: selectionKey, refreshGeneration };
    const controller = new AbortController();
    void (async () => {
      try {
        const payload = await readPayload(
          await fetch("/api/chains/bike-status", { signal: controller.signal }),
          "Bike status could not be loaded.",
        );
        const items = parseBikeStatuses(payload);
        if (!items) throw new Error("Bike status returned an invalid response.");
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key))
          setBikeStatuses({ items, error: null });
      } catch (error) {
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setBikeStatuses({
            items: {},
            error: error instanceof Error ? error.message : "Bike status could not be loaded.",
          });
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectionKey, refreshGeneration, lifecycleRetry]);

  useEffect(() => {
    if (selectedChainId === null) return;
    const key = { selection: selectionKey, refreshGeneration };
    const controller = new AbortController();
    cycleRequestRef.current?.abort();
    cycleRequestRef.current = null;
    setChainMetrics({
      key: metricsKey,
      value: null,
      loading: true,
      error: null,
      loadingMore: false,
      loadMoreError: null,
    });
    void (async () => {
      try {
        const payload = await readPayload(
          await fetch(`/api/chains/${encodeURIComponent(selectedChainId)}/metrics?offset=0`, {
            signal: controller.signal,
          }),
          "Chain metrics could not be loaded.",
        );
        if (!isChainMetricsPage(payload) || payload.chain.id !== selectedChainId)
          throw new Error("Chain metrics returned an invalid response.");
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setChainMetrics({
            key: metricsKey,
            value: payload,
            loading: false,
            error: null,
            loadingMore: false,
            loadMoreError: null,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setChainMetrics({
            key: metricsKey,
            value: null,
            loading: false,
            error: error instanceof Error ? error.message : "Chain metrics could not be loaded.",
            loadingMore: false,
            loadMoreError: null,
          });
        }
      }
    })();
    return () => {
      controller.abort();
      cycleRequestRef.current?.abort();
      cycleRequestRef.current = null;
    };
  }, [selectedChainId, selectionKey, refreshGeneration, lifecycleRetry, metricsKey]);

  useEffect(() => {
    const interval = getLocalYearInterval();
    const year = new Date().getFullYear();
    const key = { selection: selectionKey, refreshGeneration };
    const controller = new AbortController();
    setSummaryYear(year);
    setSummary((current) => ({ ...current, loading: true, error: null }));

    void (async () => {
      try {
        const params = new URLSearchParams({ start: interval.start, end: interval.end });
        const payload = await readPayload(
          await fetch(`/api/strava/dashboard-summary?${params}`, { signal: controller.signal }),
          "The yearly summary could not be loaded.",
        );
        if (!isDashboardSummary(payload)) throw new Error("The yearly summary returned an invalid response.");
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setSummary({ value: payload, loading: false, error: null });
        }
      } catch (error) {
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setSummary((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "The yearly summary could not be loaded.",
          }));
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selectionKey, refreshGeneration, summaryRetry]);

  useEffect(() => {
    const key = { selection: selectionKey, refreshGeneration };
    if (!activitySelection) return;
    if (
      waxingRefreshContextRef.current &&
      isCurrentDashboardRequest(stateRef.current, waxingRefreshContextRef.current.key)
    )
      return;
    const controller = new AbortController();
    sendAction({ type: "activities-loading", key });
    void (async () => {
      try {
        const payload = await readPayload(
          await fetch(`/api/strava/activities?${buildActivityQueryString(activitySelection, 0)}`, {
            signal: controller.signal,
          }),
          "Activities could not be loaded.",
        );
        if (!isActivityPage(payload)) throw new Error("The activity page returned an invalid response.");
        if (!controller.signal.aborted) {
          sendAction({ type: "activities-loaded", key, activities: payload.activities, hasMore: payload.hasMore });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          sendAction({
            type: "activities-error",
            key,
            message: error instanceof Error ? error.message : "Activities could not be loaded.",
          });
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectionKey, refreshGeneration, activitySelection, hasActivitySelection, activityRetry]);

  useEffect(() => {
    if (refreshGeneration === 0 && bikesRetry === 0 && !bikesRef.current.hasMore) return;
    const key = { selection: selectionKey, refreshGeneration };
    const controller = new AbortController();
    setBikes((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        let items = bikesRef.current.items;
        let hasMore = bikesRef.current.hasMore;
        if (refreshGeneration > 0 || bikesRetry > 0) {
          const payload = await readPayload(
            await fetch("/api/strava/bikes?offset=0", { signal: controller.signal }),
            "Bikes could not be loaded.",
          );
          if (!isPage(payload, "bikes", isBike)) throw new Error("The bike page returned an invalid response.");
          items = payload.bikes as BikeRow[];
          hasMore = payload.hasMore;
        }
        while (hasMore && !controller.signal.aborted) {
          const payload = await readPayload(
            await fetch(`/api/strava/bikes?offset=${items.length}`, { signal: controller.signal }),
            "More bikes could not be loaded.",
          );
          if (!isPage(payload, "bikes", isBike)) throw new Error("The bike page returned an invalid response.");
          items = [...items, ...(payload.bikes as BikeRow[])];
          hasMore = payload.hasMore;
        }
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setBikes((current) => ({
            ...current,
            items,
            hasMore,
            loading: false,
            loadingMore: false,
            loadMoreError: null,
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setBikes((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Bikes could not be loaded.",
          }));
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectionKey, refreshGeneration, bikesRetry]);

  useEffect(() => {
    if (refreshGeneration === 0 && chainsRetry === 0 && !chainsRef.current.hasMore) return;
    const key = { selection: selectionKey, refreshGeneration };
    const controller = new AbortController();
    setChains((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        let items = chainsRef.current.items;
        let hasMore = chainsRef.current.hasMore;
        if (refreshGeneration > 0 || chainsRetry > 0) {
          const payload = await readPayload(
            await fetch("/api/chains?offset=0", { signal: controller.signal }),
            "Chains could not be loaded.",
          );
          if (!isPage(payload, "chains", isChain)) throw new Error("The chain page returned an invalid response.");
          items = payload.chains as LifecycleChainView[];
          hasMore = payload.hasMore;
        }
        while (hasMore && !controller.signal.aborted) {
          const payload = await readPayload(
            await fetch(`/api/chains?offset=${items.length}`, { signal: controller.signal }),
            "More chains could not be loaded.",
          );
          if (!isPage(payload, "chains", isChain)) throw new Error("The chain page returned an invalid response.");
          items = [...items, ...(payload.chains as LifecycleChainView[])];
          hasMore = payload.hasMore;
        }
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setChains((current) => ({
            ...current,
            items,
            hasMore,
            loading: false,
            loadingMore: false,
            loadMoreError: null,
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
          setChains((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Chains could not be loaded.",
          }));
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectionKey, refreshGeneration, chainsRetry]);

  async function loadMoreBikes() {
    const key = getDashboardRequestKey(stateRef.current);
    setBikes((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const payload = await readPayload(
        await fetch(`/api/strava/bikes?offset=${bikes.items.length}`),
        "More bikes could not be loaded.",
      );
      if (!isPage(payload, "bikes", isBike)) throw new Error("The bike page returned an invalid response.");
      if (!isCurrentDashboardRequest(stateRef.current, key)) return;
      setBikes((current) => ({
        ...current,
        items: [...current.items, ...(payload.bikes as BikeRow[])],
        hasMore: payload.hasMore,
        loadingMore: false,
        loadMoreError: null,
      }));
    } catch (error) {
      if (isCurrentDashboardRequest(stateRef.current, key)) {
        setBikes((current) => ({
          ...current,
          loadingMore: false,
          loadMoreError: error instanceof Error ? error.message : "More bikes could not be loaded.",
        }));
      }
    }
  }

  async function loadMoreChains() {
    const key = getDashboardRequestKey(stateRef.current);
    setChains((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const payload = await readPayload(
        await fetch(`/api/chains?offset=${chains.items.length}`),
        "More chains could not be loaded.",
      );
      if (!isPage(payload, "chains", isChain)) throw new Error("The chain page returned an invalid response.");
      if (!isCurrentDashboardRequest(stateRef.current, key)) return;
      setChains((current) => ({
        ...current,
        items: [...current.items, ...(payload.chains as LifecycleChainView[])],
        hasMore: payload.hasMore,
        loadingMore: false,
        loadMoreError: null,
      }));
    } catch (error) {
      if (isCurrentDashboardRequest(stateRef.current, key)) {
        setChains((current) => ({
          ...current,
          loadingMore: false,
          loadMoreError: error instanceof Error ? error.message : "More chains could not be loaded.",
        }));
      }
    }
  }

  async function loadMoreActivities() {
    const key = getDashboardRequestKey(stateRef.current);
    const currentState = stateRef.current;
    if (currentState.selection.kind !== "activities") return;
    const offset = currentState.activities.length;
    const currentSelection = currentState.selection;
    sendAction({ type: "load-more-started", key });
    try {
      const payload = await readPayload(
        await fetch(`/api/strava/activities?${buildActivityQueryString(currentSelection, offset)}`),
        "More activities could not be loaded.",
      );
      if (!isActivityPage(payload)) throw new Error("The activity page returned an invalid response.");
      sendAction({ type: "load-more-loaded", key, activities: payload.activities, hasMore: payload.hasMore });
    } catch (error) {
      sendAction({
        type: "load-more-error",
        key,
        message: error instanceof Error ? error.message : "More activities could not be loaded.",
      });
    }
  }

  async function loadMoreCycles() {
    const key = getDashboardRequestKey(stateRef.current);
    const currentSelection = stateRef.current.selection;
    if (
      currentSelection.kind !== "chain" ||
      chainMetrics.key !== `${key.selection}:${key.refreshGeneration}` ||
      !chainMetrics.value?.hasMore ||
      cycleRequestRef.current
    )
      return;
    const controller = new AbortController();
    cycleRequestRef.current = controller;
    const offset = chainMetrics.value.cycles.length;
    setChainMetrics((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const payload = await readPayload(
        await fetch(`/api/chains/${encodeURIComponent(currentSelection.chainId)}/metrics?offset=${offset}`, {
          signal: controller.signal,
        }),
        "More cycles could not be loaded.",
      );
      if (!isChainMetricsPage(payload) || payload.chain.id !== currentSelection.chainId)
        throw new Error("Chain metrics returned an invalid response.");
      if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key)) {
        setChainMetrics((current) =>
          current.value && current.key === `${key.selection}:${key.refreshGeneration}`
            ? {
                ...current,
                value: { ...payload, cycles: [...current.value.cycles, ...payload.cycles] },
                loadingMore: false,
              }
            : current,
        );
      }
    } catch (error) {
      if (!controller.signal.aborted && isCurrentDashboardRequest(stateRef.current, key))
        setChainMetrics((current) => ({
          ...current,
          loadingMore: false,
          loadMoreError: error instanceof Error ? error.message : "More cycles could not be loaded.",
        }));
    } finally {
      if (cycleRequestRef.current === controller) cycleRequestRef.current = null;
    }
  }

  async function refreshWaxingActivities(context: WaxingRefreshContext) {
    setWaxingMarkSave({
      activityId: context.activityId,
      phase: "refreshing",
      error: null,
      canRetryRefresh: false,
    });
    try {
      const activities: ActivityView[] = [];
      let hasMore = false;
      while (activities.length < context.rowCount) {
        const limit = Math.min(MAX_DASHBOARD_PAGE_SIZE, context.rowCount - activities.length);
        const payload = await readPayload(
          await fetch(
            `/api/strava/activities?${buildActivityQueryString(context.selection, activities.length, limit)}`,
          ),
          "The activity list could not be refreshed.",
        );
        if (!isActivityPage(payload)) throw new Error("The activity page returned an invalid response.");
        if (payload.activities.length === 0 && payload.hasMore) {
          throw new Error("The activity list could not be refreshed.");
        }
        activities.push(...payload.activities);
        hasMore = payload.hasMore;
        if (!hasMore) break;
      }
      sendAction({
        type: "activities-loaded",
        key: context.key,
        activities,
        hasMore,
      });
      waxingRefreshContextRef.current = null;
      setWaxingMarkSave({ activityId: null, phase: "idle", error: null, canRetryRefresh: false });
    } catch {
      waxingRefreshContextRef.current = context;
      setWaxingMarkSave({
        activityId: context.activityId,
        phase: "error",
        error: "Saved, but the list could not be refreshed.",
        canRetryRefresh: true,
      });
    } finally {
      waxingOperationRef.current = false;
    }
  }

  async function saveWaxingMark(activityId: string, chainId: string | null) {
    if (waxingOperationRef.current) return;
    const currentState = stateRef.current;
    if (currentState.selection.kind !== "activities") return;

    const context: WaxingRefreshContext = {
      activityId,
      key: getDashboardRequestKey(currentState),
      selection: currentState.selection,
      rowCount: getActivityRefreshRowCount(currentState.activities.length),
    };
    waxingOperationRef.current = true;
    waxingRefreshContextRef.current = null;
    setWaxingMarkSave({ activityId, phase: "saving", error: null, canRetryRefresh: false });
    try {
      await readPayload(
        await fetch(`/api/strava/activities/${encodeURIComponent(activityId)}/waxing`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainId }),
        }),
        "The waxing mark could not be saved.",
      );
    } catch (error) {
      waxingOperationRef.current = false;
      setWaxingMarkSave({
        activityId,
        phase: "error",
        error: error instanceof Error ? error.message : "The waxing mark could not be saved.",
        canRetryRefresh: false,
      });
      return;
    }
    const stillSelected = isCurrentDashboardRequest(stateRef.current, context.key);
    refreshAfterSavedChanges({ outcome: "complete", inserted: 0, updated: 0 });
    if (!stillSelected) {
      waxingOperationRef.current = false;
      setWaxingMarkSave({ activityId: null, phase: "idle", error: null, canRetryRefresh: false });
      return;
    }
    context.key = getDashboardRequestKey(stateRef.current);
    waxingRefreshContextRef.current = context;
    await refreshWaxingActivities(context);
  }

  async function retryWaxingRefresh() {
    const context = waxingRefreshContextRef.current;
    if (!context || waxingOperationRef.current) return;
    waxingOperationRef.current = true;
    await refreshWaxingActivities(context);
  }

  function refreshAfterSavedChanges(result: SavedChangesResult) {
    sendAction({ type: "refresh-after-save", result });
  }

  return {
    dashboard,
    summary,
    summaryYear,
    bikes,
    chains,
    bikeStatuses,
    chainMetrics:
      chainMetrics.key === metricsKey
        ? chainMetrics
        : { ...chainMetrics, value: null, loading: selectedChainId !== null, error: null },
    selectSummary: () => {
      sendAction({ type: "select-summary" });
    },
    selectAllBikes: () => {
      sendAction({ type: "select-all-bikes" });
    },
    selectBike: (bikeId: string) => {
      sendAction({ type: "select-bike", bikeId });
    },
    selectChain: (chainId: string) => {
      sendAction({ type: "select-chain", chainId });
    },
    selectManageChains: () => {
      sendAction({ type: "select-manage-chains" });
    },
    selectChainFilter: (filter: string | null) => {
      sendAction({ type: "select-chain-filter", filter });
    },
    retrySummary: () => {
      setSummaryRetry((value) => value + 1);
    },
    retryActivities: () => {
      setActivityRetry((value) => value + 1);
    },
    retryBikes: () => {
      setBikesRetry((value) => value + 1);
    },
    retryChains: () => {
      setChainsRetry((value) => value + 1);
    },
    loadMoreActivities,
    loadMoreBikes,
    loadMoreChains,
    loadMoreCycles,
    retryLifecycle: () => {
      setLifecycleRetry((value) => value + 1);
    },
    saveWaxingMark,
    waxingMarkSave: {
      ...waxingMarkSave,
      isBusy: waxingMarkSave.phase === "saving" || waxingMarkSave.phase === "refreshing",
    },
    retryWaxingRefresh,
    refreshAfterSavedChanges,
  };
}
