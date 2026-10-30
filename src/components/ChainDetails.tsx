import { useState, type SyntheticEvent } from "react";
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
      <p className="py-6 text-sm text-blue-100/70" role="status">
        Loading chain...
      </p>
    );
  if (metrics.error || !metrics.value)
    return (
      <div className="py-6 text-sm text-amber-200" role="alert">
        <p>{metrics.error ?? "Chain metrics could not be loaded."}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-10 rounded px-3 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          Retry chain
        </button>
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
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-4">
        <div>
          <p className="text-xs font-semibold text-blue-100/55 uppercase">Chain</p>
          <h2 id="chain-details-heading" className="mt-2 text-xl font-semibold">
            {chain.name}
          </h2>
          <p className="mt-1 text-sm text-blue-100/70">
            {chain.status === "active" ? "Active" : chain.status === "stopped" ? "Stopped" : "Not started"}
          </p>
        </div>
        {chain.status === "active" && !confirmStop && (
          <button
            type="button"
            onClick={() => {
              setConfirmStop(true);
            }}
            disabled={busy}
            className="min-h-10 rounded-md border border-rose-300/40 px-4 py-2 text-sm text-rose-200 hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:opacity-60"
          >
            Stop chain
          </button>
        )}
      </header>
      {confirmStop && (
        <div className="border-b border-white/10 py-4">
          <p className="text-sm text-amber-200">
            Stopping ends this chain&apos;s cycle. Rides after the stop show no chain until it is marked again. Total
            mileage is kept.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void mutate(`/api/chains/${encodeURIComponent(chain.id)}/stop`, "POST");
              }}
              disabled={busy}
              className="min-h-10 rounded-md bg-rose-700 px-4 text-sm font-semibold hover:bg-rose-600 disabled:opacity-60"
            >
              {busy ? "Stopping..." : "Confirm stop"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmStop(false);
              }}
              disabled={busy}
              className="min-h-10 rounded-md border border-white/20 px-4 text-sm hover:bg-white/10 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="py-3 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="py-3 text-sm text-emerald-200" role="status">
          {message}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-5 border-b border-white/10 py-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-blue-100/60">Total mileage</dt>
          <dd className="mt-1 font-semibold">{formatDistanceKm(chain.totalDistanceMeters)}</dd>
        </div>
        <div>
          <dt className="text-sm text-blue-100/60">Active mileage</dt>
          <dd className="mt-1 font-semibold">{formatDistanceKm(chain.activeDistanceMeters)}</dd>
        </div>
        <div>
          <dt className="text-sm text-blue-100/60">Threshold usage</dt>
          <dd className="mt-1 font-semibold">{percent === null ? "No threshold" : `${percent}% (${level})`}</dd>
        </div>
        {average !== null && (
          <div>
            <dt className="text-sm text-blue-100/60">Average completed cycle</dt>
            <dd className="mt-1 font-semibold">{average.toFixed(1)} km</dd>
          </div>
        )}
      </dl>
      <section className="border-b border-white/10 py-6" aria-labelledby="threshold-heading">
        <h3 id="threshold-heading" className="font-semibold">
          Wax threshold
        </h3>
        <p className="mt-2 text-sm text-blue-100/70">
          {threshold === null
            ? "Set a threshold to see alerts."
            : `${threshold} km (${chain.thresholdKm === null ? "suggested" : "manual"})`}
        </p>
        <form onSubmit={saveThreshold} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm text-blue-100/85">
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
              className="min-h-11 rounded-md border border-white/20 bg-slate-950/60 px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-md bg-orange-500 px-4 text-sm font-semibold hover:bg-orange-400 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save threshold"}
          </button>
        </form>
      </section>
      <section className="py-6" aria-labelledby="cycle-history-heading">
        <h3 id="cycle-history-heading" className="font-semibold">
          Cycle history
        </h3>
        {cycles.length === 0 ? (
          <p className="py-4 text-sm text-blue-100/65">No cycles yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
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
                  <span className="text-blue-100/60">{cycle.isOpen ? "Active" : "Completed"}</span>
                </span>
                <span>{formatDistanceKm(cycle.distanceMeters)}</span>
              </li>
            ))}
          </ul>
        )}
        {metrics.loadMoreError && (
          <p className="py-2 text-sm text-amber-200" role="alert">
            {metrics.loadMoreError}
          </p>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={metrics.loadingMore}
            className="mt-4 min-h-10 rounded-md border border-white/20 px-4 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            {metrics.loadingMore ? "Loading cycles..." : "Load more cycles"}
          </button>
        )}
      </section>
    </section>
  );
}
