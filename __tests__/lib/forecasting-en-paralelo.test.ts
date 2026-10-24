import { describe, it, expect } from "vitest";
import { mapEnParalelo } from "@/lib/forecasting/en-paralelo";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapEnParalelo", () => {
  it("devuelve en el orden de entrada aunque terminen desordenados", async () => {
    const r = await mapEnParalelo([30, 5, 20, 1], 3, async (ms, i) => { await espera(ms); return `${i}:${ms}`; });
    expect(r).toEqual(["0:30", "1:5", "2:20", "3:1"]);
  });

  it("nunca tiene más de `limite` en vuelo", async () => {
    let enVuelo = 0, maximo = 0;
    await mapEnParalelo(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      enVuelo++; maximo = Math.max(maximo, enVuelo); await espera(2); enVuelo--;
    });
    expect(maximo).toBe(4);
  });

  it("lista vacía → []; un error corta con ese error", async () => {
    expect(await mapEnParalelo([], 6, async () => 1)).toEqual([]);
    await expect(mapEnParalelo([1, 2], 2, async (n) => { if (n === 2) throw new Error("x"); return n; })).rejects.toThrow("x");
  });
});
