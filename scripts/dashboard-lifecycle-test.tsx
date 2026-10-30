import { createRoot } from "react-dom/client";
import ActivityDashboard from "../src/components/ActivityDashboard";

interface Chain {
  id: string;
  name: string;
  startingDistanceMeters: number;
  createdAt: string;
  thresholdKm: number | null;
  stoppedAt: string | null;
  status: "active" | "stopped" | "not_started";
  totalDistanceMeters: number;
  activeDistanceMeters: number;
  completedCycleCount: number;
  averageCompletedDistanceMeters: number | null;
}

function required<Value>(value: Value | null | undefined, message: string): Value {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

const rootElement = required(document.querySelector<HTMLElement>("#root"), "Root missing");
const result = required(document.querySelector<HTMLElement>("#result"), "Result missing");
const root = createRoot(rootElement);
const originalFetch = window.fetch.bind(window);
const requests: string[] = [];
const chain = (id: string, name: string): Chain => ({
  id,
  name,
  startingDistanceMeters: 0,
  createdAt: "2026-01-01T00:00:00Z",
  thresholdKm: 100,
  stoppedAt: null,
  status: "active",
  totalDistanceMeters: 75000,
  activeDistanceMeters: 75000,
  completedCycleCount: 0,
  averageCompletedDistanceMeters: null,
});
let chains = [chain("one", "First chain"), chain("two", "Second chain")];
let importResult = { outcome: "failed", inserted: 1, updated: 0, skipped: 0 };
let syncResult = { outcome: "failed", inserted: 0, updated: 0, skipped: 0, savedChanges: true };
let deferredMetrics: ((response: Response) => void) | null = null;
let deferFirstMetrics = false;
let deferredStatus: ((response: Response) => void) | null = null;
let deferNextStatus = false;
let statusDistance = 75000;
let waxed = false;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
function statusPayload(distance: number) {
  return {
    statuses:
      chains[0].status === "stopped"
        ? []
        : [
            {
              bikeId: "bike",
              chainId: "one",
              chainName: "First chain",
              activeDistanceMeters: distance,
              thresholdKm: chains[0].thresholdKm,
              status: "active",
            },
          ],
  };
}
function metrics(item: Chain, offset = 0) {
  return {
    chain: item,
    cycles: [
      {
        markActivityId: offset === 0 ? "ride" : "older-ride",
        bikeId: "bike",
        cycleStartedAt: offset === 0 ? "2026-01-01T00:00:00Z" : "2025-01-01T00:00:00Z",
        cycleEndedAt: null,
        distanceMeters: 75000,
        isOpen: true,
      },
    ],
    hasMore: offset === 0,
  };
}
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (url === "/api/chains/bike-status") {
    if (deferNextStatus) {
      deferNextStatus = false;
      return new Promise<Response>((resolve) => {
        deferredStatus = resolve;
      });
    }
    return json(statusPayload(statusDistance));
  }
  if (url.startsWith("/api/strava/dashboard-summary")) return json({ bikesRidden: 1, distanceMeters: 75000 });
  if (url.startsWith("/api/strava/bikes")) return json({ bikes: [{ id: "bike", name: "Road bike" }], hasMore: false });
  if (url.startsWith("/api/strava/activities?"))
    return json({
      activities: [
        {
          id: "ride",
          name: "Morning ride",
          distanceMeters: 75000,
          startedAt: "2026-01-01T00:00:00Z",
          bikeName: "Road bike",
          chainId: waxed ? "one" : null,
          chainName: waxed ? "First chain" : null,
          isWaxingStart: waxed,
          cumulativeDistanceMeters: 75000,
        },
      ],
      hasMore: false,
    });
  if (url === "/api/strava/activities/ride/waxing" && method === "PUT") {
    waxed = true;
    chains[0].status = "active";
    return json({});
  }
  if (url === "/api/strava/import") return json(importResult, 500);
  if (url === "/api/strava/sync") return json(syncResult, 500);
  if (url.startsWith("/api/chains?")) return json({ chains, hasMore: false });
  if (url === "/api/chains" && method === "POST") {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as { name: string; startingKm: string };
    const created = {
      ...chain("new", body.name),
      startingDistanceMeters: Number(body.startingKm) * 1000,
      status: "not_started" as const,
    };
    chains = [created, ...chains];
    return json({
      chain: {
        id: created.id,
        name: created.name,
        startingDistanceMeters: created.startingDistanceMeters,
        createdAt: created.createdAt,
      },
    });
  }
  const metricMatch = /^\/api\/chains\/([^/]+)\/metrics\?offset=(\d+)$/.exec(url);
  if (metricMatch) {
    const item = required(
      chains.find((candidate) => candidate.id === metricMatch[1]),
      "Metric chain missing",
    );
    if (deferFirstMetrics && item.id === "one") {
      deferFirstMetrics = false;
      return new Promise<Response>((resolve) => {
        deferredMetrics = resolve;
      });
    }
    return json(metrics(item, Number(metricMatch[2])));
  }
  const chainMatch = /^\/api\/chains\/([^/]+)(?:\/(threshold|stop))?$/.exec(url);
  if (chainMatch) {
    const item = required(
      chains.find((candidate) => candidate.id === chainMatch[1]),
      "Mutation chain missing",
    );
    if (chainMatch[2] === "threshold") {
      item.thresholdKm = (
        JSON.parse(typeof init?.body === "string" ? init.body : "") as { thresholdKm: number }
      ).thresholdKm;
      statusDistance = 80000;
      return json({});
    }
    if (chainMatch[2] === "stop") {
      item.status = "stopped";
      return json({});
    }
    if (method === "PATCH") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "") as { name: string; startingKm: string };
      item.name = body.name;
      item.startingDistanceMeters = Number(body.startingKm) * 1000;
      return json({
        chain: {
          id: item.id,
          name: item.name,
          startingDistanceMeters: item.startingDistanceMeters,
          createdAt: item.createdAt,
        },
      });
    }
    if (method === "DELETE") {
      chains = chains.filter((candidate) => candidate.id !== item.id);
      return json({});
    }
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function waitFor(predicate: () => boolean, message: string) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function button(text: string, parent: HTMLElement = rootElement) {
  const found = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent.trim() === text,
  );
  assert(found, `Button not found: ${text}`);
  return found;
}
function click(element: HTMLElement) {
  element.click();
}
function fill(selector: string, value: string) {
  const input = rootElement.querySelector<HTMLInputElement>(selector);
  assert(input, `Input not found: ${selector}`);
  const descriptor = required(
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"),
    "Input setter missing",
  );
  descriptor.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function count(prefix: string) {
  return requests.filter((request) => request.startsWith(prefix)).length;
}
const sidebar = () => required(rootElement.querySelector<HTMLElement>("aside nav"), "Sidebar missing");
const statusButton = () => button("Road bike", sidebar());
async function refreshed(previous: number) {
  await waitFor(() => count("GET /api/chains/bike-status") > previous, "Bike status was not refreshed");
}
function mount(initialImportCompleted: boolean) {
  root.render(
    <ActivityDashboard
      connectionStatus="connected"
      callbackStatus={null}
      initialBikes={[{ id: "bike", name: "Road bike" }]}
      initialBikesHasMore={false}
      initialBikesError={false}
      initialChains={chains.map((item) => ({ ...item }))}
      initialChainsHasMore={false}
      initialChainsError={false}
      initialImportCompleted={initialImportCompleted}
      initialActiveSyncRun={null}
    />,
  );
}

async function run() {
  mount(false);
  await waitFor(() => rootElement.querySelector("aside nav") !== null, "Dashboard did not mount");
  await waitFor(() => statusButton().title.includes("75%"), "Initial warning did not render");
  assert(statusButton().className.includes("bg-orange-500/20"), "Warning color missing");
  assert(!button("First chainActive", sidebar()).className.includes("bg-orange"), "Chain row was colored");

  deferFirstMetrics = true;
  click(button("First chainActive", sidebar()));
  await waitFor(() => deferredMetrics !== null, "First metrics request did not start");
  click(button("Second chainActive", sidebar()));
  await waitFor(
    () => rootElement.querySelector("#chain-details-heading")?.textContent === "Second chain",
    "Second chain did not render",
  );
  required<(response: Response) => void>(deferredMetrics, "Deferred metrics missing")(json(metrics(chains[0])));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(
    rootElement.querySelector("#chain-details-heading")?.textContent === "Second chain",
    "Stale metrics replaced the selected chain",
  );
  click(button("Load more cycles"));
  await waitFor(
    () => count("GET /api/chains/two/metrics?offset=1") === 1 && rootElement.textContent.includes("2025"),
    "Cycle pagination did not append the next page",
  );

  let before = count("GET /api/chains/bike-status");
  click(button("Import activities"));
  await refreshed(before);
  assert(count("GET /api/chains?offset=0") > 0, "Failed import with saved counts did not refresh chains");
  await waitFor(
    () => rootElement.querySelector("#chain-details-heading")?.textContent === "Second chain",
    "Metrics did not refresh after failed import",
  );
  importResult = { outcome: "partial", inserted: 1, updated: 0, skipped: 0 };
  before = count("GET /api/chains/bike-status");
  click(button("Import activities"));
  await refreshed(before);

  const manage = required(
    sidebar().querySelector<HTMLButtonElement>('[aria-label="Manage chains"]'),
    "Manage button missing",
  );
  click(manage);
  await waitFor(() => rootElement.querySelector("#chain-name") !== null, "Manage view did not render");
  before = count("GET /api/chains/bike-status");
  fill("#chain-name", "New chain");
  fill("#chain-starting-km", "12.5");
  click(button("Add chain"));
  await refreshed(before);
  await waitFor(() => sidebar().textContent.includes("New chain"), "Create did not refresh sidebar");
  const createdRow = required(
    [...rootElement.querySelectorAll("li")].find((item) => item.textContent.includes("New chain")),
    "Created chain row missing",
  );
  before = count("GET /api/chains/bike-status");
  click(button("Edit", createdRow));
  await waitFor(() => rootElement.querySelector("#edit-chain-name-new") !== null, "Edit form did not render");
  fill("#edit-chain-name-new", "Renamed chain");
  fill("#edit-chain-km-new", "20");
  click(button("Save", createdRow));
  await refreshed(before);
  await waitFor(() => sidebar().textContent.includes("Renamed chain"), "Edit did not refresh sidebar");
  assert(chains[0].startingDistanceMeters === 20000, "Starting distance was not saved");
  before = count("GET /api/chains/bike-status");
  click(button("Delete", createdRow));
  await waitFor(() => createdRow.textContent.includes("Confirm delete"), "Delete confirmation did not render");
  click(button("Confirm delete", createdRow));
  await refreshed(before);
  await waitFor(() => !sidebar().textContent.includes("Renamed chain"), "Delete did not refresh sidebar");

  click(button("First chainActive", sidebar()));
  await waitFor(
    () => rootElement.querySelector("#chain-details-heading")?.textContent === "First chain",
    "First chain did not render",
  );
  before = count("GET /api/chains/bike-status");
  fill('input[name="thresholdKm"]', "80");
  click(button("Save threshold"));
  await refreshed(before);
  await waitFor(() => statusButton().className.includes("bg-red-500/20"), "Critical alert did not render");
  assert(statusButton().title.includes("100%"), "Critical tooltip missing");
  await waitFor(
    () => [...rootElement.querySelectorAll("button")].some((item) => item.textContent.trim() === "Stop chain"),
    "Stop action did not return after refresh",
  );
  before = count("GET /api/chains/bike-status");
  click(button("Stop chain"));
  await waitFor(() => rootElement.textContent.includes("Confirm stop"), "Stop confirmation did not render");
  assert(rootElement.textContent.includes("Stopping ends this chain's cycle."), "Stop confirmation missing");
  click(button("Confirm stop"));
  await refreshed(before);
  await waitFor(
    () =>
      rootElement.querySelector("#chain-details-heading")?.textContent === "First chain" &&
      rootElement.textContent.includes("Stopped"),
    "Stopped chain did not refresh",
  );
  await waitFor(() => statusButton().title === "Road bike", "Stop did not clear the bike alert");

  click(button("Road bike", sidebar()));
  await waitFor(() => rootElement.textContent.includes("Morning ride"), "Activity list did not render");
  const waxingButton = required(
    rootElement.querySelector<HTMLButtonElement>('[aria-label="Edit fresh-wax mark for Morning ride"]'),
    "Waxing button missing",
  );
  click(waxingButton);
  await waitFor(
    () => rootElement.querySelector<HTMLInputElement>("#waxing-mark-ride") !== null,
    "Waxing editor did not render",
  );
  before = count("GET /api/chains/bike-status");
  const waxingSelect = required(
    rootElement.querySelector<HTMLInputElement>("#waxing-mark-ride"),
    "Waxing select missing",
  );
  waxingSelect.value = "one";
  waxingSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  await refreshed(before);
  await waitFor(() => rootElement.textContent.includes("Marked"), "Saved waxing mark did not refresh activities");

  root.unmount();
  const syncRoot = createRoot(rootElement);
  syncRoot.render(
    <ActivityDashboard
      connectionStatus="connected"
      callbackStatus={null}
      initialBikes={[{ id: "bike", name: "Road bike" }]}
      initialBikesHasMore={false}
      initialBikesError={false}
      initialChains={chains.map((item) => ({ ...item }))}
      initialChainsHasMore={false}
      initialChainsError={false}
      initialImportCompleted
      initialActiveSyncRun={null}
    />,
  );
  await waitFor(() => rootElement.textContent.includes("Repair full history"), "Sync controls did not render");
  deferNextStatus = true;
  click(button("All bikes", sidebar()));
  await waitFor(() => deferredStatus !== null, "Stale status request did not start");
  before = count("GET /api/chains/bike-status");
  click(
    button(
      "Repair full historyRepair permanently removes local activities Strava confirms as deleted, including their linked data.",
    ),
  );
  await refreshed(before);
  await waitFor(() => statusButton().title.includes("100%"), "Saved failure did not refresh status");
  required<(response: Response) => void>(deferredStatus, "Deferred status missing")(json(statusPayload(1000)));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(statusButton().title.includes("100%"), "Stale status overwrote refreshed data");
  assert(count("POST /api/strava/sync") === 1, "Repair request was not sent");
  syncResult = { outcome: "partial", inserted: 1, updated: 0, skipped: 0, savedChanges: false };
  before = count("GET /api/chains/bike-status");
  click(button("Import new"));
  await refreshed(before);

  click(button("Menu"));
  await waitFor(
    () => rootElement.querySelector<HTMLDialogElement>("dialog")?.open === true,
    "Mobile drawer did not open",
  );
  const dialog = required(rootElement.querySelector<HTMLDialogElement>("dialog"), "Dialog missing");
  click(button("Second chainActive", dialog));
  await waitFor(
    () => !dialog.open && rootElement.querySelector("#chain-details-heading")?.textContent === "Second chain",
    "Mobile selection did not close the drawer and show the chain",
  );
  syncRoot.unmount();
}

void run()
  .then(() => {
    result.textContent =
      "PASS: real dashboard CRUD, saved failures, stale responses, lifecycle mutations, alerts and mobile navigation";
    result.dataset.status = "pass";
  })
  .catch((error: unknown) => {
    result.textContent = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    result.dataset.status = "fail";
  })
  .finally(() => {
    window.fetch = originalFetch;
  });
