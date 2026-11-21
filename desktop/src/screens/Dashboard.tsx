import { EffectPreview } from "../components/EffectPreview";
import { Icon, platformIcon } from "../components/Icon";
import { Button, Card, EmptyState, Pill, SectionHeader, StatusDot } from "../components/ui";
import { catalog } from "../lib/catalog";
import { timeAgo } from "../lib/format";
import { connectionTone, PLATFORM_LABEL, STATUS_LABEL } from "../lib/status";
import { actions, useStore } from "../lib/store";
import type { SendTarget } from "./SendSheet";

interface Props {
  onPair: () => void;
  onSend: (target: SendTarget) => void;
}

export function Dashboard({ onPair, onSend }: Props) {
  const snapshot = useStore((s) => s.snapshot);
  const recent = useStore((s) => s.recent);
  const peers = snapshot?.peers ?? [];

  return (
    <div className="space-y-9">
      <ThisDevice />

      <div>
        <SectionHeader
          title="Your devices"
          action={
            peers.length > 0 && (
              <button type="button" onClick={onPair} className="flex items-center gap-1.5 text-[12px] text-fg-muted transition hover:text-fg">
                <Icon name="link" size={14} /> Pair new device
              </button>
            )
          }
        />
        {peers.length === 0 ? (
          <Card>
            <EmptyState
              icon="link"
              title="No paired devices yet"
              body="Pair a phone or another computer by scanning a QR code or typing a short code. Paired devices appear here with their live status."
              action={
                <Button icon="link" onClick={onPair} disabled={snapshot?.connection !== "online"}>
                  Pair new device
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {peers.map((p) => (
              <Card key={p.deviceId} className="group flex items-center gap-4 p-4">
                <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-raised hairline">
                  <Icon name={platformIcon(p.platform)} size={21} />
                  <span className="absolute -right-0.5 -bottom-0.5 rounded-pill bg-surface p-[3px]">
                    <StatusDot tone={p.online ? "online" : "offline"} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{p.name}</p>
                  <p className="text-[12px] text-fg-muted">
                    {PLATFORM_LABEL[p.platform]} · {p.online ? "Online" : p.lastSeenAt ? `Seen ${timeAgo(p.lastSeenAt)}` : "Offline"}
                  </p>
                </div>
                <Button variant="ghost" icon="send" disabled={!p.online} onClick={() => onSend({ deviceId: p.deviceId })} title={p.online ? undefined : "Offline"}>
                  Send
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="Quick effects" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {catalog.effects.slice(0, 4).map((effect) => (
            <button
              key={effect.id}
              type="button"
              onClick={() => onSend({ effectId: effect.id })}
              disabled={peers.length === 0}
              className="rounded-xl bg-surface p-2 text-left transition duration-base ease-synq hairline hover:-translate-y-0.5 hover:border-border-strong disabled:pointer-events-none disabled:opacity-50"
            >
              <EffectPreview effect={effect} size="sm" />
              <p className="px-1.5 pt-2.5 pb-1 text-[13px] font-medium">{effect.name}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="Recent effects" />
        <Card>
          {recent.length === 0 ? (
            <EmptyState icon="clock" title="Nothing sent or received yet" body="Effects you send and receive will show up here." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.slice(0, 8).map((r) => (
                <li key={r.eventId} className="flex items-center gap-3 px-5 py-3">
                  <span className={r.direction === "sent" ? "text-accent" : "text-accent-alt"}>
                    <Icon name={r.direction === "sent" ? "arrowUp" : "arrowDown"} size={16} />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="font-medium">{actions.effectName(r.effectId)}</span>
                    <span className="text-fg-muted">
                      {r.direction === "sent" ? " to " : " from "}
                      {r.peerName}
                    </span>
                  </p>
                  <span className="text-[12px] text-fg-muted">{STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="w-20 text-right text-[12px] text-fg-faint">{timeAgo(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ThisDevice() {
  const snapshot = useStore((s) => s.snapshot);
  const tone = connectionTone(snapshot?.connection);
  const name = snapshot?.me?.name ?? snapshot?.deviceName ?? "…";
  return (
    <div className="relative overflow-hidden rounded-xl p-7 glass">
      <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-pill bg-accent/30 blur-3xl animate-breathe" />
      <div className="pointer-events-none absolute right-40 -bottom-28 h-56 w-56 rounded-pill bg-accent-alt/20 blur-3xl animate-breathe [animation-delay:1.5s]" />
      <div className="relative flex items-center gap-5">
        <div className="grid h-14 w-14 place-items-center rounded-lg bg-surface-raised text-fg hairline">
          <Icon name="laptop" size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-wide text-fg-faint uppercase">This device</p>
          <h1 className="truncate text-[26px] font-semibold tracking-tight">{name}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {snapshot ? `${PLATFORM_LABEL[snapshot.platform]} · Synq ${snapshot.appVersion}` : "Starting…"}
            {snapshot?.connectionDetail && snapshot.connection !== "online" && ` · ${snapshot.connectionDetail}`}
          </p>
        </div>
        <Pill tone={tone.tone}>{tone.label}</Pill>
      </div>
    </div>
  );
}
