import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  canReconnectStravaAthlete,
  consumeOAuthState,
  consumeOAuthStateFromDatabase,
  hasRequiredStravaScopes,
} from "@/lib/strava/security.ts";
import { getStravaConfiguration, saveStravaConnection } from "@/lib/strava/server";

export const prerender = false;

interface ExchangeResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: { id?: unknown };
}

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

  const state = context.url.searchParams.get("state") ?? "";
  const validState = await consumeOAuthState(state, user.id, new Date(), (stateHash, userId, now) =>
    consumeOAuthStateFromDatabase(supabase, stateHash, userId, now),
  );
  if (!validState) return new Response("Invalid or expired Strava authorization state", { status: 400 });

  const providerError = context.url.searchParams.get("error");
  const code = context.url.searchParams.get("code");
  const scopeValue = context.url.searchParams.get("scope") ?? "";
  if (providerError || !code || !hasRequiredStravaScopes(scopeValue)) {
    return new Response("Strava authorization was denied or required scopes were not granted", { status: 403 });
  }

  let response: Response;
  try {
    response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
  } catch {
    return new Response("Strava authorization could not be completed", { status: 502 });
  }
  if (!response.ok) return new Response("Strava authorization could not be completed", { status: 502 });

  let tokens: ExchangeResponse;
  try {
    tokens = await response.json();
  } catch {
    return new Response("Strava returned an invalid authorization response", { status: 502 });
  }
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.expires_at !== "number" ||
    !Number.isFinite(tokens.expires_at) ||
    typeof tokens.athlete?.id !== "number" ||
    !Number.isSafeInteger(tokens.athlete.id)
  ) {
    return new Response("Strava returned an invalid authorization response", { status: 502 });
  }

  const { data: existingConnection, error: existingConnectionError } = await supabase
    .from("strava_connections")
    .select("athlete_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingConnectionError) return new Response("Could not verify the existing Strava connection", { status: 503 });
  const existingAthleteId: number | null =
    typeof existingConnection?.athlete_id === "number" ? existingConnection.athlete_id : null;
  if (!canReconnectStravaAthlete(existingAthleteId, tokens.athlete.id)) {
    return new Response(
      "This Strava connection is bound to a different athlete. Reset or reimport its history before switching accounts.",
      { status: 409 },
    );
  }

  try {
    await saveStravaConnection(supabase, user.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      athleteId: tokens.athlete.id,
      scopes: scopeValue.split(/[\s,]+/).filter(Boolean),
    });
  } catch {
    return new Response("Could not save the Strava connection", { status: 500 });
  }
  return context.redirect("/dashboard?strava=connected");
};
