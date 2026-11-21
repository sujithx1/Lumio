import { useEffect, type ReactNode } from "react";
import { dismissToast, useStore } from "../lib/store";
import { Icon, type IconName } from "./Icon";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-surface hairline ${className}`}>{children}</section>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[12px] font-medium tracking-[0.08em] text-fg-muted uppercase">{title}</h2>
      {action}
    </div>
  );
}

export type Tone = "online" | "offline" | "warning" | "danger" | "pending";

const TONE_COLOR: Record<Tone, string> = {
  online: "bg-online",
  offline: "bg-offline",
  warning: "bg-warning",
  danger: "bg-danger",
  pending: "bg-fg-faint",
};

export function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {tone === "online" && <span className={`absolute inset-0 rounded-pill ${TONE_COLOR[tone]} animate-ping-soft`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-pill ${TONE_COLOR[tone]}`} />
    </span>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs text-fg-muted hairline">
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export function Button({
  children,
  icon,
  variant = "primary",
  disabled,
  title,
  onClick,
  type = "button",
  busy,
}: {
  children: ReactNode;
  icon?: IconName;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  busy?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition duration-fast ease-synq disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const styles = {
    primary: "bg-gradient-to-b from-accent to-[#6346f0] text-white shadow-[0_8px_24px_-8px_var(--color-accent)] hover:brightness-110",
    ghost: "bg-surface-raised text-fg hairline hover:bg-white/5",
    danger: "bg-danger/10 text-danger hairline hover:bg-danger/20",
  }[variant];
  return (
    <button type={type} className={`${base} ${styles}`} disabled={disabled || busy} title={title} onClick={onClick}>
      {busy ? <Spinner /> : icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-pill border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-surface-raised text-fg-muted hairline">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-fg-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, children, width = 440 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className="relative max-h-full w-full overflow-y-auto rounded-xl bg-surface p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] hairline"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-1 text-fg-faint transition hover:bg-white/5 hover:text-fg"
          aria-label="Close"
        >
          <Icon name="x" size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-2 flex justify-between text-[13px]">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-[12px] text-fg">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="synq-range w-full"
        style={{ background: `linear-gradient(90deg, var(--color-accent) ${pct}%, var(--color-surface-raised) ${pct}%)` }}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between text-[13px] ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <span className="text-fg-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-pill transition duration-base ease-synq ${checked ? "bg-accent" : "bg-surface-raised hairline"}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-pill bg-white shadow transition-all duration-base ease-synq ${checked ? "left-5" : "left-1"}`}
        />
      </button>
    </label>
  );
}

const TOAST_TONE = { info: "text-accent-alt", success: "text-online", warning: "text-warning", danger: "text-danger" } as const;
const TOAST_ICON: Record<keyof typeof TOAST_TONE, IconName> = { info: "sparkles", success: "check", warning: "alert", danger: "alert" };

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex gap-3 rounded-lg p-3.5 glass shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)]">
          <span className={`mt-0.5 ${TOAST_TONE[t.tone]}`}>
            <Icon name={TOAST_ICON[t.tone]} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[12px] text-fg-muted">{t.body}</p>}
          </div>
          <button type="button" onClick={() => dismissToast(t.id)} className="text-fg-faint hover:text-fg" aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
