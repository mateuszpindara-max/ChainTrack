import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "@/lib/chains/database.ts";
import { UUID_PATTERN } from "@/lib/chains/lifecycle-api.ts";
import { thresholdSchema } from "@/lib/chains/threshold.ts";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!user || !supabase) return Response.json({ message: "Sign in to update a threshold." }, { status: 401 });
  const id = context.params.id ?? "";
  if (!UUID_PATTERN.test(id)) return Response.json({ message: "Invalid chain id." }, { status: 400 });
  if (context.request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ message: "Content-Type must be application/json." }, { status: 415 });
  }
  let input: unknown;
  try {
    input = await context.request.json();
  } catch {
    return Response.json({ message: "Invalid threshold." }, { status: 400 });
  }
  const parsed = thresholdSchema.safeParse(input);
  if (!parsed.success) return Response.json({ message: "Invalid threshold." }, { status: 400 });
  const db = supabase as unknown as SupabaseClient<ChainsDatabase>;
  const { data, error } = await db
    .from("chains")
    .update({ threshold_km: parsed.data.thresholdKm })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, threshold_km")
    .maybeSingle();
  if (error) return Response.json({ message: "Could not update the threshold." }, { status: 503 });
  if (!data) return Response.json({ message: "Chain not found." }, { status: 404 });
  return Response.json({ thresholdKm: data.threshold_km });
};
