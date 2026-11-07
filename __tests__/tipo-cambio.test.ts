import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const memoria = new Map<string, unknown>();
vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: (k: string) => memoria.get(k) ?? null,
    set: (k: string, v: unknown) => void memoria.set(k, v),
  },
}));

import {
  aSoles,
  cierreSbsAnteriorA,
  hoyLima,
  leerPeriodoBcrp,
  leerTextoSunat,
  tipoCambioDelDia,
} from "@/lib/integrations/tipo-cambio";

/* Respuesta real del BCRP del 04-11-2026 00:45 (recortada). */
const BCRP = {
  periods: [
    { name: "29.Oct.26", values: ["3.455", "3.461"] },
    { name: "30.Oct.26", values: ["3.458", "3.467"] },
    { name: "02.Nov.26", values: ["3.456", "3.466"] },
    { name: "03.Nov.26", values: ["n.d.", "n.d."] },
  ],
};

afterEach(() => {
  memoria.clear();
  vi.unstubAllGlobals();
});

describe("tipo de cambio (SUNAT / BCRP)", () => {
  it("lee el texto de SUNAT de hoy", () => {
    expect(leerTextoSunat("04/11/2026|3.459|3.466|\n")).toEqual({ fecha: "2026-11-04", compra: 3.459, venta: 3.466 });
    expect(leerTextoSunat("<html>error</html>")).toBeNull();
    expect(leerTextoSunat("04/11/2026|0.001|3.466|")).toBeNull(); // cifra imposible: no se usa
  });

  it("lee las fechas del BCRP con meses en español (Set y Sep)", () => {
    expect(leerPeriodoBcrp("27.Oct.26")).toBe("2026-10-27");
    expect(leerPeriodoBcrp("5.Set.26")).toBe("2026-09-05");
    expect(leerPeriodoBcrp("05.Sep.26")).toBe("2026-09-05");
    expect(leerPeriodoBcrp("Oct 2026")).toBeNull();
  });

  it("para una fecha usa el último cierre SBS ANTERIOR, saltando feriados y «n.d.»", () => {
    // Lunes 02-11 → el viernes 30-10 (sábado, domingo y feriado 01-11 sin dato).
    expect(cierreSbsAnteriorA(BCRP, "2026-11-02")).toEqual({ fechaDato: "2026-10-30", compra: 3.458, venta: 3.467 });
    // Miércoles 04-11 → el 03-11 todavía es «n.d.» → el 02-11.
    expect(cierreSbsAnteriorA(BCRP, "2026-11-04")).toEqual({ fechaDato: "2026-11-02", compra: 3.456, venta: 3.466 });
    expect(cierreSbsAnteriorA({ periods: [] }, "2026-11-04")).toBeNull();
  });

  it("hoy sale de SUNAT; si SUNAT cae, del BCRP diciendo de qué día es", async () => {
    const ahora = new Date("2026-11-04T15:00:00Z");
    expect(hoyLima(ahora)).toBe("2026-11-04");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("04/11/2026|3.459|3.466|")));
    const deSunat = await tipoCambioDelDia("2026-11-04", ahora);
    expect(deSunat).toMatchObject({ compra: 3.459, venta: 3.466, fuente: "sunat", detalle: "SUNAT del 04-11" });

    memoria.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("sunat") ? new Response("caído", { status: 503 }) : new Response(JSON.stringify(BCRP)),
      ),
    );
    const deBcrp = await tipoCambioDelDia("2026-11-04", ahora);
    expect(deBcrp).toMatchObject({ venta: 3.466, fuente: "bcrp-sbs", fechaDato: "2026-11-02" });
    expect(deBcrp?.detalle).toBe("SBS al cierre del 02-11 (BCRP)");
  });

  it("si el BCRP contesta con su página de «verificando navegador», reintenta una vez", async () => {
    vi.useFakeTimers();
    let llamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        llamadas++;
        return llamadas === 1 ? new Response("<!DOCTYPE html><html></html>") : new Response(JSON.stringify(BCRP));
      }),
    );
    const promesa = tipoCambioDelDia("2026-11-02", new Date("2026-11-04T15:00:00Z"));
    await vi.advanceTimersByTimeAsync(1600);
    expect(await promesa).toMatchObject({ fechaDato: "2026-10-30", venta: 3.467 });
    expect(llamadas).toBe(2);
    vi.useRealTimers();
  });

  it("fecha futura o mal escrita → null sin llamar a nadie", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const ahora = new Date("2026-11-04T15:00:00Z");
    expect(await tipoCambioDelDia("2026-11-05", ahora)).toBeNull();
    expect(await tipoCambioDelDia("04/11/2026", ahora)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("ninguna fuente responde → null (la pantalla pide escribirlo a mano)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await tipoCambioDelDia("2026-11-04", new Date("2026-11-04T15:00:00Z"))).toBeNull();
  });

  it("convierte: compras con el de venta, ventas con el de compra", () => {
    const tc = { fecha: "2026-11-04", compra: 3.459, venta: 3.466, fuente: "sunat" as const, fechaDato: "2026-11-04", detalle: "" };
    expect(aSoles(1000, tc, "compra")).toBe(3466);
    expect(aSoles(1000, tc, "venta")).toBe(3459);
    expect(aSoles(12.35, tc, "compra")).toBe(42.81);
  });
});
