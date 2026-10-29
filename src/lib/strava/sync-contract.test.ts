import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeRunAfterSync,
  activitiesAfterSync,
  buildStravaSyncRequest,
  INVALID_STRAVA_SYNC_RESPONSE_MESSAGE,
  isStravaSyncMode,
  isStravaCallbackStatus,
  stravaCallbackDenialStatus,
  stravaCallbackMessage,
  stravaCallbackRedirect,
  shouldOfferStravaReauthorization,
  syncCountSummary,
  syncResultMessage,
  type StravaSyncResponse,
} from "./sync-contract.ts";

void test("callback outcomes use only fixed safe dashboard statuses", () => {
  assert.equal(isStravaCallbackStatus("connected"), true);
  assert.equal(isStravaCallbackStatus("denied"), true);
  assert.equal(isStravaCallbackStatus("failed"), true);
  assert.equal(isStravaCallbackStatus("code=fixture-code&state=fixture-state"), false);
  assert.equal(stravaCallbackDenialStatus(true, true, true), "denied");
  assert.equal(stravaCallbackDenialStatus(false, false, true), "denied");
  assert.equal(stravaCallbackDenialStatus(false, true, false), "denied");
  assert.equal(stravaCallbackDenialStatus(false, true, true), null);
  assert.equal(stravaCallbackRedirect("denied"), "/dashboard?strava=denied");
  assert.equal(stravaCallbackRedirect("failed"), "/dashboard?strava=failed");
  assert.equal(stravaCallbackRedirect("connected"), "/dashboard?strava=connected");
});

void test("dashboard offers reauthorization only for agreed failures or a retryable callback result", () => {
  const connected = "connected" as const;
  const noCallback = null;

  assert.equal(shouldOfferStravaReauthorization(connected, true, "Connection unavailable.", noCallback), true);
  assert.equal(
    shouldOfferStravaReauthorization(connected, false, INVALID_STRAVA_SYNC_RESPONSE_MESSAGE, noCallback),
    true,
  );
  assert.equal(shouldOfferStravaReauthorization(connected, false, "Network request failed.", noCallback), false);
  assert.equal(shouldOfferStravaReauthorization(connected, false, "Provider rate limit.", noCallback), false);
  assert.equal(shouldOfferStravaReauthorization(connected, false, undefined, noCallback), false);
  assert.equal(shouldOfferStravaReauthorization(connected, false, undefined, "connected"), false);
  assert.equal(shouldOfferStravaReauthorization(connected, false, undefined, "denied"), true);
  assert.equal(shouldOfferStravaReauthorization(connected, false, undefined, "failed"), true);
  assert.equal(shouldOfferStravaReauthorization("not-connected", false, undefined, "failed"), false);

  assert.equal(
    stravaCallbackMessage("connected"),
    "Strava reconnected. Your activities and saved synchronization progress are unchanged.",
  );
  assert.match(stravaCallbackMessage("denied") ?? "", /cancelled|not granted/);
  assert.match(stravaCallbackMessage("failed") ?? "", /try again/);
  assert.equal(stravaCallbackMessage(null), null);
});

void test("sync requests preserve the selected mode and continue only that mode's active run", () => {
  const newRun = { id: "new-run", mode: "new" as const, status: "partial" as const };
  const repairRun = { id: "repair-run", mode: "repair" as const, status: "running" as const };

  assert.equal(isStravaSyncMode("new"), true);
  assert.equal(isStravaSyncMode("repair"), true);
  assert.equal(isStravaSyncMode("initial"), false);
  assert.deepEqual(buildStravaSyncRequest("new", newRun), { mode: "new", runId: "new-run" });
  assert.deepEqual(buildStravaSyncRequest("repair", repairRun), { mode: "repair", runId: "repair-run" });
  assert.deepEqual(buildStravaSyncRequest("repair", newRun), { mode: "repair" });
});

void test("partial and failed results retain continuation while completion closes the active run", () => {
  const currentRun = { id: "repair-run", mode: "repair" as const, status: "partial" as const };
  const partial: StravaSyncResponse = {
    outcome: "partial",
    inserted: 1,
    updated: 2,
    skipped: 3,
    removed: 0,
    runId: "repair-run",
    status: "partial",
  };
  const failed: StravaSyncResponse = { ...partial, outcome: "failed", status: "running" };
  const complete: StravaSyncResponse = { ...partial, outcome: "complete", status: "completed" };

  assert.deepEqual(activeRunAfterSync("repair", partial, null), currentRun);
  assert.deepEqual(activeRunAfterSync("repair", failed, null), { ...currentRun, status: "running" });
  assert.equal(activeRunAfterSync("repair", complete, currentRun), null);
});

void test("repair result presentation includes destructive counts, partial states, and refreshed list data", () => {
  const partial: StravaSyncResponse = {
    outcome: "partial",
    inserted: 2,
    updated: 5,
    skipped: 1,
    removed: 0,
    mode: "repair",
    message: "Removal verification is saved.",
  };
  const complete: StravaSyncResponse = { ...partial, outcome: "complete", removed: 3, message: undefined };
  const failed: StravaSyncResponse = { ...partial, outcome: "failed", message: "Strava timed out." };
  const previousActivities = [
    {
      id: "old",
      name: "Old",
      distanceMeters: 100,
      startedAt: "2020-01-01",
      bikeName: "Bike",
      chainId: null,
      chainName: null,
      isWaxingStart: false,
    },
  ];
  const refreshedActivities = [
    {
      id: "fresh",
      name: "Fresh",
      distanceMeters: 200,
      startedAt: "2021-01-01",
      bikeName: "Bike",
      chainId: null,
      chainName: null,
      isWaxingStart: false,
    },
  ];

  assert.equal(syncResultMessage(partial), "Removal verification is saved.");
  assert.equal(syncResultMessage(failed), "Strava timed out.");
  assert.equal(
    syncResultMessage(complete),
    "Full history repair complete. Local activities now reflect the verified Strava history.",
  );
  assert.equal(syncCountSummary(complete), "2 inserted, 5 updated, 1 unmatched, 3 removed");
  assert.equal(
    activitiesAfterSync(previousActivities, { ...partial, activities: refreshedActivities }),
    refreshedActivities,
  );
  assert.equal(activitiesAfterSync(previousActivities, partial), previousActivities);
});
