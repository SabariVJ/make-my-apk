// Pure HMAC-SHA256 helpers. Safe to import from any environment: this module
// never touches process.env, secrets, or network state — it is message
// construction, timestamp validation, and constant-time comparison only.
// Secret handling lives in hmac.server.ts (server-only).

const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

/** Exact freshness window from the HMAC spec, in seconds. */
export const HMAC_TIMESTAMP_TOLERANCE_SECONDS = 300;

/** Maximum acceptable signature length we will ever compare. */
const MAX_SIGNATURE_LENGTH = 128;

/** `${timestamp}.${payload}` — the exact signed message from the spec. */
export function buildHmacMessage(timestamp: string | number, payload: string): string {
  return `${timestamp}.${payload}`;
}

/** Raw HMAC-SHA256 digest over the spec message with the given key material. */
export async function hmacDigest(
  secret: string,
  timestamp: string | number,
  payload: string,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    HMAC_ALGORITHM,
    false,
    ["sign", "verify"],
  );
  const message = buildHmacMessage(timestamp, payload);
  return crypto.subtle.sign(HMAC_ALGORITHM, key, new TextEncoder().encode(message));
}

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Parse an `x-timestamp` header value as Unix seconds.
 * Returns `undefined` for anything that is not a finite, non-fractional,
 * non-exponential integer string — NaN can never pass this gate.
 */
export function parseHmacTimestamp(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined; // digits only; rejects "", "abc", "1e9", "12.5", "-5"
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return undefined; // rejects overflow into double precision
  return value;
}

/**
 * True when the request timestamp is within ±300s of server time.
 * Malformed inputs are handled by `parseHmacTimestamp` and never reach here.
 */
export function isHmacTimestampFresh(
  timestamp: number,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  return Math.abs(now - timestamp) <= HMAC_TIMESTAMP_TOLERANCE_SECONDS;
}

/**
 * Constant-time comparison of two lowercase-hex signatures.
 *
 * Safe by construction when lengths differ: the comparator runs over the
 * longer length against a fixed dummy value, accumulating the length delta
 * into the same accumulator as the byte mismatches. It never throws on a
 * length mismatch and never short-circuits on the first differing byte, so a
 * wrong-length signature gains no oracle about the expected digest.
 */
export function hmacSignaturesMatch(supplied: string, expected: string): boolean {
  const a = normalizeSignature(supplied);
  const b = normalizeSignature(expected);
  if (a === undefined || b === undefined) return false;

  const longer = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length; // length delta participates in the result
  const pad = "0".repeat(MAX_SIGNATURE_LENGTH);
  for (let i = 0; i < longer; i += 1) {
    const byteA = a.charCodeAt(i) ^ pad.charCodeAt(i);
    const byteB = b.charCodeAt(i) ^ pad.charCodeAt(i);
    mismatch |= byteA ^ byteB;
  }
  return mismatch === 0;
}

/** Reject non-hex characters up front so the comparator works on hex only. */
function normalizeSignature(value: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_SIGNATURE_LENGTH) return undefined;
  return /^[0-9a-f]+$/.test(trimmed) ? trimmed : undefined;
}
