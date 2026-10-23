import type { ActivityView } from "./activity-view.ts";

export type DashboardSelection = { kind: "summary" } | { kind: "activities"; bikeId: string | null };

export type DashboardViewState = "summary" | "loading" | "error" | "empty" | "activities";

export interface DashboardRequestKey {
  selection: string;
  refreshGeneration: number;
}

export interface DashboardState {
  selection: DashboardSelection;
  refreshGeneration: number;
  activities: ActivityView[];
  hasMoreActivities: boolean;
  activityStatus: "idle" | "loading" | "ready" | "error";
  activityError: string | null;
  loadingMoreActivities: boolean;
  loadMoreError: string | null;
}

export interface SavedChangesResult {
  outcome: "complete" | "partial" | "failed";
  inserted: number;
  updated: number;
  removed?: number;
  savedChanges?: boolean;
}

export type DashboardStateAction =
  | { type: "select-summary" }
  | { type: "select-all-bikes" }
  | { type: "select-bike"; bikeId: string }
  | { type: "refresh-after-save"; result: SavedChangesResult }
  | { type: "activities-loading"; key: DashboardRequestKey }
  | { type: "activities-loaded"; key: DashboardRequestKey; activities: ActivityView[]; hasMore: boolean }
  | { type: "activities-error"; key: DashboardRequestKey; message: string }
  | { type: "load-more-started"; key: DashboardRequestKey }
  | { type: "load-more-loaded"; key: DashboardRequestKey; activities: ActivityView[]; hasMore: boolean }
  | { type: "load-more-error"; key: DashboardRequestKey; message: string };

function selectionKey(selection: DashboardSelection): string {
  return selection.kind === "summary" ? "summary" : `activities:${selection.bikeId ?? "all"}`;
}

function resetActivityPage(state: DashboardState, activityStatus: DashboardState["activityStatus"]): DashboardState {
  return {
    ...state,
    activities: [],
    hasMoreActivities: false,
    activityStatus,
    activityError: null,
    loadingMoreActivities: false,
    loadMoreError: null,
  };
}

export function createDashboardState(): DashboardState {
  return {
    selection: { kind: "summary" },
    refreshGeneration: 0,
    activities: [],
    hasMoreActivities: false,
    activityStatus: "idle",
    activityError: null,
    loadingMoreActivities: false,
    loadMoreError: null,
  };
}

export function getDashboardRequestKey(state: DashboardState): DashboardRequestKey {
  return { selection: selectionKey(state.selection), refreshGeneration: state.refreshGeneration };
}

export function isCurrentDashboardRequest(state: DashboardState, key: DashboardRequestKey): boolean {
  const current = getDashboardRequestKey(state);
  return current.selection === key.selection && current.refreshGeneration === key.refreshGeneration;
}

export function getDashboardViewState(state: DashboardState): DashboardViewState {
  if (state.selection.kind === "summary") return "summary";
  if (state.activityStatus === "loading" || state.activityStatus === "idle") return "loading";
  if (state.activityStatus === "error") return "error";
  return state.activities.length === 0 ? "empty" : "activities";
}

export function dashboardStateReducer(state: DashboardState, action: DashboardStateAction): DashboardState {
  switch (action.type) {
    case "select-summary":
      if (state.selection.kind === "summary") return state;
      return resetActivityPage({ ...state, selection: { kind: "summary" } }, "idle");
    case "select-all-bikes":
      if (state.selection.kind === "activities" && state.selection.bikeId === null) return state;
      return resetActivityPage({ ...state, selection: { kind: "activities", bikeId: null } }, "loading");
    case "select-bike":
      if (state.selection.kind === "activities" && state.selection.bikeId === action.bikeId) return state;
      return resetActivityPage({ ...state, selection: { kind: "activities", bikeId: action.bikeId } }, "loading");
    case "refresh-after-save": {
      const savedChanges =
        action.result.savedChanges === true ||
        action.result.inserted + action.result.updated + (action.result.removed ?? 0) > 0;
      if (!savedChanges && action.result.outcome !== "complete") return state;
      const nextState = resetActivityPage(state, state.selection.kind === "summary" ? "idle" : "loading");
      return { ...nextState, refreshGeneration: state.refreshGeneration + 1 };
    }
    case "activities-loading":
      return isCurrentDashboardRequest(state, action.key)
        ? { ...state, activityStatus: "loading", activityError: null }
        : state;
    case "activities-loaded":
      return isCurrentDashboardRequest(state, action.key)
        ? {
            ...state,
            activities: action.activities,
            hasMoreActivities: action.hasMore,
            activityStatus: "ready",
            activityError: null,
            loadingMoreActivities: false,
            loadMoreError: null,
          }
        : state;
    case "activities-error":
      return isCurrentDashboardRequest(state, action.key)
        ? { ...state, activityStatus: "error", activityError: action.message }
        : state;
    case "load-more-started":
      return isCurrentDashboardRequest(state, action.key)
        ? { ...state, loadingMoreActivities: true, loadMoreError: null }
        : state;
    case "load-more-loaded":
      return isCurrentDashboardRequest(state, action.key)
        ? {
            ...state,
            activities: [...state.activities, ...action.activities],
            hasMoreActivities: action.hasMore,
            loadingMoreActivities: false,
            loadMoreError: null,
          }
        : state;
    case "load-more-error":
      return isCurrentDashboardRequest(state, action.key)
        ? { ...state, loadingMoreActivities: false, loadMoreError: action.message }
        : state;
  }
}
