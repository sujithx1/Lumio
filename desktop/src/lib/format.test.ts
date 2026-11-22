import { describe, expect, test } from "bun:test";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  test("uses decimal units like Finder", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(2_481_903)).toBe("2.5 MB");
    expect(formatBytes(48_220_113)).toBe("48.2 MB");
    expect(formatBytes(1_000_000_000)).toBe("1 GB");
    expect(formatBytes(512_000_000)).toBe("512 MB");
  });
});
