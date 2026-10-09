import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumeOAuthState,
  consumeOAuthStateFromDatabase,
  createOAuthState,
  decodeTokenEncryptionKey,
  decryptToken,
  encryptToken,
  hasRequiredStravaScopes,
  hashOAuthState,
  type OAuthStateDatabase,
  type OAuthStateQuery,
  requireStravaConfiguration,
} from "./security.ts";

const keyHex = "0123456789abcdef".repeat(4);

function createStateQueryMock(rowCount: number, calls: string[][]): OAuthStateDatabase {
  const queryResult = {
    data: Array.from({ length: rowCount }, (_, index) => ({ state_hash: `hash-${index}` })),
    error: null,
  };
  const query: OAuthStateQuery = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    gt(column, value) {
      calls.push(["gt", column, value]);
      return query;
    },
    select(column) {
      calls.push(["select", column]);
      return Promise.resolve(queryResult);
    },
  };
  return {
    from(table: string) {
      calls.push(["from", table]);
      return {
        delete(options: { count: "exact" }) {
          calls.push(["delete", options.count]);
          return query;
        },
      };
    },
  };
}

void test("AES-GCM token encryption round-trips and uses a fresh IV", async () => {
  const key = decodeTokenEncryptionKey(keyHex);
  const encryptedFirst = await encryptToken("access-token-secret", key);
  const encryptedSecond = await encryptToken("access-token-secret", key);

  assert.notEqual(encryptedFirst, encryptedSecond);
  assert.match(encryptedFirst, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.equal(await decryptToken(encryptedFirst, key), "access-token-secret");
});

void test("encryption key accepts exactly 32 bytes encoded as 64 hexadecimal characters", async () => {
  assert.equal(decodeTokenEncryptionKey(keyHex).byteLength, 32);
  assert.throws(() => decodeTokenEncryptionKey(`${keyHex}00`), /64 hexadecimal characters/);
  assert.throws(() => decodeTokenEncryptionKey("g".repeat(64)), /64 hexadecimal characters/);
  await assert.rejects(encryptToken("token", new Uint8Array(16)), /exactly 32 bytes/);
});

void test("missing Strava server configuration fails without revealing values", () => {
  assert.throws(() => requireStravaConfiguration({}), /STRAVA_CLIENT_ID/);
  assert.throws(
    () =>
      requireStravaConfiguration({
        STRAVA_CLIENT_ID: "configured-client-id",
        STRAVA_CLIENT_SECRET: "configured-client-secret",
        STRAVA_REDIRECT_URI: "http://localhost:4321/api/strava/callback",
        STRAVA_TOKEN_ENCRYPTION_KEY: "bad",
      }),
    /64 hexadecimal characters/,
  );
});

void test("required scope validation rejects denied or incomplete grants", () => {
  assert.equal(hasRequiredStravaScopes("activity:read_all,profile:read_all"), true);
  assert.equal(hasRequiredStravaScopes("activity:read_all"), false);
  assert.equal(hasRequiredStravaScopes("profile:read_all"), false);
  assert.equal(hasRequiredStravaScopes(""), false);
});

void test("OAuth state is one-use and bound to the initiating user and expiry", async () => {
  const state = createOAuthState();
  const stateHash = await (async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  })();
  const now = new Date("2026-10-09T12:00:00.000Z");
  const states = new Map([[stateHash, { userId: "user-a", expiresAt: new Date(now.getTime() + 60_000) }]]);
  const consume = (hash: string, userId: string, at: Date) => {
    const row = states.get(hash);
    if (row?.userId !== userId || row.expiresAt <= at) {
      return Promise.resolve(0);
    }
    states.delete(hash);
    return Promise.resolve(1);
  };

  assert.equal(await consumeOAuthState(state, "user-b", now, consume), false);
  assert.equal(await consumeOAuthState(state, "user-a", new Date(now.getTime() + 60_001), consume), false);
  assert.equal(await consumeOAuthState(state, "user-a", now, consume), true);
  assert.equal(await consumeOAuthState(state, "user-a", now, consume), false);
  assert.equal(await consumeOAuthState("malformed", "user-a", now, consume), false);
});

void test("OAuth callback consumes only one matching unexpired database state", async () => {
  const state = createOAuthState();
  const stateHash = await hashOAuthState(state);
  const now = new Date("2026-10-09T12:00:00.000Z");

  for (const [rowCount, expected] of [
    [0, false],
    [1, true],
    [2, false],
  ] as const) {
    const calls: string[][] = [];
    const supabase = createStateQueryMock(rowCount, calls);
    const accepted = await consumeOAuthState(state, "user-a", now, (hash, userId, consumedAt) =>
      consumeOAuthStateFromDatabase(supabase, hash, userId, consumedAt),
    );

    assert.equal(accepted, expected);
    assert.deepEqual(calls, [
      ["from", "strava_oauth_states"],
      ["delete", "exact"],
      ["eq", "state_hash", stateHash],
      ["eq", "user_id", "user-a"],
      ["gt", "expires_at", now.toISOString()],
      ["select", "state_hash"],
    ]);
  }
});
