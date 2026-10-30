import { useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { formatDistanceKm } from "@/lib/strava/activity-view.ts";
import {
  isLifecycleChainView,
  parseChainInput,
  type ChainFieldErrors,
  type ChainView,
  type LifecycleChainView,
} from "@/lib/chains/chain.ts";

interface Props {
  initialChains: ChainView[];
  initialHasMore: boolean;
  initialLoadError: boolean;
  embedded?: boolean;
  onMutation?: () => void;
}

interface ChainPage {
  chains: LifecycleChainView[];
  hasMore: boolean;
}

interface ApiError {
  message?: string;
  fieldErrors?: ChainFieldErrors;
}

function isChainView(value: unknown): value is ChainView {
  if (typeof value !== "object" || value === null) return false;
  const chain = value as Record<string, unknown>;
  return (
    typeof chain.id === "string" &&
    typeof chain.name === "string" &&
    typeof chain.startingDistanceMeters === "number" &&
    typeof chain.createdAt === "string"
  );
}

function isChainPage(value: unknown): value is ChainPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.chains) && page.chains.every(isLifecycleChainView) && typeof page.hasMore === "boolean";
}

function readApiError(value: unknown, fallback: string): ApiError {
  if (typeof value !== "object" || value === null) return { message: fallback };
  const payload = value as Record<string, unknown>;
  const fieldErrors =
    typeof payload.fieldErrors === "object" && payload.fieldErrors !== null
      ? (payload.fieldErrors as ChainFieldErrors)
      : undefined;
  return {
    message: typeof payload.message === "string" ? payload.message : fallback,
    fieldErrors,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function ChainManager({
  initialChains,
  initialHasMore,
  initialLoadError,
  embedded = false,
  onMutation,
}: Props) {
  const Container = embedded ? "div" : "main";
  const [chains, setChains] = useState(initialChains);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [name, setName] = useState("");
  const [startingKm, setStartingKm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ChainFieldErrors>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartingKm, setEditStartingKm] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<ChainFieldErrors>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createChain(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");
    const parsed = parseChainInput({ name, startingKm });
    if (!parsed.success) {
      setFieldErrors(parsed.fieldErrors);
      return;
    }

    setFieldErrors({});
    setCreating(true);
    try {
      const response = await fetch("/api/chains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startingKm }),
      });
      const payload: unknown = await readJson(response);
      if (!response.ok) {
        const apiError = readApiError(payload, "Could not create the chain.");
        setFieldErrors(apiError.fieldErrors ?? {});
        setError(apiError.message ?? "Could not create the chain.");
        return;
      }
      onMutation?.();
      if (typeof payload !== "object" || payload === null || !isChainView((payload as Record<string, unknown>).chain)) {
        throw new Error("The chain service returned an invalid response.");
      }

      const created = (payload as { chain: ChainView }).chain;
      setChains((current) => [created, ...current]);
      setName("");
      setStartingKm("");
      setStatus(`${created.name} was created.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the chain.");
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(chain: ChainView) {
    setEditingId(chain.id);
    setEditName(chain.name);
    setEditStartingKm((chain.startingDistanceMeters / 1000).toFixed(1));
    setEditFieldErrors({});
    setConfirmDeleteId(null);
    setStatus("");
    setError("");
  }

  async function saveEdit(event: SyntheticEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setStatus("");
    setError("");
    const parsed = parseChainInput({ name: editName, startingKm: editStartingKm });
    if (!parsed.success) {
      setEditFieldErrors(parsed.fieldErrors);
      return;
    }

    setEditFieldErrors({});
    setSavingId(id);
    try {
      const response = await fetch(`/api/chains/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, startingKm: editStartingKm }),
      });
      const payload: unknown = await readJson(response);
      if (!response.ok) {
        const apiError = readApiError(payload, "Could not update the chain.");
        setEditFieldErrors(apiError.fieldErrors ?? {});
        setError(apiError.message ?? "Could not update the chain.");
        return;
      }
      onMutation?.();
      if (typeof payload !== "object" || payload === null || !isChainView((payload as Record<string, unknown>).chain)) {
        throw new Error("The chain service returned an invalid response.");
      }

      const updated = (payload as { chain: ChainView }).chain;
      setChains((current) => current.map((chain) => (chain.id === id ? updated : chain)));
      setEditingId(null);
      setStatus(`${updated.name} was updated.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update the chain.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteChain(id: string) {
    setStatus("");
    setError("");
    setDeletingId(id);
    try {
      const response = await fetch(`/api/chains/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const apiError = readApiError(await readJson(response), "Could not delete the chain.");
        throw new Error(apiError.message ?? "Could not delete the chain.");
      }
      onMutation?.();

      const deleted = chains.find((chain) => chain.id === id);
      setChains((current) => current.filter((chain) => chain.id !== id));
      setConfirmDeleteId(null);
      setStatus(deleted ? `${deleted.name} was deleted.` : "Chain deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete the chain.");
    } finally {
      setDeletingId(null);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch(`/api/chains?offset=${chains.length}`);
      const payload: unknown = await readJson(response);
      if (!response.ok) {
        const apiError = readApiError(payload, "Could not load more chains.");
        throw new Error(apiError.message ?? "Could not load more chains.");
      }
      if (!isChainPage(payload)) throw new Error("The chain list returned an invalid response.");
      setChains((current) => [...current, ...payload.chains]);
      setHasMore(payload.hasMore);
      setStatus("More chains loaded.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more chains.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Container
      className={
        embedded
          ? "text-foreground w-full"
          : "text-foreground mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12"
      }
    >
      {!embedded && (
        <header className="border-border flex flex-wrap items-start justify-between gap-6 border-b pb-8">
          <div>
            <p className="text-primary text-sm font-semibold uppercase">ChainTrack</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your chains</h1>
            <p className="text-muted-foreground/80 mt-2 text-sm">Track starting mileage for each chain.</p>
          </div>
          <Button asChild variant="outline" className="min-h-10">
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </header>
      )}

      <section className="border-border border-b py-7" aria-labelledby="create-chain-heading">
        <h2 id="create-chain-heading" className="text-xl font-semibold">
          Add a chain
        </h2>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto] sm:items-end"
          onSubmit={createChain}
        >
          <div className="grid gap-2">
            <label htmlFor="chain-name" className="text-muted-foreground/90 text-sm font-medium">
              Name
            </label>
            <input
              id="chain-name"
              name="name"
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "chain-name-error" : undefined}
              className="border-border bg-input text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              autoComplete="off"
            />
            {fieldErrors.name && (
              <p id="chain-name-error" className="text-destructive text-sm" aria-live="polite">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <label htmlFor="chain-starting-km" className="text-muted-foreground/90 text-sm font-medium">
              Starting km <span className="text-muted-foreground/70 font-normal">(optional)</span>
            </label>
            <input
              id="chain-starting-km"
              name="startingKm"
              type="number"
              step="0.1"
              min="0"
              max="100000"
              value={startingKm}
              onChange={(event) => {
                setStartingKm(event.currentTarget.value);
                setFieldErrors((current) => ({ ...current, startingKm: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.startingKm)}
              aria-describedby={fieldErrors.startingKm ? "chain-starting-km-error" : undefined}
              className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
            {fieldErrors.startingKm && (
              <p id="chain-starting-km-error" className="text-destructive text-sm" aria-live="polite">
                {fieldErrors.startingKm}
              </p>
            )}
          </div>
          <Button type="submit" disabled={creating} size="lg" className="min-h-11">
            {creating ? "Adding chain..." : "Add chain"}
          </Button>
        </form>
      </section>

      <section className="py-7" aria-labelledby="chains-heading">
        <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-muted-foreground/70 text-xs font-semibold uppercase">Maintenance</p>
            <h2 id="chains-heading" className="mt-2 text-xl font-semibold">
              Chains
            </h2>
          </div>
          <p className="text-muted-foreground/75 text-sm">
            {chains.length} {chains.length === 1 ? "chain" : "chains"}
          </p>
        </div>

        {initialLoadError && (
          <p className="border-border/70 text-warning border-b py-4 text-sm" role="status" aria-live="polite">
            Chains could not be loaded. You can still add a chain.
          </p>
        )}
        {status && (
          <p className="border-border/70 text-success border-b py-4 text-sm" role="status" aria-live="polite">
            {status}
          </p>
        )}
        {error && (
          <p className="border-border/70 text-destructive border-b py-4 text-sm" role="status" aria-live="polite">
            {error}
          </p>
        )}

        {chains.length === 0 ? (
          <p className="text-muted-foreground/80 py-8 text-sm">No chains yet.</p>
        ) : (
          <ul className="divide-border/70 divide-y">
            {chains.map((chain) => (
              <li key={chain.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                {editingId === chain.id ? (
                  <form
                    className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto_auto] sm:items-end"
                    onSubmit={(event) => {
                      void saveEdit(event, chain.id);
                    }}
                  >
                    <div className="grid gap-2">
                      <label
                        htmlFor={`edit-chain-name-${chain.id}`}
                        className="text-muted-foreground/90 text-sm font-medium"
                      >
                        Name
                      </label>
                      <input
                        id={`edit-chain-name-${chain.id}`}
                        type="text"
                        required
                        maxLength={60}
                        value={editName}
                        onChange={(event) => {
                          setEditName(event.currentTarget.value);
                          setEditFieldErrors((current) => ({ ...current, name: undefined }));
                        }}
                        aria-invalid={Boolean(editFieldErrors.name)}
                        aria-describedby={editFieldErrors.name ? `edit-chain-name-error-${chain.id}` : undefined}
                        className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        autoComplete="off"
                      />
                      {editFieldErrors.name && (
                        <p
                          id={`edit-chain-name-error-${chain.id}`}
                          className="text-destructive text-sm"
                          aria-live="polite"
                        >
                          {editFieldErrors.name}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <label
                        htmlFor={`edit-chain-km-${chain.id}`}
                        className="text-muted-foreground/90 text-sm font-medium"
                      >
                        Starting km
                      </label>
                      <input
                        id={`edit-chain-km-${chain.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        max="100000"
                        value={editStartingKm}
                        onChange={(event) => {
                          setEditStartingKm(event.currentTarget.value);
                          setEditFieldErrors((current) => ({ ...current, startingKm: undefined }));
                        }}
                        aria-invalid={Boolean(editFieldErrors.startingKm)}
                        aria-describedby={editFieldErrors.startingKm ? `edit-chain-km-error-${chain.id}` : undefined}
                        className="border-border bg-input text-foreground focus-visible:ring-ring focus-visible:ring-offset-background min-h-11 rounded-md border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      />
                      {editFieldErrors.startingKm && (
                        <p
                          id={`edit-chain-km-error-${chain.id}`}
                          className="text-destructive text-sm"
                          aria-live="polite"
                        >
                          {editFieldErrors.startingKm}
                        </p>
                      )}
                    </div>
                    <Button type="submit" disabled={savingId === chain.id} className="min-h-11">
                      {savingId === chain.id ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                      }}
                      disabled={savingId === chain.id}
                      variant="outline"
                      className="min-h-11"
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <h3 className="text-foreground truncate text-base font-medium">{chain.name}</h3>
                      <p className="text-muted-foreground/75 mt-1 text-sm">Starting mileage</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
                      <span className="text-foreground text-sm font-medium">
                        {formatDistanceKm(chain.startingDistanceMeters)}
                      </span>
                      {confirmDeleteId === chain.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-warning mr-2 basis-full text-sm sm:basis-auto">
                            Deleting this chain cannot be undone. Rides covered by it will show no chain afterward; the
                            marked ride will show Chain removed.
                          </p>
                          <Button
                            type="button"
                            onClick={() => {
                              void deleteChain(chain.id);
                            }}
                            disabled={deletingId === chain.id}
                            variant="destructive"
                            className="min-h-10"
                          >
                            {deletingId === chain.id ? "Deleting..." : "Confirm delete"}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                            }}
                            disabled={deletingId === chain.id}
                            variant="outline"
                            className="min-h-10"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              beginEdit(chain);
                            }}
                            variant="outline"
                            className="min-h-10"
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(chain.id);
                              setEditingId(null);
                              setStatus("");
                              setError("");
                            }}
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 min-h-10"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <Button
            type="button"
            onClick={() => {
              void loadMore();
            }}
            disabled={loadingMore}
            variant="outline"
            className="mt-5 min-h-10"
          >
            {loadingMore ? "Loading chains..." : "Load more"}
          </Button>
        )}
      </section>
    </Container>
  );
}
