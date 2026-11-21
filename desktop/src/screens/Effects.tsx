import { EffectPreview } from "../components/EffectPreview";
import { Icon } from "../components/Icon";
import { Button, Card } from "../components/ui";
import { CATEGORY_LABEL, catalog, formatSeconds } from "../lib/catalog";
import { errorMessage, native } from "../lib/native";
import { toast, useStore } from "../lib/store";
import type { SendTarget } from "./SendSheet";

export function Effects({ onSend }: { onSend: (target: SendTarget) => void }) {
  const hasPeers = useStore((s) => (s.snapshot?.peers.length ?? 0) > 0);

  const preview = (effectId: string, duration: number, intensity: number, sound: boolean) =>
    native.previewEffect({ effectId, duration, intensity, sound }).catch((err) => toast({ tone: "danger", title: errorMessage(err) }));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight">Effects</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          {catalog.effects.length} effects in the trusted catalog. Devices only ever play effects from this list.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.effects.map((effect) => (
          <Card key={effect.id} className="group p-2.5 transition duration-base ease-lumio hover:border-border-strong">
            <button
              type="button"
              className="block w-full"
              title="Preview on this device"
              onClick={() => preview(effect.id, effect.defaultDuration, effect.defaultIntensity, effect.hasSound)}
            >
              <EffectPreview effect={effect} />
            </button>
            <div className="px-2 pt-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold">{effect.name}</h3>
                <span className="rounded-pill px-2 py-0.5 text-[11px] text-fg-muted hairline">{CATEGORY_LABEL[effect.category]}</span>
              </div>
              <p className="mt-1.5 min-h-[2.6em] text-[13px] leading-snug text-fg-muted">{effect.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[12px] text-fg-faint">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clock" size={14} />
                    {formatSeconds(effect.defaultDuration)}
                  </span>
                  {effect.hasSound && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="volume" size={14} />
                      Sound
                    </span>
                  )}
                </div>
                <Button icon="send" variant="ghost" disabled={!hasPeers} title={hasPeers ? undefined : "Pair a device to send effects"} onClick={() => onSend({ effectId: effect.id })}>
                  Send
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
