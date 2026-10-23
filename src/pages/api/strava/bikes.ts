import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBikePage, parseDashboardOffset, type DashboardBikeStore } from "@/lib/strava/dashboard-query.ts";
import { createClient } from "@/lib/supabase";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view bikes." }, { status: 401 });

  const offset = parseDashboardOffset(new URL(context.request.url).searchParams);
  if (!offset.success) return Response.json({ message: "Invalid bike page." }, { status: 400 });

  const db = supabase as unknown as SupabaseClient<StravaSyncDatabase>;
  const store: DashboardBikeStore = {
    async readBikes(input) {
      const { data, error } = await db
        .from("bikes")
        .select("id, name")
        .eq("user_id", input.userId)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw new Error("Could not load bikes");
      return data;
    },
  };

  try {
    return Response.json(await getBikePage(store, user.id, offset.value));
  } catch {
    return Response.json({ message: "Could not load bikes." }, { status: 503 });
  }
};
