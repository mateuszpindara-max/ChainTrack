import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTokenEncryptionKey, decryptToken, encryptToken } from "./security.ts";
import { refreshStravaAccessToken } from "./token.ts";

void test("refresh persists the rotated refresh token before returning the new access token", async () => {
  const encryptionKey = decodeTokenEncryptionKey("ab".repeat(32));
  const configuration = {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:4321/api/strava/callback",
    encryptionKey,
  };
  const connection = {
    access_token_ciphertext: await encryptToken("expired-access-token", encryptionKey),
    refresh_token_ciphertext: await encryptToken("old-refresh-token", encryptionKey),
    token_expires_at: "2026-10-09T11:00:00.000Z",
  };
  let persisted: Parameters<Parameters<typeof refreshStravaAccessToken>[2]>[0] | undefined;
  const accessToken = await refreshStravaAccessToken(
    connection,
    configuration,
    (update) => {
      persisted = update;
      return Promise.resolve();
    },
    (_input, init) => {
      assert.equal(new URLSearchParams(init?.body as URLSearchParams).get("refresh_token"), "old-refresh-token");
      return Promise.resolve(
        Response.json({
          access_token: "rotated-access-token",
          refresh_token: "new-refresh-token",
          expires_at: 1_798_000_000,
        }),
      );
    },
    new Date("2026-10-09T12:00:00.000Z"),
  );

  assert.equal(accessToken, "rotated-access-token");
  assert.ok(persisted);
  assert.notEqual(persisted.refresh_token_ciphertext, "new-refresh-token");
  assert.equal(await decryptToken(persisted.refresh_token_ciphertext, encryptionKey), "new-refresh-token");
  assert.equal(await decryptToken(persisted.access_token_ciphertext, encryptionKey), "rotated-access-token");
});
