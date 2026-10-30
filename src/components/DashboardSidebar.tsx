import { Settings } from "lucide-react";
import type { LifecycleChainView } from "@/lib/chains/chain.ts";
import type { BikeStatus } from "@/lib/chains/dashboard-lifecycle.ts";
import type { BikeRow } from "@/lib/strava/activity-view.ts";
import type { DashboardSelection } from "@/lib/strava/dashboard-state.ts";
import { cn } from "@/lib/utils";

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
  chains: ListState<LifecycleChainView>;
  bikeStatuses: { items: Partial<Record<string, BikeStatus>>; error: string | null };
  onSelectSummary: () => void;
  onSelectAllBikes: () => void;
  onSelectBike: (bikeId: string) => void;
  onSelectChain: (chainId: string) => void;
  onSelectManageChains: () => void;
  onRetryLifecycle: () => void;
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
  bikeStatuses,
  onSelectSummary,
  onSelectAllBikes,
  onSelectBike,
  onSelectChain,
  onSelectManageChains,
  onRetryLifecycle,
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
          {bikes.items.map((bike) => {
            const bikeStatus = bikeStatuses.items[bike.id];
            return (
              <button
                key={bike.id}
                type="button"
                onClick={() => {
                  onSelectBike(bike.id);
                  onNavigate?.();
                }}
                aria-current={selectedBike(bike.id) ? "page" : undefined}
                className={cn(
                  "min-h-10 truncate rounded px-3 py-2 text-left text-sm transition-colors hover:bg-white/10",
                  focusStyle,
                  selectedBike(bike.id) ? "bg-white/10 font-medium text-white" : "text-blue-100/75",
                  bikeStatus?.level === "warning" && "bg-orange-500/20 text-orange-200",
                  bikeStatus?.level === "critical" && "bg-red-500/20 text-red-200",
                )}
                title={
                  bikeStatus
                    ? `${bikeStatus.chainName}: ${bikeStatus.percent === null ? "No threshold" : `${bikeStatus.percent}% of threshold`}`
                    : bike.name
                }
              >
                {bike.name}
              </button>
            );
          })}
        </div>
        {bikeStatuses.error && (
          <div className="px-3 py-2 text-sm text-amber-200" role="alert">
            <p>{bikeStatuses.error}</p>
            <button
              type="button"
              onClick={onRetryLifecycle}
              className={cn("mt-2 underline underline-offset-4", focusStyle)}
            >
              Retry bike status
            </button>
          </div>
        )}
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
        <div className="mb-3 flex items-center justify-between px-3">
          <h2 id="chains-heading" className="text-xs font-semibold tracking-wide text-blue-100/50 uppercase">
            Chains
          </h2>
          <button
            type="button"
            onClick={() => {
              onSelectManageChains();
              onNavigate?.();
            }}
            aria-label="Manage chains"
            title="Manage chains"
            aria-current={selection.kind === "manage-chains" ? "page" : undefined}
            className={cn(
              "grid size-9 place-items-center rounded text-blue-100/75 hover:bg-white/10",
              focusStyle,
              selection.kind === "manage-chains" && "bg-white/10 text-white",
            )}
          >
            <Settings aria-hidden="true" size={17} />
          </button>
        </div>
        <div className="grid gap-1">
          {chains.items.map((chain) => (
            <button
              key={chain.id}
              type="button"
              onClick={() => {
                onSelectChain(chain.id);
                onNavigate?.();
              }}
              aria-current={selection.kind === "chain" && selection.chainId === chain.id ? "page" : undefined}
              className={cn(
                "min-h-10 rounded px-3 py-2 text-left text-sm text-blue-100/75 transition-colors hover:bg-white/10 hover:text-white",
                focusStyle,
                selection.kind === "chain" && selection.chainId === chain.id && "bg-white/10 text-white",
              )}
              title={chain.name}
            >
              <span className="block truncate">{chain.name}</span>
              <span className="block text-xs text-blue-100/60">
                {chain.status === "active" ? "Active" : chain.status === "stopped" ? "Stopped" : "Not started"}
              </span>
            </button>
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
      </section>
    </nav>
  );
}
