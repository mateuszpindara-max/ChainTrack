import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { parseOffset, readChainMetrics, UUID_PATTERN } from "@/lib/chains/lifecycle-api.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view chain metrics." }, { status: 401 });
  const id = context.params.id ?? "";
  const offset = parseOffset(new URL(context.request.url).searchParams.get("offset"));
  if (!UUID_PATTERN.test(id) || offset === null)
    return Response.json({ message: "Invalid chain or page." }, { status: 400 });
  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  try {
    const result = await readChainMetrics(db, user.id, id, offset);
    return result ? Response.json(result) : Response.json({ message: "Chain not found." }, { status: 404 });
  } catch {
    return Response.json({ message: "Could not load chain metrics." }, { status: 503 });
  }
};
