import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  canReconnectStravaAthlete,
  consumeOAuthState,
  consumeOAuthStateFromDatabase,
  hasRequiredStravaScopes,
} from "@/lib/strava/security.ts";
import { getStravaConfiguration, saveStravaConnection } from "@/lib/strava/server";
import { stravaCallbackDenialStatus, stravaCallbackRedirect } from "@/lib/strava/sync-contract.ts";

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
    return context.redirect(stravaCallbackRedirect("failed"));
  }

  const state = context.url.searchParams.get("state") ?? "";
  const validState = await consumeOAuthState(state, user.id, new Date(), (stateHash, userId, now) =>
    consumeOAuthStateFromDatabase(supabase, stateHash, userId, now),
  );
  if (!validState) return context.redirect(stravaCallbackRedirect("failed"));

  const providerError = context.url.searchParams.get("error");
  const code = context.url.searchParams.get("code");
  const scopeValue = context.url.searchParams.get("scope") ?? "";
  const denialStatus = stravaCallbackDenialStatus(
    Boolean(providerError),
    Boolean(code),
    hasRequiredStravaScopes(scopeValue),
  );
  if (denialStatus) {
    return context.redirect(stravaCallbackRedirect(denialStatus));
  }

  let response: Response;
  try {
    response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code: code ?? "",
        grant_type: "authorization_code",
      }),
    });
  } catch {
    return context.redirect(stravaCallbackRedirect("failed"));
  }
  if (!response.ok) return context.redirect(stravaCallbackRedirect("failed"));

  let tokens: ExchangeResponse;
  try {
    tokens = await response.json();
  } catch {
    return context.redirect(stravaCallbackRedirect("failed"));
  }
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.expires_at !== "number" ||
    !Number.isFinite(tokens.expires_at) ||
    typeof tokens.athlete?.id !== "number" ||
    !Number.isSafeInteger(tokens.athlete.id)
  ) {
    return context.redirect(stravaCallbackRedirect("failed"));
  }

  const { data: existingConnection, error: existingConnectionError } = await supabase
    .from("strava_connections")
    .select("athlete_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingConnectionError) return context.redirect(stravaCallbackRedirect("failed"));
  const existingAthleteId: number | null =
    typeof existingConnection?.athlete_id === "number" ? existingConnection.athlete_id : null;
  if (!canReconnectStravaAthlete(existingAthleteId, tokens.athlete.id)) {
    return context.redirect(stravaCallbackRedirect("failed"));
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
    return context.redirect(stravaCallbackRedirect("failed"));
  }
  return context.redirect(stravaCallbackRedirect("connected"));
};
