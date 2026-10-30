import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".dev.vars");
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4339";
const databaseUrl = process.env.SUPABASE_URL;
const databaseKey = process.env.SUPABASE_KEY;
for (const value of [baseUrl, databaseUrl]) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "integration tests require localhost");
}
assert.equal(new URL(databaseUrl).port, "54321", "integration tests require local Supabase");
assert.ok(databaseKey, "SUPABASE_KEY is required");

const email = `waxing-integration-${randomUUID()}@example.test`;
const password = "Waxing-Integration-Password-1!";
const client = createClient(databaseUrl, databaseKey, { auth: { persistSession: false } });
const cookies = new Map();
let userId;

async function request(path, { method = "GET", form, json, cookie = true } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    redirect: "manual",
    headers: {
      Origin: baseUrl,
      ...(cookie ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form) : json !== undefined ? JSON.stringify(json) : undefined,
  });
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}

async function insert(table, row) {
  const { error } = await client.from(table).insert(row);
  if (error) throw new Error(`Could not create ${table} fixture: ${error.message}`);
}

try {
  const signup = await request("/api/auth/signup", { method: "POST", form: { email, password } });
  assert.equal(signup.status, 302);
  assert.ok(signup.headers.get("location")?.startsWith("/auth/confirm-email"), "signup must succeed");
  const { data: session, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  userId = session.user.id;
  const signin = await request("/api/auth/signin", { method: "POST", form: { email, password } });
  assert.equal(signin.headers.get("location"), "/dashboard");

  const bikeId = randomUUID();
  const activityId = randomUUID();
  const firstChainId = randomUUID();
  const secondChainId = randomUUID();
  await insert("bikes", { id: bikeId, user_id: userId, strava_gear_id: `integration-${bikeId}`, name: "Bike" });
  await insert("activities", {
    id: activityId,
    user_id: userId,
    bike_id: bikeId,
    strava_activity_id: Math.floor(Date.now() / 1000),
    name: "Ride",
    distance_meters: 30000,
    started_at: new Date().toISOString(),
  });
  await insert("chains", { id: firstChainId, user_id: userId, name: "First" });
  await insert("chains", { id: secondChainId, user_id: userId, name: "Second" });

  const createdResponse = await request("/api/chains", { method: "POST", json: { name: "Created", startingKm: 1 } });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).chain;
  const baseKeys = ["createdAt", "id", "name", "startingDistanceMeters"];
  assert.deepEqual(Object.keys(created).sort(), baseKeys);
  const updatedResponse = await request(`/api/chains/${created.id}`, {
    method: "PATCH",
    json: { name: "Updated", startingKm: 2 },
  });
  assert.equal(updatedResponse.status, 200);
  assert.deepEqual(Object.keys((await updatedResponse.json()).chain).sort(), baseKeys);
  const chainList = await request("/api/chains");
  assert.equal(chainList.status, 200);
  assert.equal((await chainList.json()).chains.find((chain) => chain.id === created.id).totalDistanceMeters, 2000);
  const dashboard = await request("/dashboard");
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.ok(dashboardHtml.includes("initialChains"));
  assert.ok(dashboardHtml.includes("totalDistanceMeters"));

  const path = `/api/strava/activities/${activityId}/waxing`;
  assert.equal((await request(path, { method: "PUT", json: { chainId: firstChainId }, cookie: false })).status, 401);
  assert.equal((await request(path, { method: "PUT" })).status, 415);
  assert.equal((await request(path, { method: "PUT", json: { chainId: "bad" } })).status, 400);
  assert.equal((await request(path, { method: "PUT", json: { chainId: randomUUID() } })).status, 404);

  for (const chainId of [firstChainId, firstChainId, secondChainId, null, null]) {
    const response = await request(path, { method: "PUT", json: { chainId } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { waxing: { activityId, chainId } });
    const { data, error } = await client
      .from("chain_waxing_marks")
      .select("chain_id")
      .eq("activity_id", activityId)
      .maybeSingle();
    if (error) throw error;
    assert.equal(data?.chain_id ?? null, chainId);
  }
  console.log("PASS: authenticated waxing route validates, inserts, retries, reassigns, and clears marks");

  assert.equal((await request(path, { method: "PUT", json: { chainId: firstChainId } })).status, 200);
  const metricsPath = `/api/chains/${firstChainId}/metrics`;
  const metrics = await request(metricsPath);
  assert.equal(metrics.status, 200);
  const metricBody = await metrics.json();
  assert.equal(metricBody.chain.activeDistanceMeters, 30000);
  assert.equal(metricBody.cycles.length, 1);
  assert.equal(metricBody.hasMore, false);
  assert.equal((await request(`/api/chains/${randomUUID()}/metrics`)).status, 404);

  const thresholdPath = `/api/chains/${firstChainId}/threshold`;
  assert.equal((await request(thresholdPath, { method: "PATCH" })).status, 415);
  assert.equal((await request(thresholdPath, { method: "PATCH", json: { thresholdKm: 0 } })).status, 400);
  assert.equal((await request(thresholdPath, { method: "PATCH", json: { thresholdKm: 100.01 } })).status, 400);
  assert.equal(
    (await request(`/api/chains/${randomUUID()}/threshold`, { method: "PATCH", json: { thresholdKm: 100 } })).status,
    404,
  );
  assert.equal((await request(thresholdPath, { method: "PATCH", json: { thresholdKm: 100.5 } })).status, 200);
  const statuses = await request("/api/chains/bike-status");
  assert.equal(statuses.status, 200);
  assert.deepEqual((await statuses.json()).statuses, [
    {
      bikeId,
      chainId: firstChainId,
      chainName: "First",
      activeDistanceMeters: 30000,
      thresholdKm: 100.5,
      status: "active",
    },
  ]);

  const stopPath = `/api/chains/${firstChainId}/stop`;
  assert.equal((await request(stopPath, { method: "POST" })).status, 200);
  assert.equal((await request(stopPath, { method: "POST" })).status, 200);
  const { data: stops, error: stopsError } = await client
    .from("chain_stop_events")
    .select("id")
    .eq("chain_id", firstChainId);
  if (stopsError) throw stopsError;
  assert.equal(stops.length, 1);
  assert.deepEqual((await (await request("/api/chains/bike-status")).json()).statuses, []);
  console.log("PASS: lifecycle API returns metrics, validates thresholds, and stops idempotently");
} finally {
  if (userId) {
    assert.match(userId, /^[0-9a-f-]{36}$/i);
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_chaintrack",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `delete from auth.users where id = '${userId}'`,
      ],
      { stdio: "ignore" },
    );
  }
}
