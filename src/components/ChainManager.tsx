import { useState, type SyntheticEvent } from "react";
import { formatDistanceKm } from "@/lib/strava/activity-view.ts";
import { parseChainInput, type ChainFieldErrors, type ChainView } from "@/lib/chains/chain.ts";

interface Props {
  initialChains: ChainView[];
  initialHasMore: boolean;
  initialLoadError: boolean;
}

interface ChainPage {
  chains: ChainView[];
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
  return Array.isArray(page.chains) && page.chains.every(isChainView) && typeof page.hasMore === "boolean";
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

export default function ChainManager({ initialChains, initialHasMore, initialLoadError }: Props) {
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
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 text-white sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-white/15 pb-8">
        <div>
          <p className="text-sm font-semibold text-orange-300 uppercase">ChainTrack</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your chains</h1>
          <p className="mt-2 text-sm text-blue-100/70">Track starting mileage for each chain.</p>
        </div>
        <a
          href="/dashboard"
          className="inline-flex min-h-10 items-center rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          Back to dashboard
        </a>
      </header>

      <section className="border-b border-white/15 py-7" aria-labelledby="create-chain-heading">
        <h2 id="create-chain-heading" className="text-xl font-semibold">
          Add a chain
        </h2>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto] sm:items-end"
          onSubmit={createChain}
        >
          <div className="grid gap-2">
            <label htmlFor="chain-name" className="text-sm font-medium text-blue-100/85">
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
              className="min-h-11 rounded-md border border-white/20 bg-slate-950/60 px-3 text-white placeholder:text-blue-100/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              autoComplete="off"
            />
            {fieldErrors.name && (
              <p id="chain-name-error" className="text-sm text-rose-200" aria-live="polite">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <label htmlFor="chain-starting-km" className="text-sm font-medium text-blue-100/85">
              Starting km <span className="font-normal text-blue-100/55">(optional)</span>
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
              className="min-h-11 rounded-md border border-white/20 bg-slate-950/60 px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            />
            {fieldErrors.startingKm && (
              <p id="chain-starting-km-error" className="text-sm text-rose-200" aria-live="polite">
                {fieldErrors.startingKm}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-wait disabled:opacity-60"
          >
            {creating ? "Adding chain..." : "Add chain"}
          </button>
        </form>
      </section>

      <section className="py-7" aria-labelledby="chains-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/15 pb-4">
          <div>
            <p className="text-xs font-semibold text-blue-100/55 uppercase">Maintenance</p>
            <h2 id="chains-heading" className="mt-2 text-xl font-semibold">
              Chains
            </h2>
          </div>
          <p className="text-sm text-blue-100/60">
            {chains.length} {chains.length === 1 ? "chain" : "chains"}
          </p>
        </div>

        {initialLoadError && (
          <p className="border-b border-white/10 py-4 text-sm text-amber-200" role="status" aria-live="polite">
            Chains could not be loaded. You can still add a chain.
          </p>
        )}
        {status && (
          <p className="border-b border-white/10 py-4 text-sm text-emerald-200" role="status" aria-live="polite">
            {status}
          </p>
        )}
        {error && (
          <p className="border-b border-white/10 py-4 text-sm text-rose-200" role="status" aria-live="polite">
            {error}
          </p>
        )}

        {chains.length === 0 ? (
          <p className="py-8 text-sm text-blue-100/65">No chains yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
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
                      <label htmlFor={`edit-chain-name-${chain.id}`} className="text-sm font-medium text-blue-100/85">
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
                        className="min-h-11 rounded-md border border-white/20 bg-slate-950/60 px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                        autoComplete="off"
                      />
                      {editFieldErrors.name && (
                        <p
                          id={`edit-chain-name-error-${chain.id}`}
                          className="text-sm text-rose-200"
                          aria-live="polite"
                        >
                          {editFieldErrors.name}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor={`edit-chain-km-${chain.id}`} className="text-sm font-medium text-blue-100/85">
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
                        className="min-h-11 rounded-md border border-white/20 bg-slate-950/60 px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                      />
                      {editFieldErrors.startingKm && (
                        <p id={`edit-chain-km-error-${chain.id}`} className="text-sm text-rose-200" aria-live="polite">
                          {editFieldErrors.startingKm}
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={savingId === chain.id}
                      className="min-h-11 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-wait disabled:opacity-60"
                    >
                      {savingId === chain.id ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                      }}
                      disabled={savingId === chain.id}
                      className="min-h-11 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-medium text-white">{chain.name}</h3>
                      <p className="mt-1 text-sm text-blue-100/60">Starting mileage</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
                      <span className="text-sm font-medium text-white">
                        {formatDistanceKm(chain.startingDistanceMeters)}
                      </span>
                      {confirmDeleteId === chain.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="mr-2 basis-full text-sm text-amber-200 sm:basis-auto">
                            Deleting this chain cannot be undone.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteChain(chain.id);
                            }}
                            disabled={deletingId === chain.id}
                            className="min-h-10 rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:cursor-wait disabled:opacity-60"
                          >
                            {deletingId === chain.id ? "Deleting..." : "Confirm delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                            }}
                            disabled={deletingId === chain.id}
                            className="min-h-10 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              beginEdit(chain);
                            }}
                            className="min-h-10 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(chain.id);
                              setEditingId(null);
                              setStatus("");
                              setError("");
                            }}
                            className="min-h-10 rounded-md border border-rose-300/40 px-3 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
                          >
                            Delete
                          </button>
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
          <button
            type="button"
            onClick={() => {
              void loadMore();
            }}
            disabled={loadingMore}
            className="mt-5 min-h-10 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? "Loading chains..." : "Load more"}
          </button>
        )}
      </section>
    </main>
  );
}
