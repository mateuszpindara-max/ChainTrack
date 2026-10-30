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

const focusStyle =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
          className="text-muted-foreground/65 mb-3 px-3 text-xs font-semibold tracking-wide uppercase"
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
          className={`hover:bg-accent min-h-10 w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors ${focusStyle} ${selection.kind === "summary" ? "bg-accent text-foreground" : "text-muted-foreground/85"}`}
        >
          Overview
        </button>
      </section>

      <section aria-labelledby="bikes-heading">
        <h2
          id="bikes-heading"
          className="text-muted-foreground/65 mb-3 px-3 text-xs font-semibold tracking-wide uppercase"
        >
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
            className={`hover:bg-accent min-h-10 rounded px-3 py-2 text-left text-sm font-medium transition-colors ${focusStyle} ${selectedBike(null) ? "bg-accent text-foreground" : "text-muted-foreground/85"}`}
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
                  "hover:bg-accent min-h-10 truncate rounded px-3 py-2 text-left text-sm transition-colors",
                  focusStyle,
                  selectedBike(bike.id) ? "bg-accent text-foreground font-medium" : "text-muted-foreground/85",
                  bikeStatus?.level === "warning" && "bg-primary/20 text-primary",
                  bikeStatus?.level === "critical" && "bg-destructive/20 text-destructive",
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
          <div className="text-warning px-3 py-2 text-sm" role="alert">
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
          <p className="text-muted-foreground/75 px-3 py-2 text-sm" role="status">
            Refreshing bikes...
          </p>
        )}
        {bikes.error && (
          <div className="text-warning px-3 py-2 text-sm" role="alert">
            <p>{bikes.error}</p>
            <button type="button" onClick={onRetryBikes} className={`mt-2 underline underline-offset-4 ${focusStyle}`}>
              Retry bikes
            </button>
          </div>
        )}
        {bikes.loadMoreError && (
          <p className="text-warning px-3 py-2 text-sm" role="alert">
            {bikes.loadMoreError}
          </p>
        )}
        {bikes.hasMore && (
          <button
            type="button"
            onClick={onLoadMoreBikes}
            disabled={bikes.loadingMore}
            className={`text-muted-foreground/80 hover:bg-accent mt-2 min-h-10 w-full rounded px-3 py-2 text-left text-sm ${focusStyle} disabled:opacity-50`}
          >
            {bikes.loadingMore ? "Loading bikes..." : "Load more bikes"}
          </button>
        )}
        {!bikes.hasMore && !bikes.loading && !bikes.error && bikes.items.length === 0 && (
          <p className="text-muted-foreground/65 px-3 py-2 text-sm">No imported bikes yet.</p>
        )}
      </section>

      <section aria-labelledby="chains-heading">
        <div className="mb-3 flex items-center justify-between px-3">
          <h2 id="chains-heading" className="text-muted-foreground/65 text-xs font-semibold tracking-wide uppercase">
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
              "text-muted-foreground/85 hover:bg-accent grid size-9 place-items-center rounded",
              focusStyle,
              selection.kind === "manage-chains" && "bg-accent text-foreground",
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
                "text-muted-foreground/85 hover:bg-accent hover:text-foreground min-h-10 rounded px-3 py-2 text-left text-sm transition-colors",
                focusStyle,
                selection.kind === "chain" && selection.chainId === chain.id && "bg-accent text-foreground",
              )}
              title={chain.name}
            >
              <span className="block truncate">{chain.name}</span>
              <span className="text-muted-foreground/75 block text-xs">
                {chain.status === "active" ? "Active" : chain.status === "stopped" ? "Stopped" : "Not started"}
              </span>
            </button>
          ))}
        </div>
        {chains.loading && (
          <p className="text-muted-foreground/75 px-3 py-2 text-sm" role="status">
            Refreshing chains...
          </p>
        )}
        {chains.error && (
          <div className="text-warning px-3 py-2 text-sm" role="alert">
            <p>{chains.error}</p>
            <button type="button" onClick={onRetryChains} className={`mt-2 underline underline-offset-4 ${focusStyle}`}>
              Retry chains
            </button>
          </div>
        )}
        {chains.loadMoreError && (
          <p className="text-warning px-3 py-2 text-sm" role="alert">
            {chains.loadMoreError}
          </p>
        )}
        {chains.hasMore && (
          <button
            type="button"
            onClick={onLoadMoreChains}
            disabled={chains.loadingMore}
            className={`text-muted-foreground/80 hover:bg-accent mt-2 min-h-10 w-full rounded px-3 py-2 text-left text-sm ${focusStyle} disabled:opacity-50`}
          >
            {chains.loadingMore ? "Loading chains..." : "Load more chains"}
          </button>
        )}
        {!chains.hasMore && !chains.loading && !chains.error && chains.items.length === 0 && (
          <p className="text-muted-foreground/65 px-3 py-2 text-sm">No chains yet.</p>
        )}
      </section>
    </nav>
  );
}
