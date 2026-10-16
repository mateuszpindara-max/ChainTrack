import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { toActivityViews } from "@/lib/strava/activity-view.ts";
import {
  syncNewStravaActivities,
  type NewActivitySyncRun,
  type NewActivitySyncStore,
  type StravaBike,
} from "@/lib/strava/import.ts";
import { hasRequiredStravaScopes } from "@/lib/strava/security.ts";
import { getStravaAccessToken } from "@/lib/strava/server";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";

export const prerender = false;

const RUN_COLUMNS = "id, mode, status, next_page, inserted_count, skipped_count";

interface SyncRunRow {
  id: string;
  mode: string;
  status: string;
  next_page: number;
  inserted_count: number;
  skipped_count: number;
}

function failure(message: string, status: number): Response {
  return Response.json({ outcome: "failed", inserted: 0, updated: 0, skipped: 0, nextPage: 1, message }, { status });
}

function toRun(value: SyncRunRow): NewActivitySyncRun {
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
    status: value.status,
    nextPage: value.next_page,
    insertedCount: value.inserted_count,
    skippedCount: value.skipped_count,
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
  if (!isRecord(body) || body.mode !== "new" || (body.runId !== undefined && typeof body.runId !== "string")) {
    return failure("Choose a supported synchronization mode and try again.", 400);
  }
  const requestedRunId = typeof body.runId === "string" ? body.runId : undefined;

  const { data: connection, error: connectionError } = await supabase
    .from("strava_connections")
    .select("scopes, initial_import_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (connectionError) return failure("Could not check the Strava connection.", 503);
  if (!connection?.initial_import_completed_at) {
    return failure("Complete the initial Strava history import before synchronizing.", 409);
  }
  const scopes: unknown = connection.scopes;
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope: unknown) => typeof scope === "string") ||
    !hasRequiredStravaScopes(scopes.join(" "))
  ) {
    return failure("Connect Strava and grant the required read permissions before synchronizing.", 409);
  }

  let accessToken: string;
  try {
    accessToken = await getStravaAccessToken(supabase, user.id);
  } catch {
    return failure("The Strava connection is unavailable. Reconnect and try again.", 503);
  }

  const { data: activeRunRow, error: activeRunError } = await db
    .from("strava_sync_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", user.id)
    .in("status", ["running", "partial"])
    .maybeSingle();
  if (activeRunError) return failure("Could not check saved synchronization progress.", 503);

  let run: NewActivitySyncRun;
  if (activeRunRow) {
    if (activeRunRow.mode !== "new") {
      return failure("A different Strava synchronization mode is already active. Continue that run first.", 409);
    }
    try {
      run = toRun(activeRunRow);
    } catch {
      return failure("The saved Strava synchronization state is invalid.", 503);
    }
    if (requestedRunId && requestedRunId !== run.id) {
      return failure(
        "This synchronization run is no longer active. Refresh the dashboard and continue the active run.",
        409,
      );
    }
  } else {
    if (requestedRunId) return failure("This synchronization run is no longer active. Start a new import.", 409);
    const { data: createdRun, error: createRunError } = await supabase
      .from("strava_sync_runs")
      .insert({ user_id: user.id, mode: "new", status: "running", next_page: 1 })
      .select(RUN_COLUMNS)
      .single();
    if (createRunError) {
      return failure("Another synchronization may already be active. Refresh the dashboard and try again.", 409);
    }
    try {
      run = toRun(createdRun);
    } catch {
      return failure("Could not start the Strava synchronization.", 503);
    }
  }

  let savedRun = run;
  const store: NewActivitySyncStore = {
    async upsertBikes(bikes: StravaBike[]) {
      if (bikes.length === 0) return;
      const { error } = await db.from("bikes").upsert(
        bikes.map((bike) => ({ user_id: user.id, strava_gear_id: bike.id, name: bike.name })),
        { onConflict: "user_id,strava_gear_id" },
      );
      if (error) throw new Error("Could not save Strava bikes");
    },
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
    async insertActivitiesOnly(activities) {
      if (activities.length === 0) return 0;
      const { data, error } = await db
        .from("activities")
        .upsert(
          activities.map((activity) => ({
            user_id: user.id,
            bike_id: activity.bikeId,
            strava_activity_id: activity.stravaActivityId,
            name: activity.name,
            distance_meters: activity.distanceMeters,
            started_at: activity.startedAt,
          })),
          { onConflict: "user_id,strava_activity_id", ignoreDuplicates: true },
        )
        .select("strava_activity_id");
      if (error) throw new Error("Could not save new Strava activities");
      return data.length;
    },
    async advanceRun(input) {
      const { data, error } = await db
        .from("strava_sync_runs")
        .update({
          next_page: input.nextPage,
          inserted_count: savedRun.insertedCount + input.insertedDelta,
          skipped_count: savedRun.skippedCount + input.skippedDelta,
          status: input.status,
        })
        .eq("id", input.runId)
        .eq("user_id", user.id)
        .eq("next_page", input.expectedPage)
        .in("status", ["running", "partial"])
        .select(RUN_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("Could not save Strava synchronization progress");
      if (!data) return null;
      savedRun = toRun(data);
      return savedRun;
    },
  };

  const result = await syncNewStravaActivities(accessToken, run, store);
  try {
    const { data: activityRows, error: activityError } = await db
      .from("activities")
      .select("id, name, distance_meters, started_at, bike_id")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 100);
    if (activityError) throw new Error("Could not load synchronized activities");

    const bikeLinkedRows = activityRows.filter(
      (activity): activity is typeof activity & { bike_id: string } => activity.bike_id !== null,
    );
    const bikeIds = [...new Set(bikeLinkedRows.map((activity) => activity.bike_id))];
    const { data: bikes, error: bikeError } =
      bikeIds.length > 0
        ? await db.from("bikes").select("id, name").eq("user_id", user.id).in("id", bikeIds)
        : { data: [], error: null };
    if (bikeError) throw new Error("Could not load synchronized bikes");

    return Response.json(
      {
        ...result,
        updated: 0,
        activities: toActivityViews(bikeLinkedRows.slice(0, 100), bikes),
        hasMoreActivities: activityRows.length > 100,
      },
      {
        status: result.outcome === "failed" ? (result.message?.startsWith("Another synchronization") ? 409 : 503) : 200,
      },
    );
  } catch {
    return Response.json(
      {
        ...result,
        updated: 0,
        message: "Synchronization progress was saved, but the activity list could not be loaded.",
      },
      { status: result.outcome === "failed" ? 503 : 200 },
    );
  }
};
