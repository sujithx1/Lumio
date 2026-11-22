import { useRef, useSyncExternalStore } from "react";
import { catalog } from "./catalog";
import { formatBytes } from "./format";
import { errorMessage, native, type CoreEvent, type DeviceSummary, type RecentEffect, type Snapshot, type Transfer } from "./native";

export type DeliveryStatus = "sending" | "relayed" | "received" | "completed" | "failed" | "receiver_offline" | "expired" | "rejected" | "notified";

export interface Delivery {
  eventId: string;
  status: DeliveryStatus;
  detail: string | null;
}

export interface Toast {
  id: number;
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

export interface PairRequest {
  pairingId: string;
  claimant: DeviceSummary;
  sas: string;
}

interface State {
  snapshot: Snapshot | null;
  recent: RecentEffect[];
  deliveries: Record<string, Delivery>;
  pairRequest: PairRequest | null;
  lastPairApproved: DeviceSummary | null;
  lastPairRejected: string | null;
  toasts: Toast[];
  /** Recent file transfers, newest first. */
  transfers: Transfer[];
}

let state: State = {
  snapshot: null,
  recent: [],
  deliveries: {},
  pairRequest: null,
  lastPairApproved: null,
  lastPairRejected: null,
  toasts: [],
  transfers: [],
};
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}

let toastId = 0;
export function toast(t: Omit<Toast, "id">, ttlMs = 4500) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
  setTimeout(() => dismissToast(id), ttlMs);
}
export const dismissToast = (id: number) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

const effectName = (id: string) => catalog.effects.find((e) => e.id === id)?.name ?? id;

export const revealFile = (path: string | null) =>
  native.revealFile(path).catch((err) => toast({ tone: "warning", title: errorMessage(err) }));

/**
 * Files often arrive in batches; one toast per batch instead of one per file.
 * Keyed by peer + outcome, flushed shortly after the last file of the batch settles.
 */
const pendingToasts = new Map<string, { transfers: Transfer[]; timer: ReturnType<typeof setTimeout> }>();
function batchToast(t: Transfer) {
  const key = `${t.peerDeviceId}:${t.status}`;
  const entry = pendingToasts.get(key);
  if (entry) clearTimeout(entry.timer);
  const transfers = [...(entry?.transfers ?? []), t];
  const timer = setTimeout(() => {
    pendingToasts.delete(key);
    const one = transfers.length === 1 ? transfers[0]! : null;
    const what = one ? one.name : `${transfers.length} files`;
    if (t.status === "saved") {
      const last = transfers[transfers.length - 1]!;
      toast(
        {
          tone: "success",
          title: `Received ${what} from ${t.peerName}`,
          body: one ? formatBytes(one.size) : undefined,
          action: { label: "Show in Finder", run: () => void revealFile(last.path) },
        },
        7000,
      );
    } else if (t.status === "delivered") {
      toast({ tone: "success", title: `${t.peerName} received ${what}` });
    }
  }, 900);
  pendingToasts.set(key, { transfers, timer });
}

function onTransfer(t: Transfer) {
  const previous = state.transfers.find((x) => x.key === t.key);
  set((s) => ({ transfers: [t, ...s.transfers.filter((x) => x.key !== t.key)].slice(0, 100) }));
  if (previous?.status === t.status) return;
  if (t.status === "saved" || t.status === "delivered") batchToast(t);
  if (t.status === "failed") {
    toast({ tone: "danger", title: t.direction === "send" ? `Couldn't send ${t.name}` : `Couldn't receive ${t.name}`, body: t.detail ?? undefined }, 7000);
  }
}

export async function refreshRecent() {
  try {
    set({ recent: await native.recentEffects() });
  } catch {
    /* offline: keep what we have */
  }
}

const REASONS: Record<string, string> = {
  busy: "the device was already playing an effect",
  expired: "it arrived too late",
  unknown_effect: "the device doesn't have that effect",
  invalid_signature: "its signature didn't verify",
  not_paired: "the devices aren't paired",
  render_error: "the effect couldn't be displayed",
};

