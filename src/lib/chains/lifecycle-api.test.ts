import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChainsDatabase } from "./database.ts";
import { parseOffset, readBikeStatuses, readChainMetrics } from "./lifecycle-api.ts";

type Row = Record<string, string | number | boolean | null>;

function mockDatabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: [string, string][] = [];
      const orders: [string, boolean][] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: string) {
          filters.push([column, value]);
          return query;
        },
        order(column: string, options: { ascending: boolean }) {
          orders.push([column, options.ascending]);
          return query;
        },
        rows() {
          return tables[table]
            .filter((row) => filters.every(([column, value]) => row[column] === value))
            .sort((left, right) => {
              for (const [column, ascending] of orders) {
                const comparison = String(left[column]).localeCompare(String(right[column]));
                if (comparison !== 0) return ascending ? comparison : -comparison;
              }
              return 0;
            });
        },
        range(start: number, end: number) {
          return Promise.resolve({ data: query.rows().slice(start, end + 1), error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: query.rows()[0] ?? null, error: null });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<ChainsDatabase>;
}

void test("bike statuses paginate both views and remain scoped to the signed-in user", async () => {
  const metrics: Row[] = [];
  const statuses: Row[] = [];
  for (let index = 0; index < 1201; index++) {
    const id = String(index).padStart(4, "0");
    metrics.push({
      id,
      user_id: "owner",
      name: `Chain ${id}`,
      active_distance_meters: index,
      threshold_km: null,
      status: "active",
    });
    statuses.push({ user_id: "owner", bike_id: `bike-${id}`, chain_id: id });
  }
  metrics.push({
    id: "other",
    user_id: "other",
    name: "Other",
    active_distance_meters: 1,
    threshold_km: 300,
    status: "active",
  });
  statuses.push({ user_id: "other", bike_id: "other-bike", chain_id: "other" });
  const result = await readBikeStatuses(mockDatabase({ chain_metrics: metrics, bike_chain_status: statuses }), "owner");
  assert.equal(result.length, 1201);
  assert.equal(result[1000].bikeId, "bike-1000");
  assert.equal(result[1200].chainName, "Chain 1200");
  assert.equal(
    result.some((row) => row.bikeId === "other-bike"),
    false,
  );
});

void test("equal-time cycle pages use the activity id tie-breaker", async () => {
  const metric = {
    id: "chain",
    user_id: "owner",
    name: "Chain",
    starting_distance_meters: 0,
    created_at: "2026-10-30",
    threshold_km: null,
    stopped_at: null,
    status: "active",
    total_distance_meters: 0,
    active_distance_meters: 0,
    completed_cycle_count: 0,
    average_completed_distance_meters: null,
  };
  const cycles = Array.from({ length: 103 }, (_, index) => ({
    user_id: "owner",
    chain_id: "chain",
    mark_activity_id: String(index).padStart(3, "0"),
    bike_id: "bike",
    cycle_started_at: "2026-10-30",
    cycle_ended_at: null,
    distance_meters: 0,
    is_open: true,
  }));
  const db = mockDatabase({ chain_metrics: [metric], chain_cycles: cycles });
  const pages = await Promise.all([0, 50, 100].map((offset) => readChainMetrics(db, "owner", "chain", offset)));
  assert.deepEqual(
    pages.map((page) => page?.hasMore),
    [true, true, false],
  );
  const ids = pages.flatMap((page) => page?.cycles.map((cycle) => cycle.markActivityId) ?? []);
  assert.equal(ids.length, 103);
  assert.equal(new Set(ids).size, 103);
  assert.equal(ids[0], "102");
  assert.equal(ids[102], "000");
  assert.equal(await readChainMetrics(db, "other", "chain", 0), null);
});

void test("page offsets reject invalid input", () => {
  assert.equal(parseOffset(null), 0);
  for (const input of ["", "-1", "1.5", "1000001", "abc"]) assert.equal(parseOffset(input), null);
});
