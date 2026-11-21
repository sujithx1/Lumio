import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Card, SectionHeader, Toggle } from "../components/ui";
import { errorMessage, native, type DisplayMode, type SendZone, type Settings } from "../lib/native";
import { toast } from "../lib/store";

/** How effects appear on this computer: Send Zone edge, overlay vs full screen, sound. */
export function EffectSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    native.getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      setSettings(await native.updateSettings(next));
    } catch (err) {
      toast({ tone: "danger", title: "Couldn't save settings", body: errorMessage(err) });
    }
  };

  const preview = () =>
    native.previewEffect({ effectId: "cosmic-portal", duration: 5000, intensity: 0.8, sound: true }).catch((err) =>
      toast({ tone: "danger", title: errorMessage(err) }),
    );

  if (!settings) return null;

  return (
    <div>
      <SectionHeader
        title="Effects on this computer"
        action={
          <button type="button" onClick={preview} className="flex items-center gap-1.5 text-[12px] text-fg-muted transition hover:text-fg">
            <Icon name="sparkles" size={14} /> Try it
          </button>
        }
      />
      <Card className="divide-y divide-border">
        <div className="flex items-center gap-6 px-5 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">Send Zone</p>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
              The side of your screen where you keep your phone. Effects arrive from that edge, as if they came out of the phone.
            </p>
          </div>
          <div className="flex gap-2">
            {(["left", "right"] as SendZone[]).map((zone) => (
              <ZoneOption key={zone} zone={zone} selected={settings.sendZone === zone} onSelect={() => save({ sendZone: zone })} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 px-5 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">Display</p>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
              {settings.displayMode === "overlay"
                ? "Effects float over your desktop and clicks pass straight through, so you can keep working."
                : "Effects take over the whole screen. Click or press Esc to dismiss."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1 hairline">
            {(
              [
                ["overlay", "Overlay"],
                ["fullscreen", "Full screen"],
              ] as Array<[DisplayMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => save({ displayMode: mode })}
                className={`rounded-md px-3 py-1.5 text-[12px] transition ${
                  settings.displayMode === mode ? "bg-surface-raised text-fg hairline" : "text-fg-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          <Toggle label="Play effect sounds on this computer" checked={settings.sound} onChange={(sound) => save({ sound })} />
        </div>
      </Card>
    </div>
  );
}

/** A tiny laptop diagram with the phone on one side. */
function ZoneOption({ zone, selected, onSelect }: { zone: SendZone; selected: boolean; onSelect: () => void }) {
  const left = zone === "left";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-2 rounded-lg px-3 pt-3 pb-2 transition hairline ${
        selected ? "bg-white/[0.06] ring-1 ring-accent" : "bg-bg hover:bg-white/[0.03]"
      }`}
    >
      <svg width="88" height="48" viewBox="0 0 88 48" aria-hidden>
        <rect x={left ? 22 : 6} y="6" width="60" height="34" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        <rect x={left ? 16 : 0} y="40" width="72" height="4" rx="2" fill="currentColor" fillOpacity="0.35" />
        <rect
          x={left ? 22 : 75}
          y="9"
          width="7"
          height="28"
          rx="2"
          fill={selected ? "var(--color-accent)" : "currentColor"}
          fillOpacity={selected ? 0.9 : 0.25}
        />
        <rect x={left ? 2 : 76} y="14" width="10" height="20" rx="2.5" fill="none" stroke={selected ? "var(--color-accent-alt)" : "currentColor"} strokeWidth="1.5" />
      </svg>
      <span className={`text-[12px] ${selected ? "text-fg" : "text-fg-muted"}`}>{left ? "Left edge" : "Right edge"}</span>
    </button>
  );
}