function onEvent(e: CoreEvent) {
  switch (e.kind) {
    case "connection":
      set((s) => ({
        snapshot: s.snapshot && {
          ...s.snapshot,
          connection: e.state,
          connectionDetail: e.detail,
          peers: e.state === "online" ? s.snapshot.peers : s.snapshot.peers.map((p) => ({ ...p, online: false })),
        },
      }));
      if (e.state === "online") void refreshRecent();
      break;
    case "me":
      set((s) => ({ snapshot: s.snapshot && { ...s.snapshot, me: e.device } }));
      break;
    case "peers":
      set((s) => ({ snapshot: s.snapshot && { ...s.snapshot, peers: e.peers } }));
      break;
    case "presence":
      set((s) => ({
        snapshot: s.snapshot && {
          ...s.snapshot,
          peers: s.snapshot.peers.map((p) =>
            p.deviceId === e.deviceId ? { ...p, online: e.online, lastSeenAt: e.lastSeenAt ?? p.lastSeenAt } : p,
          ),
        },
      }));
      break;
    case "pairRequest":
      set({ pairRequest: { pairingId: e.pairingId, claimant: e.claimant, sas: e.sas } });
      break;
    case "pairApproved":
      set({ pairRequest: null, lastPairApproved: e.peer });
      toast({ tone: "success", title: `Paired with ${e.peer.name}` });
      break;
    case "pairRejected":
      set({ lastPairRejected: e.pairingId });
      break;
    case "pairRevoked": {
      const name = state.snapshot?.peers.find((p) => p.deviceId === e.peerDeviceId)?.name ?? "A device";
      toast({ tone: "warning", title: `${name} was unpaired` });
      break;
    }
    case "effectIncoming":
      void refreshRecent();
      break;
    case "effectRejected":
      toast({ tone: "warning", title: `Blocked an effect from ${e.fromName}`, body: REASONS[e.reason] ?? e.reason });
      break;
    case "delivery": {
      const status = e.status as DeliveryStatus;
      set((s) => ({ deliveries: { ...s.deliveries, [e.eventId]: { eventId: e.eventId, status, detail: e.detail } } }));
      if (status === "completed" || status === "failed" || status === "receiver_offline") void refreshRecent();
      if (status === "receiver_offline") toast({ tone: "warning", title: "That device is offline", body: "Effects are only delivered to devices that are online." });
      if (status === "failed") toast({ tone: "danger", title: "Effect not shown", body: (e.detail && (REASONS[e.detail] ?? e.detail)) ?? undefined });
      break;
    }
    case "transfer":
      onTransfer(e.transfer);
      break;
    case "error":
      toast({ tone: "danger", title: e.message });
      break;
  }
}

let started = false;
/** Loads the initial snapshot and subscribes to core events. Idempotent. */
export async function startStore() {
  if (started) return;
  started = true;
  await native.onEvent(onEvent);
  set({ snapshot: await native.snapshot() });
  void refreshRecent();
  void native
    .listTransfers()
    .then((transfers) => set({ transfers }))
    .catch(() => {});
}

/** Opens a file picker and sends the chosen files to a device with this computer's file effect. */
export async function chooseAndSendFiles(deviceId: string) {
  try {
    await native.chooseAndSendFiles(deviceId);
  } catch (err) {
    toast({ tone: "danger", title: "Couldn't send files", body: errorMessage(err) });
  }
}

export async function sendFiles(deviceId: string, paths: string[]) {
  try {
    await native.sendFiles(deviceId, paths);
  } catch (err) {
    toast({ tone: "danger", title: "Couldn't send files", body: errorMessage(err) });
  }
}

export const actions = {
  clearPairRequest: () => set({ pairRequest: null }),
  clearPairOutcome: () => set({ lastPairApproved: null, lastPairRejected: null }),
  effectName,
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Subscribes to a slice of the store. The selection is recomputed only when the store changes,
 * so selectors may safely build new objects/arrays (React requires a stable snapshot).
 */
export function useStore<T>(select: (s: State) => T): T {
  const cache = useRef<{ state: State; value: T } | null>(null);
  return useSyncExternalStore(subscribe, () => {
    if (cache.current?.state !== state) cache.current = { state, value: select(state) };
    return cache.current.value;
  });
}
