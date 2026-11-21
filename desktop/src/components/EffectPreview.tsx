import type { EffectDefinition } from "../lib/catalog";

/**
 * Lightweight CSS preview used in lists. The full-screen renderers (Canvas/WebGL) are separate and only run on receive.
 */
export function EffectPreview({ effect, size = "md" }: { effect: EffectDefinition; size?: "sm" | "md" }) {
  const [a, b] = effect.accent;
  const height = size === "sm" ? "h-14" : "h-36";
  return (
    <div className={`relative ${height} overflow-hidden rounded-lg bg-bg`}>
      <div
        className="absolute -inset-1/2 animate-drift opacity-80"
        style={{ background: `conic-gradient(from 0deg, ${a}, transparent 30%, ${b}, transparent 70%, ${a})` }}
      />
      <div
        className="absolute inset-0 animate-breathe"
        style={{ background: `radial-gradient(60% 80% at 50% 60%, ${a}66, transparent 70%)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,transparent_40%,var(--color-bg)_100%)]" />
    </div>
  );
}
