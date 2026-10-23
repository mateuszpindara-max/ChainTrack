import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getActivityPage,
  parseActivityBikeFilter,
  parseActivityChainFilter,
  parseActivityLimit,
  parseDashboardOffset,
  type DashboardActivityStore,
} from "@/lib/strava/dashboard-query.ts";
import { createClient } from "@/lib/supabase";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view activities." }, { status: 401 });

  const params = new URL(context.request.url).searchParams;
  const offset = parseDashboardOffset(params);
  const bikeFilter = parseActivityBikeFilter(params);
  const chainFilter = parseActivityChainFilter(params, bikeFilter.success ? bikeFilter.bikeId : null);
  const limit = parseActivityLimit(params);
  if (!offset.success || !bikeFilter.success || !chainFilter.success || !limit.success) {
    return Response.json({ message: "Invalid activity page." }, { status: 400 });
  }

  const db = supabase as unknown as SupabaseClient<StravaSyncDatabase>;
  const store: DashboardActivityStore = {
    async readActivities(input) {
      let query = db
        .from("activities_with_chain")
        .select("id, name, distance_meters, started_at, bike_id, chain_id, chain_name, is_waxing_start")
        .eq("user_id", input.userId)
        .not("bike_id", "is", null);
      if (input.bikeId) query = query.eq("bike_id", input.bikeId);
      if (input.chainId === "none") query = query.is("chain_id", null);
      else if (input.chainId !== null) query = query.eq("chain_id", input.chainId);
      const { data, error } = await query
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw new Error("Could not load activities");
      return data;
    },
    async readBikes(input) {
      if (input.ids.length === 0) return [];
      const { data, error } = await db.from("bikes").select("id, name").eq("user_id", input.userId).in("id", input.ids);
      if (error) throw new Error("Could not load activity bikes");
      return data;
    },
  };

  try {
    return Response.json(
      await getActivityPage(store, user.id, {
        offset: offset.value,
        bikeId: bikeFilter.bikeId,
        chainId: chainFilter.chainId,
        limit: limit.limit,
      }),
    );
  } catch {
    return Response.json({ message: "Could not load activities." }, { status: 503 });
  }
};
