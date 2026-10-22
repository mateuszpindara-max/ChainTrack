import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChainInput, toChainView } from "@/lib/chains/chain.ts";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const CHAIN_COLUMNS = "id, name, starting_distance_meters, created_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to update a chain." }, { status: 401 });
  const id = context.params.id ?? "";
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ message: "Invalid chain id." }, { status: 400 });
  }
  if (!hasJsonContentType(context.request)) {
    return Response.json({ message: "Content-Type must be application/json." }, { status: 415 });
  }

  let input: unknown;
  try {
    input = await context.request.json();
  } catch {
    return Response.json({ message: "Invalid chain details.", fieldErrors: {} }, { status: 400 });
  }
  const parsed = parseChainInput(input);
  if (!parsed.success) {
    return Response.json(
      { message: "Please correct the highlighted fields.", fieldErrors: parsed.fieldErrors },
      { status: 400 },
    );
  }

  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const { data, error } = await db
    .from("chains")
    .update({ name: parsed.data.name, starting_distance_meters: parsed.data.startingDistanceMeters })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(CHAIN_COLUMNS)
    .maybeSingle();

  if (error?.code === "23505") {
    const message = "You already have a chain with that name.";
    return Response.json({ message, fieldErrors: { name: message } }, { status: 409 });
  }
  if (error) return Response.json({ message: "Could not update the chain." }, { status: 503 });
  if (!data) return Response.json({ message: "Chain not found." }, { status: 404 });

  return Response.json({ chain: toChainView(data) });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to delete a chain." }, { status: 401 });
  const id = context.params.id ?? "";
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ message: "Invalid chain id." }, { status: 400 });
  }

  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const { data, error } = await db
    .from("chains")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return Response.json({ message: "Could not delete the chain." }, { status: 503 });
  if (!data) return Response.json({ message: "Chain not found." }, { status: 404 });

  return new Response(null, { status: 204 });
};
