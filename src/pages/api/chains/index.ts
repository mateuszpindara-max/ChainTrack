import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChainInput, toChainView } from "@/lib/chains/chain.ts";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const PAGE_SIZE = 100;
const CHAIN_COLUMNS = "id, name, starting_distance_meters, created_at";

function hasJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view your chains." }, { status: 401 });

  const params = new URL(context.request.url).searchParams;
  const rawOffset = params.get("offset");
  const offset = Number(rawOffset ?? "0");
  if (rawOffset !== null && rawOffset.trim() === "") {
    return Response.json({ message: "Invalid chain page." }, { status: 400 });
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return Response.json({ message: "Invalid chain page." }, { status: 400 });
  }

  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const { data, error } = await db
    .from("chains")
    .select(CHAIN_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (error) return Response.json({ message: "Could not load chains." }, { status: 503 });

  return Response.json({
    chains: data.slice(0, PAGE_SIZE).map(toChainView),
    hasMore: data.length > PAGE_SIZE,
  });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to create a chain." }, { status: 401 });
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
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      starting_distance_meters: parsed.data.startingDistanceMeters,
    })
    .select(CHAIN_COLUMNS)
    .single();

  if (error?.code === "23505") {
    const message = "You already have a chain with that name.";
    return Response.json({ message, fieldErrors: { name: message } }, { status: 409 });
  }
  if (error) return Response.json({ message: "Could not create the chain." }, { status: 503 });

  return Response.json({ chain: toChainView(data) }, { status: 201 });
};
