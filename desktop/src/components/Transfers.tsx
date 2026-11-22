import { formatBytes, timeAgo } from "../lib/format";
import type { Transfer } from "../lib/native";
import { revealFile, useStore } from "../lib/store";
import { Icon } from "./Icon";
import { Card, EmptyState, SectionHeader } from "./ui";

const LABEL: Record<Transfer["status"], string> = {
  queued: "Waiting",
  preparing: "Preparing",
  uploading: "Sending",
  offered: "Waiting for device",
  delivered: "Delivered",
  downloading: "Receiving",
  saved: "Saved",
  failed: "Failed",
};

const ACTIVE = new Set<Transfer["status"]>(["queued", "preparing", "uploading", "offered", "downloading"]);

/** Recent files sent and received, with live progress. */
export function Transfers({ limit = 6 }: { limit?: number }) {
  const transfers = useStore((s) => s.transfers);
  const shown = transfers.slice(0, limit);

  return (
    <div>
      <SectionHeader
        title="Files"
        action={
          <button
            type="button"
            onClick={() => void revealFile(null)}
            className="flex items-center gap-1.5 text-[12px] text-fg-muted transition hover:text-fg"
          >
            <Icon name="folder" size={14} /> Open received files
          </button>
        }
      />
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon="upload"
            title="Drop files here to send them"
            body="Drag photos, videos or any file onto this window, or use Send files on a device. Your chosen effect plays on the other screen as they arrive."
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((t) => (
              <TransferRow key={t.key} t={t} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TransferRow({ t }: { t: Transfer }) {
  const active = ACTIVE.has(t.status);
  const pct = t.size > 0 ? Math.min(100, Math.round((t.bytes / t.size) * 100)) : active ? 0 : 100;
  const sending = t.direction === "send";
  const tone = t.status === "failed" ? "text-danger" : t.status === "saved" || t.status === "delivered" ? "text-online" : "text-fg-muted";

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className={sending ? "text-accent" : "text-accent-alt"}>
        <Icon name={sending ? "arrowUp" : "arrowDown"} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">
          <span className="font-medium">{t.name}</span>
          <span className="text-fg-muted">
            {sending ? " to " : " from "}
            {t.peerName}
          </span>
        </p>
        {active ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-white/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-pill bg-gradient-to-r from-accent to-accent-alt transition-[width] duration-base ${t.status === "offered" ? "animate-pulse" : ""}`}
              style={{ width: `${t.status === "offered" ? 100 : pct}%` }}
            />
          </div>
        ) : (
          <p className="mt-0.5 truncate text-[12px] text-fg-faint">
            {formatBytes(t.size)}
            {t.detail && t.status === "failed" ? ` · ${t.detail}` : ""}
          </p>
        )}
      </div>
      <span className={`w-36 text-right text-[12px] ${tone}`}>
        {LABEL[t.status]}
        {active && t.size > 0 && (t.status === "uploading" || t.status === "downloading") ? ` · ${pct}%` : ""}
      </span>
      {t.status === "saved" && t.path ? (
        <button
          type="button"
          onClick={() => void revealFile(t.path)}
          className="w-24 text-right text-[12px] text-accent-alt transition hover:text-fg"
          title="Show in Finder"
        >
          Show
        </button>
      ) : (
        <span className="w-24 text-right text-[12px] text-fg-faint">{timeAgo(t.startedAt)}</span>
      )}
    </li>
  );
}
