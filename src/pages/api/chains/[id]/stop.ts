import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { UUID_PATTERN } from "@/lib/chains/lifecycle-api.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to stop a chain." }, { status: 401 });
  const id = context.params.id ?? "";
  if (!UUID_PATTERN.test(id)) return Response.json({ message: "Invalid chain id." }, { status: 400 });
  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const { data, error } = await db.rpc("stop_chain", { p_chain_id: id });
  if (error || (data !== "saved" && data !== "chain-not-found"))
    return Response.json({ message: "Could not stop the chain." }, { status: 503 });
  if (data === "chain-not-found") return Response.json({ message: "Chain not found." }, { status: 404 });
  return Response.json({ stopped: true });
};
