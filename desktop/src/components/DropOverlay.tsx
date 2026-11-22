import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Peer } from "../lib/native";
import { sendFiles, toast, useStore } from "../lib/store";
import { Icon, platformIcon } from "./Icon";

/**
 * While files are dragged over the window, shows one drop target per online paired device.
 * Dropping on a target sends the files there with this computer's file effect.
 */
export function DropOverlay() {
  const peers = useStore((s) => s.snapshot?.peers ?? []);
  const connected = useStore((s) => s.snapshot?.connection === "online");
  const online = peers.filter((p) => p.online);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // The drag-drop listener is registered once; read the latest values through a ref.
  const latest = useRef({ online, connected });
  latest.current = { online, connected };

  useEffect(() => {
    // Tauri reports positions in physical pixels.
    const targetAt = (x: number, y: number): string | null => {
      const { online } = latest.current;
      if (online.length === 1) return online[0]!.deviceId;
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(x / dpr, y / dpr)?.closest<HTMLElement>("[data-drop-device]");
      return el?.dataset.dropDevice ?? null;
    };

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setDragging(true);
          setHover(targetAt(p.position.x, p.position.y));
        } else if (p.type === "leave") {
          setDragging(false);
          setHover(null);
        } else if (p.type === "drop") {
          setDragging(false);
          setHover(null);
          const { online, connected } = latest.current;
          const target = targetAt(p.position.x, p.position.y);
          if (!connected) return toast({ tone: "warning", title: "You're offline", body: "Files can be sent once Lumio reconnects." });
          if (online.length === 0) return toast({ tone: "warning", title: "No devices online", body: "Open Lumio on your phone or another computer first." });
          if (!target) return toast({ tone: "info", title: "Drop the files on a device to send them" });
          if (p.paths.length) void sendFiles(target, p.paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* Not running inside Tauri (browser preview). */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (!dragging) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] grid place-items-center bg-bg/80 backdrop-blur-sm">
      <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-accent/50" />
      <div className="relative w-full max-w-[760px] px-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent/15 text-accent-alt">
          <Icon name="upload" size={26} />
        </div>
        <h2 className="mt-4 text-[22px] font-semibold tracking-tight">
          {online.length === 0 ? "No devices online" : online.length === 1 ? `Drop to send to ${online[0]!.name}` : "Drop on a device to send"}
        </h2>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          {online.length === 0 ? "Open Lumio on your phone or another computer first." : "Your file effect plays on their screen as the files arrive."}
        </p>
        {online.length > 0 && (
          <div className={`mt-7 grid gap-3 ${online.length === 1 ? "grid-cols-1" : online.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {online.map((p) => (
              <DropTarget key={p.deviceId} peer={p} active={hover === p.deviceId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DropTarget({ peer, active }: { peer: Peer; active: boolean }) {
  return (
    <div
      data-drop-device={peer.deviceId}
      // Hit-testable (elementFromPoint skips pointer-events: none) although the overlay itself is not.
      className={`pointer-events-auto flex flex-col items-center gap-3 rounded-xl px-5 py-7 transition duration-fast ease-lumio ${
        active ? "scale-[1.03] bg-accent/20 ring-2 ring-accent" : "bg-surface/90 hairline"
      }`}
    >
      <div className={`grid h-12 w-12 place-items-center rounded-lg ${active ? "bg-accent text-white" : "bg-surface-raised"}`}>
        <Icon name={platformIcon(peer.platform)} size={22} />
      </div>
      <p className="max-w-full truncate text-[14px] font-medium">{peer.name}</p>
    </div>
  );
}
