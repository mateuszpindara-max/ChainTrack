import { useEffect, useReducer, useRef, useState } from "react";
import type { ChainView } from "@/lib/chains/chain.ts";
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
import { buildActivityQueryString, getActivityRefreshLimit } from "@/lib/strava/dashboard-query.ts";

interface Page<T> {
  items: T[];
  hasMore: boolean;
}

interface DashboardDataOptions {
  initialBikes: BikeRow[];
  initialBikesHasMore: boolean;
  initialBikesError: boolean;
  initialChains: ChainView[];
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
  limit: number;
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

function isChain(value: unknown): value is ChainView {
  if (typeof value !== "object" || value === null) return false;
  const chain = value as Record<string, unknown>;
  return (
    typeof chain.id === "string" &&
    typeof chain.name === "string" &&
    typeof chain.startingDistanceMeters === "number" &&
    typeof chain.createdAt === "string"
  );
}

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
          items = payload.chains as ChainView[];
          hasMore = payload.hasMore;
        }
        while (hasMore && !controller.signal.aborted) {
          const payload = await readPayload(
            await fetch(`/api/chains?offset=${items.length}`, { signal: controller.signal }),
            "More chains could not be loaded.",
          );
          if (!isPage(payload, "chains", isChain)) throw new Error("The chain page returned an invalid response.");
          items = [...items, ...(payload.chains as ChainView[])];
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
        items: [...current.items, ...(payload.chains as ChainView[])],
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

  async function refreshWaxingActivities(context: WaxingRefreshContext) {
    setWaxingMarkSave({
      activityId: context.activityId,
      phase: "refreshing",
      error: null,
      canRetryRefresh: false,
    });
    try {
      const payload = await readPayload(
        await fetch(`/api/strava/activities?${buildActivityQueryString(context.selection, 0, context.limit)}`),
        "The activity list could not be refreshed.",
      );
      if (!isActivityPage(payload)) throw new Error("The activity page returned an invalid response.");
      sendAction({
        type: "activities-loaded",
        key: context.key,
        activities: payload.activities,
        hasMore: payload.hasMore,
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
      limit: getActivityRefreshLimit(currentState.activities.length),
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
    selectSummary: () => {
      sendAction({ type: "select-summary" });
    },
    selectAllBikes: () => {
      sendAction({ type: "select-all-bikes" });
    },
    selectBike: (bikeId: string) => {
      sendAction({ type: "select-bike", bikeId });
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
    saveWaxingMark,
    waxingMarkSave: {
      ...waxingMarkSave,
      isBusy: waxingMarkSave.phase === "saving" || waxingMarkSave.phase === "refreshing",
    },
    retryWaxingRefresh,
    refreshAfterSavedChanges,
  };
}
