import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

void test("Strava configuration is server-only and does not declare a service-role key", async () => {
  const astroConfig = await readFile(new URL("../../../astro.config.mjs", import.meta.url), "utf8");
  const stravaVariables = [
    "STRAVA_CLIENT_ID",
    "STRAVA_CLIENT_SECRET",
    "STRAVA_REDIRECT_URI",
    "STRAVA_TOKEN_ENCRYPTION_KEY",
  ];

  for (const name of stravaVariables) {
    const declaration = new RegExp(`${name}: envField\\.string\\(\\{([^}]+)\\}\\)`, "s").exec(astroConfig);
    assert.ok(declaration, `${name} has an Astro environment declaration`);
    assert.match(declaration[1], /context: "server"/);
    assert.match(declaration[1], /access: "secret"/);
  }
  assert.equal(astroConfig.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
});
