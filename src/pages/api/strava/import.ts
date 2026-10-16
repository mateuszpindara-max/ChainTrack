import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toActivityViews } from "@/lib/strava/activity-view.ts";
import {
  importStravaHistory,
  STRAVA_ACTIVITY_PAGES_PER_IMPORT,
  type ImportedActivity,
  type StravaBike,
} from "@/lib/strava/import.ts";
import { hasRequiredStravaScopes } from "@/lib/strava/security.ts";
import { getStravaAccessToken } from "@/lib/strava/server";

export const prerender = false;

function failure(message: string, status: number): Response {
  return Response.json({ outcome: "failed", inserted: 0, updated: 0, skipped: 0, message }, { status });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function readSavedBikeIds(value: unknown): [gearId: string, bikeId: string][] {
  if (!Array.isArray(value)) throw new Error("Could not save Strava bikes");

  const rows: unknown[] = value;
  const savedBikeIds: [gearId: string, bikeId: string][] = [];
  for (const row of rows) {
    if (
      typeof row !== "object" ||
      row === null ||
      !("strava_gear_id" in row) ||
      typeof row.strava_gear_id !== "string" ||
      !("id" in row) ||
      typeof row.id !== "string"
    ) {
      throw new Error("Could not save Strava bikes");
    }
    savedBikeIds.push([row.strava_gear_id, row.id]);
  }
  return savedBikeIds;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return failure("Sign in to import your Strava history.", 401);

  const { data: connection, error: connectionError } = await supabase
    .from("strava_connections")
    .select("scopes, initial_import_completed_at, initial_import_next_page")
    .eq("user_id", user.id)
    .maybeSingle();
  if (connectionError) return failure("Could not check the Strava connection.", 503);
  if (connection?.initial_import_completed_at) {
    return failure("The initial Strava history import is already complete.", 409);
  }
  const startPage: unknown = connection?.initial_import_next_page;
  if (typeof startPage !== "number" || !Number.isSafeInteger(startPage) || startPage < 1) {
    return failure("The saved Strava import progress is invalid. Reconnect and try again.", 503);
  }
  const scopes: unknown = connection?.scopes;
  if (!connection || !isStringArray(scopes) || !hasRequiredStravaScopes(scopes.join(" "))) {
    return failure("Connect Strava and grant the required read permissions before importing.", 409);
  }

  let accessToken: string;
  try {
    accessToken = await getStravaAccessToken(supabase, user.id);
  } catch {
    return failure("The Strava connection is unavailable. Reconnect and try again.", 503);
  }

  const bikeIds = new Map<string, string>();
  const result = await importStravaHistory(
    accessToken,
    {
      async upsertBikes(bikes: StravaBike[]) {
        if (bikes.length === 0) return;
        const { data, error } = await supabase
          .from("bikes")
          .upsert(
            bikes.map((bike) => ({ user_id: user.id, strava_gear_id: bike.id, name: bike.name })),
            { onConflict: "user_id,strava_gear_id" },
          )
          .select("id, strava_gear_id");
        if (error) throw new Error("Could not save Strava bikes");
        for (const [gearId, bikeId] of readSavedBikeIds(data)) bikeIds.set(gearId, bikeId);
      },
      async upsertActivities(activities: ImportedActivity[]) {
        const rows = activities.map((activity) => {
          const bikeId = bikeIds.get(activity.gearId);
          if (!bikeId) throw new Error("Imported activity bike was not saved");
          return {
            user_id: user.id,
            bike_id: bikeId,
            strava_activity_id: activity.stravaActivityId,
            name: activity.name,
            distance_meters: activity.distanceMeters,
            started_at: activity.startedAt,
          };
        });
        const { data: existing, error: readError } = await supabase
          .from("activities")
          .select("strava_activity_id")
          .eq("user_id", user.id)
          .in(
            "strava_activity_id",
            rows.map((row) => row.strava_activity_id),
          );
        if (readError) throw new Error("Could not check existing Strava activities");

        const existingIds = new Set(existing.map((row) => String(row.strava_activity_id)));
        const { error: upsertError } = await supabase
          .from("activities")
          .upsert(rows, { onConflict: "user_id,strava_activity_id" });
        if (upsertError) throw new Error("Could not save Strava activities");

        const updated = rows.filter((row) => existingIds.has(String(row.strava_activity_id))).length;
        return { inserted: rows.length - updated, updated };
      },
    },
    fetch,
    { startPage, maxPages: STRAVA_ACTIVITY_PAGES_PER_IMPORT },
  );

  if (result.outcome === "partial" || result.outcome === "complete") {
    const progressUpdate =
      result.outcome === "complete"
        ? { initial_import_next_page: result.nextPage, initial_import_completed_at: new Date().toISOString() }
        : { initial_import_next_page: result.nextPage };
    const { data: savedProgress, error: progressError } = await supabase
      .from("strava_connections")
      .update(progressUpdate)
      .eq("user_id", user.id)
      .eq("initial_import_next_page", startPage)
      .select("user_id")
      .maybeSingle();
    if (progressError) {
      return failure("History was imported, but progress could not be saved. Retry safely.", 503);
    }
    if (!savedProgress) {
      return failure("Another import request advanced history. Continue the import again.", 409);
    }
  }

  try {
    const [{ data: activityRows, error: activityError }, { data: bikes, error: bikeError }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, name, distance_meters, started_at, bike_id")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, 100),
      supabase.from("bikes").select("id, name").eq("user_id", user.id),
    ]);
    if (activityError || bikeError) {
      return failure("Import results were saved, but the activity list could not be loaded.", 503);
    }

    return Response.json({
      ...result,
      activities: toActivityViews(activityRows.slice(0, 100), bikes),
      hasMoreActivities: activityRows.length > 100,
    });
  } catch {
    return failure("Import results were saved, but the activity list could not be loaded.", 503);
  }
};
