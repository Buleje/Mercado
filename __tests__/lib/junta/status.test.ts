import { describe, it, expect } from "vitest";
import { effectiveStatus } from "@/lib/junta/status";

const future = new Date("2026-07-01T00:00:00Z");
const past = new Date("2026-06-01T00:00:00Z");
const now = new Date("2026-06-18T00:00:00Z");

describe("effectiveStatus", () => {
  it("OPEN si no llegó a la meta y la ventana sigue abierta", () => {
    expect(effectiveStatus(2, 4, future, now)).toBe("OPEN");
  });

  it("COMPLETE al alcanzar la meta", () => {
    expect(effectiveStatus(4, 4, future, now)).toBe("COMPLETE");
  });

  it("COMPLETE tiene prioridad aunque la ventana haya vencido", () => {
    expect(effectiveStatus(4, 4, past, now)).toBe("COMPLETE");
  });

  it("EXPIRED si venció la ventana y no llegó a la meta", () => {
    expect(effectiveStatus(2, 4, past, now)).toBe("EXPIRED");
  });

  it("OPEN en el borde exacto de la ventana solo si aún no venció", () => {
    expect(effectiveStatus(1, 4, now, now)).toBe("EXPIRED"); // <= now = vencida
  });
});
