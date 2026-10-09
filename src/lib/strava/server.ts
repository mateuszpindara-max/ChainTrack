import {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REDIRECT_URI,
  STRAVA_TOKEN_ENCRYPTION_KEY,
} from "astro:env/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, requireStravaConfiguration } from "./security.ts";
import { refreshStravaAccessToken, type StravaTokenConnection } from "./token.ts";

export function getStravaConfiguration() {
  return requireStravaConfiguration({
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET,
    STRAVA_REDIRECT_URI,
    STRAVA_TOKEN_ENCRYPTION_KEY,
  });
}

export async function getStravaAccessToken(supabase: SupabaseClient, userId: string): Promise<string> {
  const configuration = getStravaConfiguration();
  const { data, error } = await supabase
    .from("strava_connections")
    .select("access_token_ciphertext, refresh_token_ciphertext, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Strava connection is unavailable");
  const connection: StravaTokenConnection = data;

  const expiry = Date.parse(connection.token_expires_at);
  if (Number.isFinite(expiry) && expiry > Date.now() + 60_000) {
    return decryptToken(connection.access_token_ciphertext, configuration.encryptionKey);
  }

  return refreshStravaAccessToken(connection, configuration, async (update) => {
    const { data, error: updateError } = await supabase
      .from("strava_connections")
      .update(update)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (updateError || !data) throw new Error("Could not persist the refreshed Strava token");
  });
}

export async function saveStravaConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number; athleteId: number; scopes: string[] },
) {
  const configuration = getStravaConfiguration();
  const { error } = await supabase.from("strava_connections").upsert(
    {
      user_id: userId,
      access_token_ciphertext: await encryptToken(tokens.accessToken, configuration.encryptionKey),
      refresh_token_ciphertext: await encryptToken(tokens.refreshToken, configuration.encryptionKey),
      token_expires_at: new Date(tokens.expiresAt * 1000).toISOString(),
      athlete_id: tokens.athleteId,
      scopes: tokens.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Could not save the Strava connection");
}
