import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/junta/relative";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date("2026-06-18T12:00:00.000Z").getTime();

const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatRelativeTime", () => {
  it("menos de 1 min → 'recién'", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("recién");
    expect(formatRelativeTime(ago(30_000), NOW)).toBe("recién");
  });

  it("minutos → 'hace N min'", () => {
    expect(formatRelativeTime(ago(5 * MIN), NOW)).toBe("hace 5 min");
    expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe("hace 59 min");
  });

  it("horas → 'hace N h'", () => {
    expect(formatRelativeTime(ago(2 * HOUR), NOW)).toBe("hace 2 h");
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe("hace 23 h");
  });

  it("días → 'hace N d'", () => {
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("hace 3 d");
  });

  it("fecha futura o inválida → null", () => {
    expect(formatRelativeTime(ago(-5 * MIN), NOW)).toBeNull();
    expect(formatRelativeTime("no-es-fecha", NOW)).toBeNull();
  });

  it("desfase de reloj ≤30 s al futuro → 'recién' (no null)", () => {
    expect(formatRelativeTime(ago(-10_000), NOW)).toBe("recién");
    expect(formatRelativeTime(ago(-30_000), NOW)).toBe("recién");
  });
});
