import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeRunAfterSync,
  activitiesAfterSync,
  buildStravaSyncRequest,
  isStravaSyncMode,
  syncCountSummary,
  syncResultMessage,
  type StravaSyncResponse,
} from "./sync-contract.ts";

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
    { id: "old", name: "Old", distanceMeters: 100, startedAt: "2020-01-01", bikeName: "Bike" },
  ];
  const refreshedActivities = [
    { id: "fresh", name: "Fresh", distanceMeters: 200, startedAt: "2021-01-01", bikeName: "Bike" },
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
