import type { ChainView } from "@/lib/chains/chain.ts";
import type { BikeRow } from "@/lib/strava/activity-view.ts";
import type { DashboardSelection } from "@/lib/strava/dashboard-state.ts";

interface ListState<T> {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
}

interface Props {
  selection: DashboardSelection;
  bikes: ListState<BikeRow>;
  chains: ListState<ChainView>;
  onSelectSummary: () => void;
  onSelectAllBikes: () => void;
  onSelectBike: (bikeId: string) => void;
  onRetryBikes: () => void;
  onRetryChains: () => void;
  onLoadMoreBikes: () => void;
  onLoadMoreChains: () => void;
  onNavigate?: () => void;
}

const focusStyle = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";

export default function DashboardSidebar({
  selection,
  bikes,
  chains,
  onSelectSummary,
  onSelectAllBikes,
  onSelectBike,
  onRetryBikes,
  onRetryChains,
  onLoadMoreBikes,
  onLoadMoreChains,
  onNavigate,
}: Props) {
  const selectedBike = (bikeId: string | null) => selection.kind === "activities" && selection.bikeId === bikeId;

  return (
    <nav aria-label="Dashboard navigation" className="grid content-start gap-8">
      <section aria-labelledby="dashboard-nav-heading">
        <h2
          id="dashboard-nav-heading"
          className="mb-3 px-3 text-xs font-semibold tracking-wide text-blue-100/50 uppercase"
        >
          Workspace
        </h2>
        <button
          type="button"
          onClick={() => {
            onSelectSummary();
            onNavigate?.();
          }}
          aria-current={selection.kind === "summary" ? "page" : undefined}
          className={`min-h-10 w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white/10 ${focusStyle} ${selection.kind === "summary" ? "bg-white/10 text-white" : "text-blue-100/75"}`}
        >
          Overview
        </button>
      </section>

      <section aria-labelledby="bikes-heading">
        <h2 id="bikes-heading" className="mb-3 px-3 text-xs font-semibold tracking-wide text-blue-100/50 uppercase">
          Bikes
        </h2>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => {
              onSelectAllBikes();
              onNavigate?.();
            }}
            aria-current={selectedBike(null) ? "page" : undefined}
            className={`min-h-10 rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white/10 ${focusStyle} ${selectedBike(null) ? "bg-white/10 text-white" : "text-blue-100/75"}`}
          >
            All bikes
          </button>
          {bikes.items.map((bike) => (
            <button
              key={bike.id}
              type="button"
              onClick={() => {
                onSelectBike(bike.id);
                onNavigate?.();
              }}
              aria-current={selectedBike(bike.id) ? "page" : undefined}
              className={`min-h-10 truncate rounded px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${focusStyle} ${selectedBike(bike.id) ? "bg-white/10 font-medium text-white" : "text-blue-100/75"}`}
              title={bike.name}
            >
              {bike.name}
            </button>
          ))}
        </div>
        {bikes.loading && (
          <p className="px-3 py-2 text-sm text-blue-100/60" role="status">
            Refreshing bikes...
          </p>
        )}
        {bikes.error && (
          <div className="px-3 py-2 text-sm text-amber-200" role="alert">
            <p>{bikes.error}</p>
            <button type="button" onClick={onRetryBikes} className={`mt-2 underline underline-offset-4 ${focusStyle}`}>
              Retry bikes
            </button>
          </div>
        )}
        {bikes.loadMoreError && (
          <p className="px-3 py-2 text-sm text-amber-200" role="alert">
            {bikes.loadMoreError}
          </p>
        )}
        {bikes.hasMore && (
          <button
            type="button"
            onClick={onLoadMoreBikes}
            disabled={bikes.loadingMore}
            className={`mt-2 min-h-10 w-full rounded px-3 py-2 text-left text-sm text-blue-100/65 hover:bg-white/10 ${focusStyle} disabled:opacity-50`}
          >
            {bikes.loadingMore ? "Loading bikes..." : "Load more bikes"}
          </button>
        )}
        {!bikes.hasMore && !bikes.loading && !bikes.error && bikes.items.length === 0 && (
          <p className="px-3 py-2 text-sm text-blue-100/50">No imported bikes yet.</p>
        )}
      </section>

      <section aria-labelledby="chains-heading">
        <h2 id="chains-heading" className="mb-3 px-3 text-xs font-semibold tracking-wide text-blue-100/50 uppercase">
          <a href="/chains" onClick={onNavigate} className={`rounded hover:text-white ${focusStyle}`}>
            Chains
          </a>
        </h2>
        <div className="grid gap-1">
          {chains.items.map((chain) => (
            <a
              key={chain.id}
              href="/chains"
              onClick={onNavigate}
              className={`min-h-10 truncate rounded px-3 py-2 text-sm text-blue-100/75 transition-colors hover:bg-white/10 hover:text-white ${focusStyle}`}
              title={chain.name}
            >
              {chain.name}
            </a>
          ))}
        </div>
        {chains.loading && (
          <p className="px-3 py-2 text-sm text-blue-100/60" role="status">
            Refreshing chains...
          </p>
        )}
        {chains.error && (
          <div className="px-3 py-2 text-sm text-amber-200" role="alert">
            <p>{chains.error}</p>
            <button type="button" onClick={onRetryChains} className={`mt-2 underline underline-offset-4 ${focusStyle}`}>
              Retry chains
            </button>
          </div>
        )}
        {chains.loadMoreError && (
          <p className="px-3 py-2 text-sm text-amber-200" role="alert">
            {chains.loadMoreError}
          </p>
        )}
        {chains.hasMore && (
          <button
            type="button"
            onClick={onLoadMoreChains}
            disabled={chains.loadingMore}
            className={`mt-2 min-h-10 w-full rounded px-3 py-2 text-left text-sm text-blue-100/65 hover:bg-white/10 ${focusStyle} disabled:opacity-50`}
          >
            {chains.loadingMore ? "Loading chains..." : "Load more chains"}
          </button>
        )}
        {!chains.hasMore && !chains.loading && !chains.error && chains.items.length === 0 && (
          <p className="px-3 py-2 text-sm text-blue-100/50">No chains yet.</p>
        )}
        <a
          href="/chains"
          onClick={onNavigate}
          className={`mt-3 inline-flex min-h-10 items-center rounded px-3 py-2 text-sm font-medium text-orange-200 hover:bg-white/10 ${focusStyle}`}
        >
          Manage chains
        </a>
      </section>
    </nav>
  );
}
