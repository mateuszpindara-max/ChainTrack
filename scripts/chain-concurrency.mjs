import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const userId = randomUUID();
const bikeId = randomUUID();
const chainId = randomUUID();
const activityId = randomUUID();
const dockerArgs = [
  "exec",
  "-i",
  "supabase_db_chaintrack",
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
];

function sql(query) {
  return execFileSync("docker", [...dockerArgs, "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const auth = `set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true);`;
let stopSession;
try {
  sql(`insert into auth.users (id, aud, role, email) values ('${userId}', 'authenticated', 'authenticated', '${userId}@example.test');
    insert into public.bikes (id, user_id, strava_gear_id, name) values ('${bikeId}', '${userId}', '${bikeId}', 'Bike');
    insert into public.chains (id, user_id, name) values ('${chainId}', '${userId}', 'Chain');
    insert into public.activities (id, user_id, bike_id, strava_activity_id, name, distance_meters, started_at)
      values ('${activityId}', '${userId}', '${bikeId}', 1, 'Ride', 1000, clock_timestamp() - interval '1 day');
    insert into public.chain_waxing_marks (activity_id, user_id, chain_id) values ('${activityId}', '${userId}', '${chainId}');`);

  stopSession = spawn("docker", dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errorOutput = "";
  stopSession.stderr.setEncoding("utf8");
  stopSession.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });
  const ready = new Promise((resolve, reject) => {
    stopSession.stdout.setEncoding("utf8");
    stopSession.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("LOCK_READY")) resolve();
    });
    stopSession.once("error", reject);
    stopSession.once("exit", (code) => reject(new Error(`Stop transaction exited early (${code}): ${errorOutput}`)));
  });
  stopSession.stdin.write(`begin; ${auth} select public.stop_chain('${chainId}'); select 'LOCK_READY';\n`);
  await ready;

  let blocked = false;
  try {
    sql(
      `begin; ${auth} set local lock_timeout = '250ms'; select public.set_chain_waxing_mark('${activityId}', '${chainId}'); commit;`,
    );
  } catch (error) {
    blocked = String(error.stderr).includes("lock timeout");
  }
  assert.ok(blocked, "concurrent mark must wait on the in-flight stop transaction");

  const finished = new Promise((resolve, reject) => {
    stopSession.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Stop transaction failed: ${errorOutput}`)),
    );
  });
  stopSession.stdin.end("commit;\n\\q\n");
  await finished;
  stopSession = undefined;

  const result = sql(`begin; ${auth} select public.set_chain_waxing_mark('${activityId}', '${chainId}');
    select public.stop_chain('${chainId}');
    select count(*) from public.chain_stop_events where chain_id = '${chainId}';
    select status from public.chain_metrics where id = '${chainId}'; commit;`);
  assert.deepEqual(result.split("\n").slice(-4), ["saved", "saved", "1", "stopped"]);
  console.log("PASS: concurrent mark blocks behind stop; retries preserve one stop and stopped status");
} finally {
  if (stopSession) stopSession.kill();
  sql(`delete from auth.users where id = '${userId}'`);
}
