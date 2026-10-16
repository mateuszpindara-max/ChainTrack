import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { toActivityViews } from "@/lib/strava/activity-view.ts";
import {
  syncNewStravaActivities,
  syncRepairStravaActivities,
  type NewActivitySyncRun,
  type NewActivitySyncStore,
  type RepairActivitySyncRun,
  type RepairActivitySyncStore,
  type RepairActivityUpsert,
  type StravaBike,
} from "@/lib/strava/import.ts";
import { hasRequiredStravaScopes } from "@/lib/strava/security.ts";
import { getStravaAccessToken } from "@/lib/strava/server";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";
import { isStravaSyncMode } from "@/lib/strava/sync-contract.ts";

export const prerender = false;

const RUN_COLUMNS =
  "id, athlete_id, mode, status, next_page, inserted_count, updated_count, skipped_count, removed_count, scan_complete, verification_step";
const DATABASE_PAGE_SIZE = 500;

interface SyncRunRow {
  id: string;
  athlete_id: number | null;
  mode: string;
  status: string;
  next_page: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  removed_count: number;
  scan_complete: boolean;
  verification_step: number;
}

function failure(message: string, statusCode: number, mode?: "new" | "repair"): Response {
  return Response.json(
    {
      outcome: "failed",
      ...(mode ? { mode } : {}),
      status: "failed",
      inserted: 0,
      updated: 0,
      skipped: 0,
      removed: 0,
      nextPage: 1,
      message,
    },
    { status: statusCode },
  );
}

function toNewRun(value: SyncRunRow): NewActivitySyncRun {
  if (
    value.mode !== "new" ||
    (value.status !== "running" && value.status !== "partial" && value.status !== "completed") ||
    !Number.isSafeInteger(value.next_page) ||
    value.next_page < 1 ||
    !Number.isSafeInteger(value.inserted_count) ||
    value.inserted_count < 0 ||
    !Number.isSafeInteger(value.skipped_count) ||
    value.skipped_count < 0
  ) {
    throw new Error("The saved Strava synchronization state is invalid");
  }
  return {
    id: value.id,
    athleteId: value.athlete_id,
    status: value.status,
    nextPage: value.next_page,
    insertedCount: value.inserted_count,
    skippedCount: value.skipped_count,
  };
}

