import type { MessageType, SynqMessage } from "./types";

const SERVER_MESSAGE_TTL_MS = 30_000;

/** Builds a message from the server to a device. */
export function serverMessage<T extends MessageType>(
  type: T,
  to: string,
  payload: Extract<SynqMessage, { type: T }>["payload"],
  now: number = Date.now(),
): Extract<SynqMessage, { type: T }> {
  return {
    v: 1,
    id: Bun.randomUUIDv7(),
    type,
    from: "server",
    to,
    createdAt: now,
    expiresAt: now + SERVER_MESSAGE_TTL_MS,
    payload,
  } as Extract<SynqMessage, { type: T }>;
}
