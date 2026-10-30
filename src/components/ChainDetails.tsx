import { useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ChainMetricsPage } from "@/lib/chains/dashboard-lifecycle.ts";
import {
  averageCompletedKm,
  effectiveThresholdKm,
  SUGGESTED_THRESHOLD_KM,
  wearLevel,
  wearPercent,
} from "@/lib/chains/lifecycle.ts";
import { formatDistanceKm } from "@/lib/strava/activity-view.ts";

interface Props {
  metrics: {
    value: ChainMetricsPage | null;
    loading: boolean;
    error: string | null;
    loadingMore: boolean;
    loadMoreError: string | null;
  };
  onRetry: () => void;
  onLoadMore: () => void;
  onMutation: () => void;
}

export default function ChainDetails({ metrics, onRetry, onLoadMore, onMutation }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function mutate(url: string, method: "PATCH" | "POST", body?: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const apiMessage =
          typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "The change could not be saved.";
        throw new Error(apiMessage);
      }
      onMutation();
      setConfirmStop(false);
      setMessage(method === "POST" ? "Chain stopped." : "Threshold updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (metrics.loading)
    return (
      <p className="text-muted-foreground/80 py-6 text-sm" role="status">
        Loading chain...
      </p>
    );
  if (metrics.error || !metrics.value)
    return (
      <div className="text-warning py-6 text-sm" role="alert">
        <p>{metrics.error ?? "Chain metrics could not be loaded."}</p>
        <Button type="button" variant="link" onClick={onRetry} className="mt-2 min-h-10 px-3">
          Retry chain
        </Button>
      </div>
    );

  const { chain, cycles, hasMore } = metrics.value;
  const threshold = effectiveThresholdKm(chain.thresholdKm, SUGGESTED_THRESHOLD_KM);
  const percent = wearPercent(chain.activeDistanceMeters, threshold);
  const level = wearLevel(chain.activeDistanceMeters, threshold);
  const average = chain.completedCycleCount >= 2 ? averageCompletedKm(chain.averageCompletedDistanceMeters) : null;

  function saveThreshold(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("thresholdKm");
    const raw = typeof value === "string" ? value.trim() : "";
    void mutate(`/api/chains/${encodeURIComponent(chain.id)}/threshold`, "PATCH", {
      thresholdKm: raw === "" ? null : Number(raw),
    });
  }

  return (
    <section aria-labelledby="chain-details-heading">
      <header className="border-border flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-muted-foreground/70 text-xs font-semibold uppercase">Chain</p>
          <h2 id="chain-details-heading" className="mt-2 text-xl font-semibold">
            {chain.name}
          </h2>
          <p className="text-muted-foreground/80 mt-1 text-sm">
            {chain.status === "active" ? "Active" : chain.status === "stopped" ? "Stopped" : "Not started"}
          </p>
        </div>
        {chain.status === "active" && !confirmStop && (
          <Button
            type="button"
            onClick={() => {
              setConfirmStop(true);
            }}
            disabled={busy}
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 min-h-10"
          >
            Stop chain
          </Button>
        )}
      </header>
      {confirmStop && (
        <div className="border-border/70 border-b py-4">
          <p className="text-warning text-sm">
            Stopping ends this chain&apos;s cycle. Rides after the stop show no chain until it is marked again. Total
            mileage is kept.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={() => {
                void mutate(`/api/chains/${encodeURIComponent(chain.id)}/stop`, "POST");
              }}
              disabled={busy}
              variant="destructive"
              className="min-h-10"
            >
              {busy ? "Stopping..." : "Confirm stop"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmStop(false);
              }}
              disabled={busy}
              variant="outline"
              className="min-h-10"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-destructive py-3 text-sm" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-success py-3 text-sm" role="status">
          {message}
        </p>
      )}
      <dl className="border-border/70 grid grid-cols-2 gap-5 border-b py-6 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground/75 text-sm">Total mileage</dt>
          <dd className="mt-1 font-semibold">{formatDistanceKm(chain.totalDistanceMeters)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground/75 text-sm">Active mileage</dt>
          <dd className="mt-1 font-semibold">{formatDistanceKm(chain.activeDistanceMeters)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground/75 text-sm">Threshold usage</dt>
          <dd className="mt-1 font-semibold">{percent === null ? "No threshold" : `${percent}% (${level})`}</dd>
        </div>
        {average !== null && (
          <div>
            <dt className="text-muted-foreground/75 text-sm">Average completed cycle</dt>
            <dd className="mt-1 font-semibold">{average.toFixed(1)} km</dd>
          </div>
        )}
      </dl>
      <section className="border-border/70 border-b py-6" aria-labelledby="threshold-heading">
        <h3 id="threshold-heading" className="font-semibold">
          Wax threshold
        </h3>
        <p className="text-muted-foreground/80 mt-2 text-sm">
          {threshold === null
            ? "Set a threshold to see alerts."
            : `${threshold} km (${chain.thresholdKm === null ? "suggested" : "manual"})`}
        </p>
        <form onSubmit={saveThreshold} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-muted-foreground/90 grid gap-2 text-sm">
            Manual threshold (km)
            <input
              key={`${chain.id}:${chain.thresholdKm ?? "none"}`}
              name="thresholdKm"
              type="number"
              min="0.1"
              max="100000"
              step="0.1"
              defaultValue={chain.thresholdKm ?? ""}
              placeholder="Use suggested"
              className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <Button type="submit" disabled={busy} className="min-h-11">
            {busy ? "Saving..." : "Save threshold"}
          </Button>
        </form>
      </section>
      <section className="py-6" aria-labelledby="cycle-history-heading">
        <h3 id="cycle-history-heading" className="font-semibold">
          Cycle history
        </h3>
        {cycles.length === 0 ? (
          <p className="text-muted-foreground/80 py-4 text-sm">No cycles yet.</p>
        ) : (
          <ul className="divide-border/70 mt-3 divide-y">
            {cycles.map((cycle) => (
              <li key={cycle.markActivityId} className="flex flex-wrap justify-between gap-2 py-4 text-sm">
                <span>
                  <time dateTime={cycle.cycleStartedAt}>{new Date(cycle.cycleStartedAt).toLocaleDateString()}</time>
                  {cycle.cycleEndedAt && (
                    <>
                      {" "}
                      - <time dateTime={cycle.cycleEndedAt}>{new Date(cycle.cycleEndedAt).toLocaleDateString()}</time>
                    </>
                  )}{" "}
                  <span className="text-muted-foreground/75">{cycle.isOpen ? "Active" : "Completed"}</span>
                </span>
                <span>{formatDistanceKm(cycle.distanceMeters)}</span>
              </li>
            ))}
          </ul>
        )}
        {metrics.loadMoreError && (
          <p className="text-warning py-2 text-sm" role="alert">
            {metrics.loadMoreError}
          </p>
        )}
        {hasMore && (
          <Button
            type="button"
            onClick={onLoadMore}
            disabled={metrics.loadingMore}
            variant="outline"
            className="mt-4 min-h-10"
          >
            {metrics.loadingMore ? "Loading cycles..." : "Load more cycles"}
          </Button>
        )}
      </section>
    </section>
  );
}
