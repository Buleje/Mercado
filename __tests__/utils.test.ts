import { describe, it, expect } from "vitest";
import { cn, limaDateKey, startOfLimaDay } from "@/lib/utils";

describe("limaDateKey (bucketeo por día en zona Lima, UTC-5)", () => {
  it("una entrega de la noche en Lima cae en el día Lima, no en el UTC", () => {
    // 2026-06-18T01:00:00Z = 2026-06-17 20:00 en Lima (UTC-5).
    // En UTC sería "2026-06-18"; en Lima debe ser "2026-06-17".
    expect(limaDateKey("2026-06-18T01:00:00Z")).toBe("2026-06-17");
  });

  it("una entrega de la mañana coincide en ambos husos", () => {
    // 2026-06-18T15:00:00Z = 2026-06-18 10:00 Lima.
    expect(limaDateKey("2026-06-18T15:00:00Z")).toBe("2026-06-18");
  });

  it("acepta Date y number, y devuelve '' ante fecha inválida", () => {
    expect(limaDateKey(new Date("2026-06-18T15:00:00Z"))).toBe("2026-06-18");
    expect(limaDateKey(Date.UTC(2026, 5, 18, 15))).toBe("2026-06-18");
    expect(limaDateKey("no-es-fecha")).toBe("");
  });
});

describe("startOfLimaDay (00:00 Lima = 05:00 UTC)", () => {
  it("ancla el inicio del día Lima a las 05:00 UTC del mismo día", () => {
    const ms = startOfLimaDay("2026-06-18T01:00:00Z"); // 17 jun 20:00 Lima
    expect(new Date(ms).toISOString()).toBe("2026-06-17T05:00:00.000Z");
  });

  it("para una hora de la tarde Lima ancla al inicio de ESE día", () => {
    const ms = startOfLimaDay("2026-06-18T20:00:00Z"); // 18 jun 15:00 Lima
    expect(new Date(ms).toISOString()).toBe("2026-06-18T05:00:00.000Z");
  });
});

describe("cn (classname merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind classes", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("handles arrays", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  it("ignores null/undefined", () => {
    expect(cn("a", null, undefined, "b")).toBe("a b");
  });
});
