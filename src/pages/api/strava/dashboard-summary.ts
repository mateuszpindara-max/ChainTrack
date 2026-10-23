import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDashboardSummaryInterval,
  summarizeDashboardActivities,
  type DashboardSummaryStore,
} from "@/lib/strava/dashboard-summary.ts";
import { createClient } from "@/lib/supabase";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view your dashboard summary." }, { status: 401 });

  const params = new URL(context.request.url).searchParams;
  const interval = parseDashboardSummaryInterval(params.get("start"), params.get("end"));
  if (!interval) return Response.json({ message: "Invalid summary interval." }, { status: 400 });

  const db = supabase as unknown as SupabaseClient<StravaSyncDatabase>;
  const store: DashboardSummaryStore = {
    async readActivities(input) {
      const { data, error } = await db
        .from("activities")
        .select("id, bike_id, distance_meters, started_at")
        .eq("user_id", input.userId)
        .gte("started_at", input.start)
        .lt("started_at", input.end)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw new Error("Could not load dashboard summary activities");
      return data;
    },
  };

  try {
    return Response.json(await summarizeDashboardActivities(store, user.id, interval));
  } catch {
    return Response.json({ message: "Could not load dashboard summary." }, { status: 503 });
  }
};
