// SERVER-ONLY: the only module in the app that reads HMAC_SECRET. The
// `@tanstack/react-start/server-only` marker is enforced by the Start
// compiler — importing this module from client code fails the build, and at
// runtime the secret never leaves the server process.
import "@tanstack/react-start/server-only";

import { hmacDigest, toHex } from "./hmac";

function getSecret(): string | undefined {
  const value = process.env["HMAC_SECRET"]?.trim();
  return value ? value : undefined;
}

/** True when the signing secret is configured (never returns the secret). */
export function hasHmacSecret(): boolean {
  return getSecret() !== undefined;
}

/**
 * Fail-safe guard for code paths that require HMAC. Callers use this when a
 * protected request arrives and the deployment forgot HMAC_SECRET; it refuses
 * the operation with a thrown error (rendered as 500 by the outer error
 * middleware) instead of degrading to unsigned traffic.
 */
export function requireHmacSecret(): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("HMAC_SECRET is not configured; refusing HMAC-protected operation");
  }
  return secret;
}

/**
 * Sign a payload server-side: lowercase hex HMAC-SHA256 of
 * `${timestamp}.${payload}` — the same digest the verification side computes.
 */
export async function signHmacPayload(
  payload: string,
  timestamp: string | number,
): Promise<string> {
  return toHex(await hmacDigest(requireHmacSecret(), timestamp, payload));
}

/** Build the `{ "x-signature", "x-timestamp" }` header pair for an outgoing signed request. */
export async function createHmacHeaders(
  payload: string,
  timestamp: string | number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  return {
    "x-signature": await signHmacPayload(payload, timestamp),
    "x-timestamp": String(timestamp),
  };
}
