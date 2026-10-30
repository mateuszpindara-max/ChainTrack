import { formatDistanceKm } from "@/lib/strava/activity-view.ts";
import { Button } from "@/components/ui/button";
import type { DashboardSummary } from "@/lib/strava/dashboard-summary.ts";

interface Props {
  year: number | null;
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function YearSummary({ year, summary, loading, error, onRetry }: Props) {
  return (
    <section aria-labelledby="summary-heading" className="py-3">
      <p className="text-muted-foreground/70 text-xs font-semibold tracking-wide uppercase">Year in review</p>
      <h2 id="summary-heading" className="text-foreground mt-2 text-2xl font-semibold">
        {year === null ? "This year" : `${year} riding`}
      </h2>
      {loading && (
        <p className="text-muted-foreground/80 mt-5 text-sm" role="status" aria-live="polite">
          Loading your yearly summary...
        </p>
      )}
      {error && (
        <div className="text-warning mt-5 text-sm" role="alert">
          <p>{error}</p>
          <Button type="button" variant="link" onClick={onRetry} className="mt-2 min-h-10 px-3">
            Retry summary
          </Button>
        </div>
      )}
      {!loading && !error && summary && (
        <dl className="border-border mt-8 grid gap-8 border-y py-7 sm:grid-cols-2 sm:gap-12 sm:py-9">
          <div>
            <dt className="text-muted-foreground/80 text-sm font-medium">Bikes with activity</dt>
            <dd className="text-foreground mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">
              {summary.bikesRidden}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground/80 text-sm font-medium">Distance ridden</dt>
            <dd className="text-foreground mt-2 text-4xl font-semibold tabular-nums sm:text-5xl">
              {formatDistanceKm(summary.distanceMeters)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
