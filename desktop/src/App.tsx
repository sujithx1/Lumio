import { useEffect, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { StatusDot, Toasts } from "./components/ui";
import { connectionTone } from "./lib/status";
import { startStore, useStore } from "./lib/store";
import { Dashboard } from "./screens/Dashboard";
import { Devices } from "./screens/Devices";
import { Effects } from "./screens/Effects";
import { PairDialog } from "./screens/PairDialog";
import { SendSheet, type SendTarget } from "./screens/SendSheet";

type Screen = "dashboard" | "devices" | "effects";

const NAV: { id: Screen; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Home", icon: "home" },
  { id: "devices", label: "Devices", icon: "devices" },
  { id: "effects", label: "Effects", icon: "sparkles" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [pairOpen, setPairOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null);
  const connection = useStore((s) => s.snapshot?.connection);
  const pairRequest = useStore((s) => s.pairRequest);

  useEffect(() => {
    void startStore();
  }, []);

  // A device claimed our code: bring the pairing dialog up even if it was closed.
  useEffect(() => {
    if (pairRequest) setPairOpen(true);
  }, [pairRequest]);

  const tone = connectionTone(connection);

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-surface/60">
        {/* Space for the macOS traffic lights; also the window drag handle. */}
        <div data-tauri-drag-region className="h-12 shrink-0" />
        <div className="flex items-center gap-2.5 px-5 pb-6">
          <div className="relative h-7 w-7">
            <div className="absolute inset-0 rounded-pill bg-gradient-to-br from-accent to-accent-alt" />
            <div className="absolute inset-[5px] rounded-pill bg-bg" />
            <div className="absolute inset-[9px] rounded-pill bg-gradient-to-br from-accent to-accent-alt" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">Synq</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = item.id === screen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition duration-fast ease-synq ${
                  active ? "bg-white/[0.07] text-fg" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg"
                }`}
              >
                <Icon name={item.icon} size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4 px-5 py-5">
          <button
            type="button"
            onClick={() => setPairOpen(true)}
            disabled={connection !== "online"}
            className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-[13px] text-fg-muted transition hairline hover:bg-white/[0.04] hover:text-fg disabled:opacity-40"
          >
            <Icon name="link" size={15} /> Pair device
          </button>
          <div className="flex items-center gap-2.5 text-[12px] text-fg-muted">
            <StatusDot tone={tone.tone} />
            {tone.label}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div data-tauri-drag-region className="sticky top-0 z-10 h-12 bg-gradient-to-b from-bg to-transparent" />
        <div className="mx-auto max-w-[1080px] px-10 pb-12">
          {screen === "dashboard" && <Dashboard onPair={() => setPairOpen(true)} onSend={setSendTarget} />}
          {screen === "devices" && <Devices onPair={() => setPairOpen(true)} />}
          {screen === "effects" && <Effects onSend={setSendTarget} />}
        </div>
      </main>

      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} />
      <SendSheet target={sendTarget} onClose={() => setSendTarget(null)} />
      <Toasts />
    </div>
  );
}
