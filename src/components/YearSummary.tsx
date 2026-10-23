import { formatDistanceKm } from "@/lib/strava/activity-view.ts";
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
      <p className="text-xs font-semibold tracking-wide text-blue-100/55 uppercase">Year in review</p>
      <h2 id="summary-heading" className="mt-2 text-2xl font-semibold text-white">
        {year === null ? "This year" : `${year} riding`}
      </h2>
      {loading && (
        <p className="mt-5 text-sm text-blue-100/70" role="status" aria-live="polite">
          Loading your yearly summary...
        </p>
      )}
      {error && (
        <div className="mt-5 text-sm text-amber-200" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-10 rounded px-3 py-2 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            Retry summary
          </button>
        </div>
      )}
      {!loading && !error && summary && (
        <dl className="mt-8 grid gap-8 border-y border-white/15 py-7 sm:grid-cols-2 sm:gap-12 sm:py-9">
          <div>
            <dt className="text-sm font-medium text-blue-100/65">Bikes with activity</dt>
            <dd className="mt-2 text-4xl font-semibold text-white tabular-nums sm:text-5xl">{summary.bikesRidden}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-blue-100/65">Distance ridden</dt>
            <dd className="mt-2 text-4xl font-semibold text-white tabular-nums sm:text-5xl">
              {formatDistanceKm(summary.distanceMeters)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
