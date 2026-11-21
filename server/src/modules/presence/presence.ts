/** Anything we can push a frame to: a Bun ServerWebSocket in production, a stub in tests. */
export interface Connection {
  send(data: string): unknown;
  close(code?: number, reason?: string): void;
}

/**
 * Which devices are connected to this server instance, and how to reach them.
 * One live connection per device: a new connection replaces the old one.
 * Single-instance by design; a multi-instance deployment replaces this with a Redis-backed bus.
 */
export class Presence {
  private readonly connections = new Map<string, Connection>();

  /** Registers a connection and returns the one it replaced, if any. */
  register(deviceId: string, conn: Connection): Connection | undefined {
    const previous = this.connections.get(deviceId);
    this.connections.set(deviceId, conn);
    return previous === conn ? undefined : previous;
  }

  /** Removes the connection only if it is still the current one. Returns true if the device went offline. */
  unregister(deviceId: string, conn: Connection): boolean {
    if (this.connections.get(deviceId) !== conn) return false;
    this.connections.delete(deviceId);
    return true;
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  /** Sends a message if the device is connected. Returns whether it was handed to a socket. */
  send(deviceId: string, message: object): boolean {
    const conn = this.connections.get(deviceId);
    if (!conn) return false;
    conn.send(JSON.stringify(message));
    return true;
  }

  disconnect(deviceId: string, code: number, reason: string): void {
    const conn = this.connections.get(deviceId);
    if (!conn) return;
    this.connections.delete(deviceId);
    conn.close(code, reason);
  }

  get size(): number {
    return this.connections.size;
  }
}
