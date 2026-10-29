import {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REDIRECT_URI,
  STRAVA_TOKEN_ENCRYPTION_KEY,
} from "astro:env/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStravaConnectionCredentialUpdate,
  decryptToken,
  encryptToken,
  requireStravaConfiguration,
} from "./security.ts";
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
      .eq("refresh_token_ciphertext", connection.refresh_token_ciphertext)
      .select("user_id")
      .maybeSingle();
    if (updateError) throw new Error("Could not persist the refreshed Strava token");
    if (data) return;

    const { data: winner, error: readError } = await supabase
      .from("strava_connections")
      .select("access_token_ciphertext, token_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (
      readError ||
      !winner ||
      typeof winner.access_token_ciphertext !== "string" ||
      typeof winner.token_expires_at !== "string" ||
      Date.parse(winner.token_expires_at) <= Date.now() + 60_000
    ) {
      throw new Error("Could not use the concurrently refreshed Strava token");
    }
    return decryptToken(winner.access_token_ciphertext, configuration.encryptionKey);
  });
}

export async function saveStravaConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number; athleteId: number; scopes: string[] },
) {
  const configuration = getStravaConfiguration();
  const { error } = await supabase.from("strava_connections").upsert(
    buildStravaConnectionCredentialUpdate({
      userId,
      accessTokenCiphertext: await encryptToken(tokens.accessToken, configuration.encryptionKey),
      refreshTokenCiphertext: await encryptToken(tokens.refreshToken, configuration.encryptionKey),
      tokenExpiresAt: new Date(tokens.expiresAt * 1000).toISOString(),
      athleteId: tokens.athleteId,
      scopes: tokens.scopes,
      updatedAt: new Date().toISOString(),
    }),
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Could not save the Strava connection");
}