function toRepairRun(value: SyncRunRow): RepairActivitySyncRun {
  if (
    value.mode !== "repair" ||
    (value.status !== "running" && value.status !== "partial") ||
    !Number.isSafeInteger(value.next_page) ||
    value.next_page < 1 ||
    !Number.isSafeInteger(value.inserted_count) ||
    value.inserted_count < 0 ||
    !Number.isSafeInteger(value.updated_count) ||
    value.updated_count < 0 ||
    !Number.isSafeInteger(value.skipped_count) ||
    value.skipped_count < 0 ||
    !Number.isSafeInteger(value.removed_count) ||
    value.removed_count < 0 ||
    typeof value.scan_complete !== "boolean" ||
    !Number.isSafeInteger(value.verification_step) ||
    value.verification_step < 0
  ) {
    throw new Error("The saved Strava repair state is invalid");
  }
  return {
    id: value.id,
    athleteId: value.athlete_id,
    status: value.status,
    nextPage: value.next_page,
    insertedCount: value.inserted_count,
    updatedCount: value.updated_count,
    skippedCount: value.skipped_count,
    removedCount: value.removed_count,
    scanComplete: value.scan_complete,
    verificationStep: value.verification_step,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return failure("Sign in to synchronize your Strava activities.", 401);
  const db = supabase as unknown as SupabaseClient<StravaSyncDatabase>;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return failure("Choose a synchronization mode and try again.", 400);
  }
  if (!isRecord(body) || !isStravaSyncMode(body.mode) || (body.runId !== undefined && typeof body.runId !== "string")) {
    return failure("Choose a supported synchronization mode and try again.", 400);
  }
  const mode = body.mode;
  const requestedRunId = typeof body.runId === "string" ? body.runId : undefined;

  const { data: connection, error: connectionError } = await db
    .from("strava_connections")
    .select("athlete_id, initial_import_athlete_id, scopes, initial_import_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (connectionError) return failure("Could not check the Strava connection.", 503, mode);
  if (!connection?.initial_import_completed_at) {
    return failure("Complete the initial Strava history import before synchronizing.", 409, mode);
  }
  if (connection.initial_import_athlete_id !== connection.athlete_id) {
    return failure("The connected Strava athlete does not match this activity history.", 409, mode);
  }
  const scopes: unknown = connection.scopes;
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope: unknown) => typeof scope === "string") ||
    !hasRequiredStravaScopes(scopes.join(" "))
  ) {
    return failure("Connect Strava and grant the required read permissions before synchronizing.", 409, mode);
  }

  let accessToken: string;
  try {
    accessToken = await getStravaAccessToken(supabase, user.id);
  } catch {
    return failure("The Strava connection is unavailable. Reconnect and try again.", 503, mode);
  }

  const { data: activeRunRow, error: activeRunError } = await db
    .from("strava_sync_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", user.id)
    .in("status", ["running", "partial"])
    .maybeSingle();
  if (activeRunError) return failure("Could not check saved synchronization progress.", 503, mode);

  let run: NewActivitySyncRun | null = null;
  let repairRun: RepairActivitySyncRun | null = null;
  if (activeRunRow) {
    if (activeRunRow.athlete_id !== connection.athlete_id) {
      return failure("This sync run belongs to a different Strava athlete. It cannot be resumed.", 409, mode);
    }
    if (activeRunRow.mode !== mode) {
      return failure("A different Strava synchronization mode is already active. Continue that run first.", 409, mode);
    }
    try {
      if (mode === "repair") repairRun = toRepairRun(activeRunRow);
      else run = toNewRun(activeRunRow);
    } catch {
      return failure("The saved Strava synchronization state is invalid.", 503, mode);
    }
    if (requestedRunId && requestedRunId !== activeRunRow.id) {
      return failure(
        "This synchronization run is no longer active. Refresh the dashboard and continue the active run.",
        409,
        mode,
      );
    }
  } else {
    if (requestedRunId) {
      return failure("This synchronization run is no longer active. Start a new synchronization.", 409, mode);
    }
    const { data: createdRun, error: createRunError } = await db
      .from("strava_sync_runs")
      .insert({ user_id: user.id, athlete_id: connection.athlete_id, mode, status: "running", next_page: 1 })
      .select(RUN_COLUMNS)
      .single();
    if (createRunError) {
      return failure("Another synchronization may already be active. Refresh the dashboard and try again.", 409, mode);
    }
    try {
      if (mode === "repair") repairRun = toRepairRun(createdRun);
      else run = toNewRun(createdRun);
    } catch {
      return failure("Could not start the Strava synchronization.", 503, mode);
    }
  }

  const commonStore = {
    async upsertBikes(bikes: StravaBike[]) {
      if (bikes.length === 0) return;
      const { error } = await db.from("bikes").upsert(
        bikes.map((bike) => ({ user_id: user.id, strava_gear_id: bike.id, name: bike.name })),
        { onConflict: "user_id,strava_gear_id" },
      );
      if (error) throw new Error("Could not save Strava bikes");
    },
    async getBikeIds(gearIds: string[]) {
      if (gearIds.length === 0) return new Map<string, string>();
      const { data, error } = await db
        .from("bikes")
        .select("id, strava_gear_id")
        .eq("user_id", user.id)
        .in("strava_gear_id", gearIds);
      if (error) throw new Error("Could not match Strava bikes");
      return new Map(data.map((bike) => [bike.strava_gear_id, bike.id]));
    },
    async upsertActivities(activities: RepairActivityUpsert[]) {
      if (activities.length === 0) return { inserted: 0, updated: 0 };
      const rows = activities.map((activity) => ({
        user_id: user.id,
        bike_id: activity.bikeId,
        strava_activity_id: activity.stravaActivityId,
        name: activity.name,
        distance_meters: activity.distanceMeters,
        started_at: activity.startedAt,
      }));
      const { data: existing, error: readError } = await db
        .from("activities")
        .select("strava_activity_id")
        .eq("user_id", user.id)
        .in(
          "strava_activity_id",
          rows.map((row) => row.strava_activity_id),
        );
      if (readError) throw new Error("Could not check existing Strava activities");
      const existingIds = new Set(existing.map((row) => row.strava_activity_id));
      const { error } = await db.from("activities").upsert(rows, { onConflict: "user_id,strava_activity_id" });
      if (error) throw new Error("Could not reconcile Strava activities");
      const updated = rows.filter((row) => existingIds.has(row.strava_activity_id)).length;
      return { inserted: rows.length - updated, updated };
    },
  };

  let result:
    Awaited<ReturnType<typeof syncNewStravaActivities>> | Awaited<ReturnType<typeof syncRepairStravaActivities>>;
  if (mode === "new") {
    if (!run) return failure("The saved Strava synchronization state is invalid.", 503, mode);
    let savedRun = run;
    const store: NewActivitySyncStore = {
      ...commonStore,
      async getExistingActivityIds(activityIds: number[]) {
        if (activityIds.length === 0) return new Set<number>();
        const { data, error } = await db
          .from("activities")
          .select("strava_activity_id")
          .eq("user_id", user.id)
          .in("strava_activity_id", activityIds);
        if (error) throw new Error("Could not check existing Strava activities");
        return new Set(data.map((row) => row.strava_activity_id));
      },
      async applyPage(input) {
        const { data, error } = await db.rpc("apply_strava_sync_page", {
          p_run_id: input.runId,
          p_expected_page: input.expectedPage,
          p_next_page: input.nextPage,
          p_activities: input.activities.map((activity) => ({
            bike_id: activity.bikeId,
            strava_activity_id: activity.stravaActivityId,
            name: activity.name,
            distance_meters: activity.distanceMeters,
            started_at: activity.startedAt,
          })),
          p_staged_activity_ids: [],
          p_skipped_delta: input.skippedDelta,
          p_scan_complete: false,
          p_next_status: input.status,
        });
        if (error) throw new Error("Could not save Strava synchronization progress");
        if (!data) return null;
        savedRun = toNewRun(data);
        return savedRun;
      },
    };
    result = await syncNewStravaActivities(accessToken, run, store, fetch, connection.athlete_id);
  } else {
    if (!repairRun) return failure("The saved Strava repair state is invalid.", 503, mode);
    let savedRun = repairRun;
    const store: RepairActivitySyncStore = {
      ...commonStore,
      async applyPage(input) {
        const { data, error } = await db.rpc("apply_strava_sync_page", {
          p_run_id: input.runId,
          p_expected_page: input.expectedPage,
          p_next_page: input.nextPage,
          p_activities: input.activities.map((activity) => ({
            bike_id: activity.bikeId,
            strava_activity_id: activity.stravaActivityId,
            name: activity.name,
            distance_meters: activity.distanceMeters,
            started_at: activity.startedAt,
          })),
          p_staged_activity_ids: input.stagedActivityIds,
          p_skipped_delta: input.skippedDelta,
          p_scan_complete: input.scanComplete,
          p_next_status: input.status,
        });
        if (error) throw new Error("Could not save Strava repair progress");
        if (!data) return null;
        savedRun = toRepairRun(data);
        return savedRun;
      },
      async getLocalActivityIds() {
        const ids = new Set<number>();
        for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
          const { data, error } = await db
            .from("activities")
            .select("strava_activity_id")
            .eq("user_id", user.id)
            .order("strava_activity_id", { ascending: true })
            .range(offset, offset + DATABASE_PAGE_SIZE - 1);
          if (error) throw new Error("Could not load local Strava activity IDs");
          for (const row of data) ids.add(row.strava_activity_id);
          if (data.length < DATABASE_PAGE_SIZE) return ids;
        }
      },
      async getStagedActivityIds(runId) {
        const ids = new Set<number>();
        for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
          const { data, error } = await db
            .from("strava_sync_activity_ids")
            .select("strava_activity_id")
            .eq("user_id", user.id)
            .eq("sync_run_id", runId)
            .order("strava_activity_id", { ascending: true })
            .range(offset, offset + DATABASE_PAGE_SIZE - 1);
          if (error) throw new Error("Could not load staged Strava activity IDs");
          for (const row of data) ids.add(row.strava_activity_id);
          if (data.length < DATABASE_PAGE_SIZE) return ids;
        }
      },
      async getVerifiedMissingActivityIds(runId) {
        const ids = new Set<number>();
        for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
          const { data, error } = await db
            .from("strava_sync_deleted_activity_ids")
            .select("strava_activity_id")
            .eq("user_id", user.id)
            .eq("sync_run_id", runId)
            .order("strava_activity_id", { ascending: true })
            .range(offset, offset + DATABASE_PAGE_SIZE - 1);
          if (error) throw new Error("Could not load verified Strava deletions");
          for (const row of data) ids.add(row.strava_activity_id);
          if (data.length < DATABASE_PAGE_SIZE) return ids;
        }
      },
      async recordVerification(input) {
        if (input.seenActivityIds.length > 0) {
          const { error: seenError } = await db.from("strava_sync_activity_ids").upsert(
            input.seenActivityIds.map((activityId) => ({
              user_id: user.id,
              sync_run_id: input.runId,
              strava_activity_id: activityId,
            })),
            { onConflict: "user_id,sync_run_id,strava_activity_id", ignoreDuplicates: true },
          );
          if (seenError) throw new Error("Could not stage rechecked Strava activities");
        }
        if (input.verifiedMissingActivityIds.length > 0) {
          const { error: stageError } = await db.from("strava_sync_deleted_activity_ids").upsert(
            input.verifiedMissingActivityIds.map((activityId) => ({
              user_id: user.id,
              sync_run_id: input.runId,
              strava_activity_id: activityId,
            })),
            { onConflict: "user_id,sync_run_id,strava_activity_id", ignoreDuplicates: true },
          );
          if (stageError) throw new Error("Could not stage verified Strava deletions");
        }
        const { data, error } = await db
          .from("strava_sync_runs")
          .update({
            verification_step: input.expectedStep + 1,
            inserted_count: savedRun.insertedCount + input.insertedDelta,
            updated_count: savedRun.updatedCount + input.updatedDelta,
            skipped_count: savedRun.skippedCount + input.skippedDelta,
            status: "partial",
          })
          .eq("id", input.runId)
          .eq("user_id", user.id)
          .eq("verification_step", input.expectedStep)
          .eq("scan_complete", true)
          .in("status", ["running", "partial"])
          .select(RUN_COLUMNS)
          .maybeSingle();
        if (error) throw new Error("Could not save removal verification progress");
        if (!data) return null;
        savedRun = toRepairRun(data);
        return savedRun;
      },
      async pauseRun(input) {
        const { data, error } = await db
          .from("strava_sync_runs")
          .update({ status: "partial" })
          .eq("id", input.runId)
          .eq("user_id", user.id)
          .eq("next_page", input.expectedPage)
          .eq("verification_step", input.expectedStep)
          .in("status", ["running", "partial"])
          .select(RUN_COLUMNS)
          .maybeSingle();
        if (error) throw new Error("Could not pause Strava repair progress");
        if (!data) return null;
        savedRun = toRepairRun(data);
        return savedRun;
      },
      async finalizeRun(runId, expectedStep) {
        const { data, error } = await db.rpc("finalize_strava_sync_run", {
          p_run_id: runId,
          p_expected_verification_step: expectedStep,
        });
        if (error) throw new Error("Could not finalize Strava repair");
        return data;
      },
    };
    result = await syncRepairStravaActivities(accessToken, repairRun, store, fetch, connection.athlete_id);
  }

  const responseStatus = (outcome: string, message?: string) =>
    outcome === "failed" ? (message?.startsWith("Another synchronization") ? 409 : 503) : 200;
  const responseCounts = {
    mode,
    updated: "updated" in result ? result.updated : 0,
    removed: "removed" in result ? result.removed : 0,
  };

  try {
    const { data: activityRows, error: activityError } = await db
      .from("activities")
      .select("id, name, distance_meters, started_at, bike_id")
      .eq("user_id", user.id)
      .not("bike_id", "is", null)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 100);
    if (activityError) throw new Error("Could not load synchronized activities");

    const bikeLinkedRows = activityRows;
    const bikeIds = [...new Set(bikeLinkedRows.map((activity) => activity.bike_id))];
    const { data: bikes, error: bikeError } =
      bikeIds.length > 0
        ? await db.from("bikes").select("id, name").eq("user_id", user.id).in("id", bikeIds)
        : { data: [], error: null };
    if (bikeError) throw new Error("Could not load synchronized bikes");

    return Response.json(
      {
        ...result,
        ...responseCounts,
        activities: toActivityViews(bikeLinkedRows.slice(0, 100), bikes),
        hasMoreActivities: activityRows.length > 100,
      },
      {
        status: responseStatus(result.outcome, result.message),
      },
    );
  } catch {
    return Response.json(
      {
        ...result,
        ...responseCounts,
        message: "Synchronization progress was saved, but the activity list could not be loaded.",
      },
      { status: responseStatus(result.outcome, result.message) },
    );
  }
};
