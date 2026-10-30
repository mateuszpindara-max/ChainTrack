import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { readBikeStatuses } from "@/lib/chains/lifecycle-api.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to view bike status." }, { status: 401 });
  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  try {
    const statuses = await readBikeStatuses(db, user.id);
    return Response.json({ statuses });
  } catch {
    return Response.json({ message: "Could not load bike status." }, { status: 503 });
  }
};
