import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createOAuthState, hashOAuthState, REQUIRED_STRAVA_SCOPES } from "@/lib/strava/security.ts";
import { getStravaConfiguration } from "@/lib/strava/server";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!supabase || !user) return context.redirect("/auth/signin");

  let configuration;
  try {
    configuration = getStravaConfiguration();
  } catch {
    return new Response("Strava connection is not configured", { status: 503 });
  }

  const state = createOAuthState();
  const { error } = await supabase.from("strava_oauth_states").insert({
    state_hash: await hashOAuthState(state),
    user_id: user.id,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return new Response("Could not start Strava authorization", { status: 503 });

  const authorizationUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: REQUIRED_STRAVA_SCOPES.join(","),
    state,
  }).toString();
  return context.redirect(authorizationUrl.toString());
};
