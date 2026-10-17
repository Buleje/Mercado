import { describe, it, expect } from "vitest";
import { nextPayday } from "@/lib/credit/payday";

describe("nextPayday", () => {
  it("antes del 15 → devuelve el 15 del mismo mes", () => {
    const r = nextPayday(new Date("2026-06-03T10:00:00"));
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(5);
    expect(r.getDate()).toBe(15);
  });
  it("entre el 15 y fin de mes → devuelve el último día del mes", () => {
    const r = nextPayday(new Date("2026-06-20T10:00:00"));
    expect(r.getMonth()).toBe(5);
    expect(r.getDate()).toBe(30);
  });
  it("el día 15 exacto → salta a fin de mes", () => {
    const r = nextPayday(new Date("2026-06-15T10:00:00"));
    expect(r.getDate()).toBe(30);
  });
  it("el último día del mes → salta al 15 del mes siguiente", () => {
    const r = nextPayday(new Date("2026-06-30T10:00:00"));
    expect(r.getMonth()).toBe(6);
    expect(r.getDate()).toBe(15);
  });
  it("febrero (28 días) calcula bien el fin de mes", () => {
    const r = nextPayday(new Date("2026-02-20T10:00:00"));
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });
});
