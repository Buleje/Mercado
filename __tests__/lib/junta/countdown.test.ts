import { describe, it, expect } from "vitest";
import { formatCountdown } from "@/lib/junta/countdown";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  it("ms <= 0 → 'Cerrada'", () => {
    expect(formatCountdown(0)).toBe("Cerrada");
    expect(formatCountdown(-5000)).toBe("Cerrada");
  });

  it(">= 1 día → 'Xd Yh Zm' (sin segundos)", () => {
    expect(formatCountdown(2 * DAY + 3 * HOUR + 14 * MIN + 30 * SEC)).toBe(
      "2d 3h 14m",
    );
    expect(formatCountdown(1 * DAY)).toBe("1d 0h 0m");
  });

  it("< 1 día → 'HH:MM:SS' con padding a 2 dígitos", () => {
    expect(formatCountdown(9 * HOUR + 5 * MIN + 3 * SEC)).toBe("09:05:03");
    expect(formatCountdown(23 * HOUR + 59 * MIN + 59 * SEC)).toBe("23:59:59");
  });

  it("sub-minuto cuenta los segundos", () => {
    expect(formatCountdown(45 * SEC)).toBe("00:00:45");
    expect(formatCountdown(1 * SEC)).toBe("00:00:01");
  });
});
