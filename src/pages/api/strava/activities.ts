import type { APIRoute } from "astro";
import { toActivityViews } from "@/lib/strava/activity-view.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const PAGE_SIZE = 100;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view activities." }, { status: 401 });

  const offsetValue = Number(new URL(context.request.url).searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(offsetValue) || offsetValue < 0 || offsetValue > 1_000_000) {
    return Response.json({ message: "Invalid activity page." }, { status: 400 });
  }

  const [{ data: activities, error: activityError }, { data: bikes, error: bikeError }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, name, distance_meters, started_at, bike_id")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offsetValue, offsetValue + PAGE_SIZE),
    supabase.from("bikes").select("id, name").eq("user_id", user.id),
  ]);

  if (activityError || bikeError) {
    return Response.json({ message: "Could not load activities." }, { status: 503 });
  }

  return Response.json({
    activities: toActivityViews(activities.slice(0, PAGE_SIZE), bikes),
    hasMore: activities.length > PAGE_SIZE,
  });
};
