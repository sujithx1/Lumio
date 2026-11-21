/**
 * RFC 8785 (JCS) canonical JSON, restricted to what Lumio messages contain:
 * objects, arrays, strings, booleans and finite numbers. Keys are sorted by UTF-16 code units.
 * Numbers use ECMAScript Number#toString, which is what JCS specifies.
 * Rust and Dart implement the same rules; protocol/fixtures/signing/vectors.json keeps them in agreement.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("non-finite numbers cannot be canonicalized");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
    }
    default:
      throw new Error(`cannot canonicalize ${typeof value}`);
  }
}

/** Bytes a sender signs: the canonical JSON of the message with `sig` removed. */
export function signingInput(message: object): Uint8Array {
  const { sig: _ignored, ...rest } = message as Record<string, unknown>;
  return new TextEncoder().encode(canonicalize(rest));
}
