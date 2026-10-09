import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

void test("Strava configuration is server-only and does not declare a service-role key", async () => {
  const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const astroConfig = await readFile(join(projectRoot, "astro.config.mjs"), "utf8");
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

  async function runtimeFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) return runtimeFiles(entryPath);
        if (entry.isFile() && /\.(?:astro|mjs|ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
          return [entryPath];
        }
        return [];
      }),
    );
    return nestedFiles.flat();
  }

  const forbiddenName = ["SUPABASE", "SERVICE_ROLE_KEY"].join("_");
  const paths = [
    ...(await runtimeFiles(join(projectRoot, "src"))),
    join(projectRoot, "astro.config.mjs"),
    join(projectRoot, "wrangler.jsonc"),
  ];
  const sourceFiles = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  assert.equal(
    sourceFiles.some((source) => source.includes(forbiddenName)),
    false,
  );
});
