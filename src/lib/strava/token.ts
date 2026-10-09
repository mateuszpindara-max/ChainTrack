import { decryptToken, encryptToken, type StravaConfiguration } from "./security.ts";

export interface StravaTokenConnection {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
}

export interface StravaTokenUpdate {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  updated_at: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof value.access_token === "string" &&
    "refresh_token" in value &&
    typeof value.refresh_token === "string" &&
    "expires_at" in value &&
    typeof value.expires_at === "number" &&
    Number.isFinite(value.expires_at)
  );
}

export async function refreshStravaAccessToken(
  connection: StravaTokenConnection,
  configuration: StravaConfiguration,
  persist: (update: StravaTokenUpdate) => Promise<void>,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<string> {
  const refreshToken = await decryptToken(connection.refresh_token_ciphertext, configuration.encryptionKey);
  const response = await fetcher("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Strava token refresh failed");

  const result = await response.json();
  if (!isTokenResponse(result)) {
    throw new Error("Strava returned an invalid token refresh response");
  }

  await persist({
    access_token_ciphertext: await encryptToken(result.access_token, configuration.encryptionKey),
    refresh_token_ciphertext: await encryptToken(result.refresh_token, configuration.encryptionKey),
    token_expires_at: new Date(result.expires_at * 1000).toISOString(),
    updated_at: now.toISOString(),
  });
  return result.access_token;
}
