import { useState, type FormEvent } from "react";
import { Icon, platformIcon } from "../components/Icon";
import { Button, Card, EmptyState, Modal, SectionHeader, StatusDot } from "../components/ui";
import { formatDate, timeAgo } from "../lib/format";
import { errorMessage, native, type Peer } from "../lib/native";
import { connectionTone, PLATFORM_LABEL } from "../lib/status";
import { toast, useStore } from "../lib/store";
import { EffectSettings } from "./EffectSettings";

export function Devices({ onPair }: { onPair: () => void }) {
  const snapshot = useStore((s) => s.snapshot);
  const peers = snapshot?.peers ?? [];
  const [removing, setRemoving] = useState<Peer | null>(null);

  return (
    <div className="space-y-9">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight">Devices</h1>
        <p className="mt-1 text-[13px] text-fg-muted">Computers and phones you trust to send and receive effects.</p>
      </header>

      <ThisDeviceSettings />

      <EffectSettings />

      <div>
        <SectionHeader
          title={`Paired devices${peers.length ? ` · ${peers.length}` : ""}`}
          action={
            <button type="button" onClick={onPair} className="flex items-center gap-1.5 text-[12px] text-fg-muted transition hover:text-fg">
              <Icon name="link" size={14} /> Pair new device
            </button>
          }
        />
        <Card>
          {peers.length === 0 ? (
            <EmptyState
              icon="devices"
              title="No paired devices"
              body="When you pair a device it appears here with its platform, live status and last-seen time."
              action={
                <Button icon="link" onClick={onPair}>
                  Pair new device
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {peers.map((p) => (
                <li key={p.deviceId} className="flex items-center gap-4 px-5 py-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-raised hairline">
                    <Icon name={platformIcon(p.platform)} size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name}</p>
                    <p className="text-[12px] text-fg-muted">
                      {PLATFORM_LABEL[p.platform]} · Paired {formatDate(p.pairedAt)}
                    </p>
                  </div>
                  <div className="hidden w-40 text-[12px] md:block">
                    <p className="flex items-center gap-2">
                      <StatusDot tone={p.online ? "online" : "offline"} />
                      {p.online ? "Online" : "Offline"}
                    </p>
                    <p className="mt-0.5 text-fg-faint">{p.online ? "Via relay" : p.lastSeenAt ? `Last seen ${timeAgo(p.lastSeenAt)}` : "Never seen"}</p>
                  </div>
                  <Button variant="ghost" icon="trash" onClick={() => setRemoving(p)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RemoveDialog peer={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function ThisDeviceSettings() {
  const snapshot = useStore((s) => s.snapshot);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tone = connectionTone(snapshot?.connection);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await native.renameDevice(name);
      setEditing(false);
      toast({ tone: "success", title: "Device renamed" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    ["Platform", snapshot ? PLATFORM_LABEL[snapshot.platform] : "—"],
    ["Connection", tone.label],
    ["Relay server", snapshot?.serverUrl ?? "—"],
    ["Device ID", snapshot?.me?.deviceId ?? "Not registered yet"],
  ];

  return (
    <div>
      <SectionHeader title="This device" />
      <Card>
        <div className="flex items-center gap-4 px-5 py-4">
          {editing ? (
            <form onSubmit={save} className="flex flex-1 items-center gap-3">
              <input
                autoFocus
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1 rounded-md bg-bg px-3 py-2 text-[14px] outline-none hairline focus:border-accent"
              />
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" busy={busy} disabled={!name.trim()}>
                Save
              </Button>
            </form>
          ) : (
            <>
              <p className="flex-1 text-[15px] font-medium">{snapshot?.me?.name ?? snapshot?.deviceName}</p>
              <Button
                variant="ghost"
                icon="edit"
                disabled={snapshot?.connection !== "online"}
                onClick={() => (setName(snapshot?.me?.name ?? ""), setEditing(true))}
              >
                Rename
              </Button>
            </>
          )}
        </div>
        {error && <p className="px-5 pb-3 text-[13px] text-danger">{error}</p>}
        <dl className="divide-y divide-border border-t border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-[13px] text-fg-muted">{k}</dt>
              <dd className="truncate text-right font-mono text-[12px] select-text">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function RemoveDialog({ peer, onClose }: { peer: Peer | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!peer) return;
    setBusy(true);
    setError(null);
    try {
      await native.removeDevice(peer.deviceId);
      toast({ tone: "info", title: `Removed ${peer.name}` });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={peer !== null} onClose={onClose} width={400}>
      <h2 className="text-[18px] font-semibold">Remove {peer?.name}?</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
        Neither device will be able to send effects to the other until you pair them again.
      </p>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" icon="trash" onClick={remove} busy={busy}>
          Remove
        </Button>
      </div>
    </Modal>
  );
}
