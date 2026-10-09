export const REQUIRED_STRAVA_SCOPES = ["activity:read_all", "profile:read_all"] as const;

export interface StravaEnvironment {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_REDIRECT_URI?: string;
  STRAVA_TOKEN_ENCRYPTION_KEY?: string;
}

export interface StravaConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Uint8Array;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importEncryptionKey(keyBytes: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  if (keyBytes.byteLength !== 32) {
    throw new Error("Strava token encryption key must be exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, usages);
}

export function decodeTokenEncryptionKey(value: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters");
  }

  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (bytes.byteLength !== 32) {
    throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return bytes;
}

export function requireStravaConfiguration(environment: StravaEnvironment): StravaConfiguration {
  const missing = (
    ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REDIRECT_URI", "STRAVA_TOKEN_ENCRYPTION_KEY"] as const
  ).filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing server configuration: ${missing.join(", ")}`);
  }

  const clientId = environment.STRAVA_CLIENT_ID?.trim() ?? "";
  const clientSecret = environment.STRAVA_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = environment.STRAVA_REDIRECT_URI?.trim() ?? "";
  try {
    new URL(redirectUri);
  } catch {
    throw new Error("STRAVA_REDIRECT_URI must be a valid URL");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey: decodeTokenEncryptionKey(environment.STRAVA_TOKEN_ENCRYPTION_KEY?.trim() ?? ""),
  };
}

export function hasRequiredStravaScopes(scopeValue: string): boolean {
  const granted = new Set(scopeValue.split(/[\s,]+/).filter(Boolean));
  return REQUIRED_STRAVA_SCOPES.every((scope) => granted.has(scope));
}

export function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64Url(bytes);
}

export async function hashOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeOAuthState(
  state: string,
  userId: string,
  now: Date,
  consumeMatchingState: (stateHash: string, userId: string, now: Date) => number | Promise<number>,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !userId) return false;
  const consumed = await consumeMatchingState(await hashOAuthState(state), userId, now);
  return consumed === 1;
}

export async function encryptToken(token: string, keyBytes: Uint8Array): Promise<string> {
  const key = await importEncryptionKey(keyBytes, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(value: string, keyBytes: Uint8Array): Promise<string> {
  const match = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) throw new Error("Encrypted Strava token has an invalid format");
  const iv = decodeBase64Url(match[1]);
  if (iv.byteLength !== 12) throw new Error("Encrypted Strava token has an invalid IV");

  const key = await importEncryptionKey(keyBytes, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(decodeBase64Url(match[2])),
  );
  return new TextDecoder().decode(plaintext);
}
