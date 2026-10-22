export interface ChainInput {
  name: string;
  startingDistanceMeters: number;
}

export interface ChainView {
  id: string;
  name: string;
  startingDistanceMeters: number;
  createdAt: string;
}

export interface ChainRow {
  id: string;
  name: string;
  starting_distance_meters: number;
  created_at: string;
}

export type ChainFieldErrors = Partial<Record<"name" | "startingKm", string>>;

export type ParseChainInputResult =
  { success: true; data: ChainInput } | { success: false; fieldErrors: ChainFieldErrors };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStartingKm(value: unknown): { kilometers: number } | { error: string } {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return { kilometers: 0 };
  }

  let kilometers: number;
  if (typeof value === "number") {
    kilometers = value;
    if (Number.isFinite(kilometers) && !Number.isInteger(kilometers * 10)) {
      return { error: "Starting kilometers can have at most one decimal place." };
    }
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
      return { error: "Enter a valid starting distance." };
    }
    const fractionalPart = normalized.split(".")[1] ?? "";
    if (fractionalPart.length > 1) {
      return { error: "Starting kilometers can have at most one decimal place." };
    }
    kilometers = Number(normalized);
  } else {
    return { error: "Enter a valid starting distance." };
  }

  if (!Number.isFinite(kilometers)) return { error: "Enter a valid starting distance." };
  if (kilometers < 0) return { error: "Starting kilometers cannot be negative." };
  if (kilometers > 100_000) return { error: "Starting kilometers cannot exceed 100,000." };
  return { kilometers };
}

export function kilometersToMeters(kilometers: number): number {
  return Math.round(kilometers * 1000);
}

export function parseChainInput(input: unknown): ParseChainInputResult {
  const fieldErrors: ChainFieldErrors = {};
  const record = isRecord(input) ? input : {};
  let name: string | undefined;

  if (typeof record.name !== "string") {
    fieldErrors.name = "Enter a chain name.";
  } else {
    name = record.name.trim();
    if (name.length < 1 || name.length > 60) {
      fieldErrors.name = "Chain name must be between 1 and 60 characters.";
    }
  }

  const startingKm = parseStartingKm(record.startingKm);
  let startingDistanceMeters = 0;
  if ("error" in startingKm) {
    fieldErrors.startingKm = startingKm.error;
  } else {
    startingDistanceMeters = kilometersToMeters(startingKm.kilometers);
  }

  if (name === undefined || Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors };

  return {
    success: true,
    data: {
      name,
      startingDistanceMeters,
    },
  };
}

export function toChainView(row: ChainRow): ChainView {
  return {
    id: row.id,
    name: row.name,
    startingDistanceMeters: row.starting_distance_meters,
    createdAt: row.created_at,
  };
}
