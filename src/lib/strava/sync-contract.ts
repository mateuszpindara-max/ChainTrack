import type { ActivityView } from "./activity-view.ts";

export type StravaSyncMode = "new" | "repair";
export const STRAVA_CALLBACK_STATUSES = ["connected", "denied", "failed"] as const;
export type StravaCallbackStatus = (typeof STRAVA_CALLBACK_STATUSES)[number];
export const INVALID_STRAVA_SYNC_RESPONSE_MESSAGE = "The Strava synchronization returned an invalid response.";

export interface ActiveStravaSyncRun {
  id: string;
  mode: StravaSyncMode;
  status: "running" | "partial";
}

export interface StravaSyncResponse {
  outcome: "complete" | "partial" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  removed?: number;
  mode?: StravaSyncMode;
  runId?: string;
  nextPage?: number;
  status?: "running" | "partial" | "completed";
  message?: string;
  authorizationFailure?: true;
  activities?: ActivityView[];
  hasMoreActivities?: boolean;
}

export interface InitialImportResponse {
  outcome: "complete" | "partial" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  savedChanges?: boolean;
  message?: string;
  authorizationFailure?: true;
  activities?: ActivityView[];
  hasMoreActivities?: boolean;
}

export function isStravaSyncMode(value: unknown): value is StravaSyncMode {
  return value === "new" || value === "repair";
}

export function isStravaCallbackStatus(value: unknown): value is StravaCallbackStatus {
  return typeof value === "string" && STRAVA_CALLBACK_STATUSES.some((status) => status === value);
}

export function shouldOfferStravaReauthorization(
  connectionStatus: "connected" | "not-connected" | "unavailable",
  authorizationFailure: boolean,
  message: string | undefined,
  callbackStatus: StravaCallbackStatus | null,
): boolean {
  return (
    connectionStatus === "connected" &&
    (authorizationFailure ||
      message === INVALID_STRAVA_SYNC_RESPONSE_MESSAGE ||
      callbackStatus === "denied" ||
      callbackStatus === "failed")
  );
}

export function stravaCallbackMessage(status: StravaCallbackStatus | null): string | null {
  if (status === "connected") {
    return "Strava reconnected. Your activities and saved synchronization progress are unchanged.";
  }
  if (status === "denied") {
    return "Strava authorization was cancelled or required permissions were not granted. You can try again.";
  }
  if (status === "failed") {
    return "Strava could not be reconnected. Your existing connection and activity history were not changed. You can try again.";
  }
  return null;
}

export function stravaCallbackDenialStatus(
  providerDenied: boolean,
  hasCode: boolean,
  hasRequiredScopes: boolean,
): "denied" | null {
  return providerDenied || !hasCode || !hasRequiredScopes ? "denied" : null;
}

export function stravaCallbackRedirect(status: StravaCallbackStatus): string {
  return `/dashboard?strava=${status}`;
}

export function buildStravaSyncRequest(mode: StravaSyncMode, activeRun: ActiveStravaSyncRun | null) {
  return { mode, ...(activeRun?.mode === mode ? { runId: activeRun.id } : {}) };
}

export function activeRunAfterSync(
  mode: StravaSyncMode,
  response: StravaSyncResponse,
  currentRun: ActiveStravaSyncRun | null,
): ActiveStravaSyncRun | null {
  if (response.outcome === "complete") return null;
  if (!response.runId || response.status === "completed") return currentRun;
  return {
    id: response.runId,
    mode,
    status: response.status === "partial" ? "partial" : "running",
  };
}

export function activitiesAfterSync(currentActivities: ActivityView[], response: StravaSyncResponse): ActivityView[] {
  return response.activities ?? currentActivities;
}

export function syncCountSummary(response: StravaSyncResponse): string {
  if (response.mode === "repair") {
    return `${response.inserted} inserted, ${response.updated} updated, ${response.skipped} unmatched, ${response.removed ?? 0} removed`;
  }
  if (response.mode === "new") return `${response.inserted} new, ${response.skipped} skipped`;
  return `${response.inserted} new, ${response.updated} updated, ${response.skipped} skipped`;
}

export function syncResultMessage(response: StravaSyncResponse): string {
  if (response.mode === "repair") {
    if (response.outcome === "partial") {
      return response.message ?? "Repair progress is saved. Continue to reconcile the remaining Strava history.";
    }
    if (response.outcome === "failed") {
      return response.message ?? "Full history repair failed. Continue from saved progress.";
    }
    return (
      response.message ?? "Full history repair complete. Local activities now reflect the verified Strava history."
    );
  }
  if (response.mode === "new") {
    if (response.outcome === "partial") {
      return response.message ?? "This import is still scanning. Continue to check the remaining Strava activities.";
    }
    if (response.outcome === "failed") return response.message ?? "Import new failed. Retry from the saved page.";
    return response.inserted === 0
      ? "Import new complete. No eligible new activities were found."
      : "Import new complete. Newly visible activities were added.";
  }
  if (response.outcome === "partial" && response.message?.startsWith("This import batch is saved.")) {
    return response.message;
  }
  if (response.outcome === "partial")
    return response.message ?? "The import stopped early. Saved activities are safe to retry.";
  if (response.outcome === "failed") return response.message ?? "The activity import failed. Please try again.";
  if (response.inserted === 0 && response.updated === 0 && response.activities?.length === 0) {
    return "Import complete. No bike-linked activities were found.";
  }
  return "Import complete. Your bike-linked history is up to date.";
}
