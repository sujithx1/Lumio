import { useEffect, useMemo, useState } from "react";
import { EffectPreview } from "../components/EffectPreview";
import { Icon, platformIcon } from "../components/Icon";
import { Button, Modal, Slider, StatusDot, Toggle } from "../components/ui";
import { catalog, formatSeconds, type EffectDefinition } from "../lib/catalog";
import { errorMessage, native } from "../lib/native";
import { useStore, type DeliveryStatus } from "../lib/store";

export interface SendTarget {
  effectId?: string;
  deviceId?: string;
}

const STEPS: { status: DeliveryStatus; label: string }[] = [
  { status: "sending", label: "Sending" },
  { status: "relayed", label: "Delivered to relay" },
  { status: "received", label: "Playing on device" },
  { status: "completed", label: "Finished" },
];

const STEP_INDEX: Partial<Record<DeliveryStatus, number>> = { sending: 0, relayed: 1, received: 2, completed: 3 };

/** Choose device + effect, tune it, send it, and watch delivery progress. */
export function SendSheet({ target, onClose }: { target: SendTarget | null; onClose: () => void }) {
  const peers = useStore((s) => s.snapshot?.peers ?? []);
  const connected = useStore((s) => s.snapshot?.connection === "online");
  const [effectId, setEffectId] = useState(catalog.effects[0]!.id);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [duration, setDuration] = useState(5000);
  const [intensity, setIntensity] = useState(0.7);
  const [sound, setSound] = useState(true);
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const delivery = useStore((s) => (eventId ? s.deliveries[eventId] : undefined));

  const effect: EffectDefinition = useMemo(() => catalog.effects.find((e) => e.id === effectId) ?? catalog.effects[0]!, [effectId]);

  useEffect(() => {
    if (!target) return;
    const e = catalog.effects.find((x) => x.id === target.effectId) ?? catalog.effects[0]!;
    setEffectId(e.id);
    setDuration(e.defaultDuration);
    setIntensity(e.defaultIntensity);
    setSound(e.hasSound);
    setEventId(null);
    setError(null);
    const preferred = target.deviceId ?? peers.find((p) => p.online)?.deviceId ?? peers[0]?.deviceId ?? null;
    setDeviceId(preferred);
    // Only when the sheet opens with a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const pickEffect = (e: EffectDefinition) => {
    setEffectId(e.id);
    setDuration(e.defaultDuration);
    setIntensity(e.defaultIntensity);
    setSound(e.hasSound);
    setEventId(null);
  };

  const device = peers.find((p) => p.deviceId === deviceId);
  const send = async () => {
    if (!deviceId) return;
    setError(null);
    try {
      setEventId(await native.sendEffect({ deviceId, effectId, duration, intensity, sound: sound && effect.hasSound }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const preview = () =>
    native.previewEffect({ effectId, duration, intensity, sound: sound && effect.hasSound }).catch((err) => setError(errorMessage(err)));

  const status = delivery?.status;
  const inFlight = status !== undefined && !["completed", "failed", "receiver_offline", "expired", "rejected"].includes(status);

  return (
    <Modal open={target !== null} onClose={onClose} width={620}>
      <h2 className="text-[19px] font-semibold tracking-tight">Send an effect</h2>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {catalog.effects.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => pickEffect(e)}
            className={`rounded-lg p-1.5 text-left transition ${e.id === effectId ? "bg-white/[0.06] ring-1 ring-accent" : "hover:bg-white/[0.03]"}`}
          >
            <EffectPreview effect={e} size="sm" />
            <p className="truncate px-1 pt-1.5 text-[12px] font-medium">{e.name}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] text-fg-muted">To</p>
          {peers.length === 0 ? (
            <p className="rounded-lg bg-bg p-4 text-[13px] text-fg-muted hairline">Pair a device first.</p>
          ) : (
            <div className="space-y-1.5">
              {peers.map((p) => (
                <button
                  key={p.deviceId}
                  type="button"
                  onClick={() => setDeviceId(p.deviceId)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hairline ${
                    p.deviceId === deviceId ? "bg-white/[0.06] ring-1 ring-accent" : "bg-bg hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon name={platformIcon(p.platform)} size={17} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                  <StatusDot tone={p.online ? "online" : "offline"} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-5">
          <Slider
            label="Duration"
            value={duration}
            min={effect.minDuration}
            max={effect.maxDuration}
            step={500}
            format={formatSeconds}
            onChange={setDuration}
          />
          <Slider label="Intensity" value={intensity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setIntensity} />
          <Toggle label={effect.hasSound ? "Sound" : "Sound (not available)"} checked={sound && effect.hasSound} onChange={setSound} disabled={!effect.hasSound} />
        </div>
      </div>

      {device && !device.online && (
        <p className="mt-5 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-[12px] text-warning">
          <Icon name="alert" size={14} /> {device.name} is offline. Effects only play on devices that are online with Synq open.
        </p>
      )}
      {error && <p className="mt-5 text-[13px] text-danger">{error}</p>}

      {delivery && <DeliveryProgress status={delivery.status} detail={delivery.detail} />}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" icon="sparkles" onClick={preview}>
          Preview here
        </Button>
        <Button icon="send" onClick={send} disabled={!device || !device.online || !connected || inFlight} busy={inFlight}>
          {device ? `Send to ${device.name}` : "Send"}
        </Button>
      </div>
    </Modal>
  );
}

function DeliveryProgress({ status, detail }: { status: DeliveryStatus; detail: string | null }) {
  const failed = ["failed", "receiver_offline", "expired", "rejected"].includes(status);
  const current = STEP_INDEX[status] ?? -1;
  if (failed) {
    const text =
      status === "receiver_offline"
        ? "The device went offline before it could receive the effect."
        : `Not shown${detail ? `: ${detail.replace(/_/g, " ")}` : ""}.`;
    return (
      <p className="mt-5 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-[12px] text-danger">
        <Icon name="alert" size={14} /> {text}
      </p>
    );
  }
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li key={s.status} className="text-[11px]">
          <div className={`h-1 rounded-pill transition-colors duration-slow ${i <= current ? "bg-accent" : "bg-surface-raised"}`} />
          <p className={`mt-1.5 ${i <= current ? "text-fg" : "text-fg-faint"}`}>{s.label}</p>
        </li>
      ))}
    </ol>
  );
}
