const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WaxingMarkInput {
  chainId: string | null;
}

export type ParseWaxingMarkInputResult = { success: true; data: WaxingMarkInput } | { success: false };

export interface WaxingMarkStore {
  readActivity(input: { userId: string; activityId: string }): Promise<{ bikeId: string | null } | null>;
  chainExists(input: { userId: string; chainId: string }): Promise<boolean>;
  readMark(input: { userId: string; activityId: string }): Promise<{ chainId: string | null } | null>;
  upsertMark(input: { userId: string; activityId: string; chainId: string }): Promise<void>;
  deleteMark(input: { userId: string; activityId: string }): Promise<void>;
}

export type SetWaxingMarkResult =
  { outcome: "saved"; chainId: string | null } | { outcome: "activity-not-found" } | { outcome: "chain-not-found" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWaxingMarkInput(input: unknown): ParseWaxingMarkInputResult {
  if (!isRecord(input) || Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, "chainId")) {
    return { success: false };
  }
  if (input.chainId !== null && (typeof input.chainId !== "string" || !UUID_PATTERN.test(input.chainId))) {
    return { success: false };
  }
  return { success: true, data: { chainId: input.chainId } };
}

export async function setWaxingMark(
  store: WaxingMarkStore,
  userId: string,
  activityId: string,
  chainId: string | null,
): Promise<SetWaxingMarkResult> {
  const activity = await store.readActivity({ userId, activityId });
  const bikeId = activity?.bikeId;
  if (activity === null || bikeId === null) return { outcome: "activity-not-found" };

  if (chainId !== null && !(await store.chainExists({ userId, chainId }))) {
    return { outcome: "chain-not-found" };
  }

  const existingMark = await store.readMark({ userId, activityId });
  if ((chainId !== null && existingMark?.chainId === chainId) || (chainId === null && existingMark === null)) {
    return { outcome: "saved", chainId };
  }

  if (chainId === null) await store.deleteMark({ userId, activityId });
  else await store.upsertMark({ userId, activityId, chainId });
  return { outcome: "saved", chainId };
}
