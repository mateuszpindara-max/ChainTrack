import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { parseWaxingMarkInput, setWaxingMark, type WaxingMarkStore } from "@/lib/chains/waxing.ts";
import { createClient } from "@/lib/supabase";
import type { StravaSyncDatabase } from "@/lib/strava/sync-database.ts";

export const prerender = false;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class MissingWaxingReferenceError extends Error {}

function hasJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export const PUT: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to update a waxing mark." }, { status: 401 });

  const activityId = context.params.id ?? "";
  if (!UUID_PATTERN.test(activityId)) {
    return Response.json({ message: "Invalid activity id." }, { status: 400 });
  }
  if (!hasJsonContentType(context.request)) {
    return Response.json({ message: "Content-Type must be application/json." }, { status: 415 });
  }

  let input: unknown;
  try {
    input = await context.request.json();
  } catch {
    return Response.json({ message: "Invalid waxing mark." }, { status: 400 });
  }
  const parsed = parseWaxingMarkInput(input);
  if (!parsed.success) return Response.json({ message: "Invalid waxing mark." }, { status: 400 });

  const activityDb = supabase as unknown as SupabaseClient<StravaSyncDatabase>;
  const chainDb = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const store: WaxingMarkStore = {
    async readActivity(query) {
      const { data, error } = await activityDb
        .from("activities")
        .select("id, bike_id")
        .eq("id", query.activityId)
        .eq("user_id", query.userId)
        .maybeSingle();
      if (error) throw new Error("Could not load activity");
      return data ? { bikeId: data.bike_id } : null;
    },
    async chainExists(query) {
      const { data, error } = await chainDb
        .from("chains")
        .select("id")
        .eq("id", query.chainId)
        .eq("user_id", query.userId)
        .maybeSingle();
      if (error) throw new Error("Could not load chain");
      return data !== null;
    },
    async readMark(query) {
      const { data, error } = await chainDb
        .from("chain_waxing_marks")
        .select("chain_id")
        .eq("activity_id", query.activityId)
        .eq("user_id", query.userId)
        .maybeSingle();
      if (error) throw new Error("Could not load waxing mark");
      return data ? { chainId: data.chain_id } : null;
    },
    async upsertMark(query) {
      const { error } = await chainDb
        .from("chain_waxing_marks")
        .upsert(
          { activity_id: query.activityId, user_id: query.userId, chain_id: query.chainId },
          { onConflict: "activity_id" },
        );
      if (error?.code === "23503") throw new MissingWaxingReferenceError();
      if (error) throw new Error("Could not save waxing mark");
    },
    async deleteMark(query) {
      const { error } = await chainDb
        .from("chain_waxing_marks")
        .delete()
        .eq("activity_id", query.activityId)
        .eq("user_id", query.userId);
      if (error) throw new Error("Could not clear waxing mark");
    },
  };

  try {
    const result = await setWaxingMark(store, user.id, activityId, parsed.data.chainId);
    if (result.outcome === "activity-not-found" || result.outcome === "chain-not-found") {
      return Response.json({ message: "Activity or chain not found." }, { status: 404 });
    }
    return Response.json({ waxing: { activityId, chainId: result.chainId } });
  } catch (error) {
    if (error instanceof MissingWaxingReferenceError) {
      return Response.json({ message: "Activity or chain not found." }, { status: 404 });
    }
    return Response.json({ message: "Could not update the waxing mark." }, { status: 503 });
  }
};
