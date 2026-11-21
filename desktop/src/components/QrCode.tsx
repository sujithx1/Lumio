/** Renders a QR matrix computed in Rust (no HTML injection, no QR library in the webview). */
export function QrCode({ size, modules, pixels = 208 }: { size: number; modules: string; pixels?: number }) {
  const quiet = 2;
  const total = size + quiet * 2;
  const rects: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y * size + x] === "1") rects.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg width={pixels} height={pixels} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" role="img" aria-label="Pairing QR code">
      <rect width={total} height={total} rx={1.5} fill="#f4f5fb" />
      <path d={rects.join("")} fill="#07080c" />
    </svg>
  );
}
