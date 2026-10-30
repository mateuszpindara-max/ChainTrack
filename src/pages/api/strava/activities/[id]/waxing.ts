import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { parseWaxingMarkInput } from "@/lib/chains/waxing.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const chainDb = supabase as unknown as SupabaseClient<ChainsDatabase>;
  try {
    const { data, error } = await chainDb.rpc("set_chain_waxing_mark", {
      p_activity_id: activityId,
      p_chain_id: parsed.data.chainId,
    });
    if (error) throw error;
    if (data === "activity-not-found" || data === "chain-not-found") {
      return Response.json({ message: "Activity or chain not found." }, { status: 404 });
    }
    if (data !== "saved") throw new Error("Unexpected waxing mutation result");
    return Response.json({ waxing: { activityId, chainId: parsed.data.chainId } });
  } catch {
    return Response.json({ message: "Could not update the waxing mark." }, { status: 503 });
  }
};
