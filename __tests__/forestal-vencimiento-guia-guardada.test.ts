/**
 * __tests__/forestal-vencimiento-guia-guardada.test.ts — ADR-442: cuánto le
 * queda a una guía guardada que todavía espera su madera.
 *
 * Contexto medido (Blas, 27-09): 11 de 12 guías llegaron después de su
 * vencimiento. La fecha sale de la ficha de SERFOR («dd/mm/aaaa»); sin ficha no
 * hay fecha y no se inventa.
 */
import { describe, expect, it } from "vitest";

import {
  contarVencimientos,
  DIAS_VENCE_PRONTO,
  ordenarPorVencimiento,
  trozosDelAviso,
  vencimientoDeGuiaGuardada,
  type GuiaConFicha,
} from "@/lib/forestal/vencimiento-guia-guardada";

const HOY = "2026-09-27"; // domingo

function guia(fechaVencimiento: string | null, extra: Partial<GuiaConFicha> = {}): GuiaConFicha {
  return {
    verificadaEnSerfor: true,
    gtfDate: "2026-09-20",
    resumen: { especies: [], volumenM3: null, trozas: 0, fechaVencimiento, transportista: null, placa: null },
    ...extra,
  };
}

describe("vencimientoDeGuiaGuardada", () => {
  it("«pronto» son 2 días o menos", () => {
    expect(DIAS_VENCE_PRONTO).toBe(2);
  });

  it("sin ficha de SERFOR no hay fecha: lo dice y manda a buscarla", () => {
    const v = vencimientoDeGuiaGuardada({ verificadaEnSerfor: false, gtfDate: null, resumen: null }, HOY);
    expect(v.tono).toBe("sin_fecha");
    expect(v.vencimiento).toBeNull();
    expect(v.dias).toBeNull();
    expect(v.detalle).toMatch(/búscala en SERFOR/);
  });

  it("con ficha pero sin vencimiento: no lo inventa ni manda a SERFOR otra vez", () => {
    const v = vencimientoDeGuiaGuardada(guia(null), HOY);
    expect(v.tono).toBe("sin_fecha");
    expect(v.detalle).toMatch(/papel de la guía/);
  });

  it("vencida: cuenta los días en plural y en singular", () => {
    expect(vencimientoDeGuiaGuardada(guia("24/09/2026"), HOY)).toMatchObject({
      tono: "vencida",
      vencimiento: "2026-09-24",
      dias: -3,
      texto: "vencida hace 3 días",
    });
    expect(vencimientoDeGuiaGuardada(guia("26/09/2026"), HOY).texto).toBe("vencida hace 1 día");
  });

  it("el detalle nombra el día como se habla en el patio", () => {
    expect(vencimientoDeGuiaGuardada(guia("24/09/2026"), HOY).detalle).toMatch(/jueves 24\/09/);
  });

  it("vence hoy: el día del vencimiento todavía vale, sin corrimiento UTC", () => {
    expect(vencimientoDeGuiaGuardada(guia("27/09/2026"), HOY)).toMatchObject({ tono: "hoy", dias: 0, texto: "vence hoy" });
  });

  it("mañana y en 2 días son «pronto»; en 3 ya no", () => {
    expect(vencimientoDeGuiaGuardada(guia("28/09/2026"), HOY)).toMatchObject({ tono: "pronto", dias: 1, texto: "vence mañana" });
    expect(vencimientoDeGuiaGuardada(guia("29/09/2026"), HOY)).toMatchObject({ tono: "pronto", dias: 2, texto: "vence en 2 días" });
    expect(vencimientoDeGuiaGuardada(guia("30/09/2026"), HOY)).toMatchObject({ tono: "ok", dias: 3, texto: "vence en 3 días" });
  });

  it("cruza el fin de mes y de año contando días de calendario", () => {
    expect(vencimientoDeGuiaGuardada(guia("02/01/2027"), "2026-12-31").dias).toBe(2);
  });

  it("un vencimiento anterior a la expedición es un papel mal leído: se descarta", () => {
    const v = vencimientoDeGuiaGuardada(guia("10/09/2026", { gtfDate: "2026-09-20" }), HOY);
    expect(v.tono).toBe("sin_fecha");
  });

  it("el detalle con la ficha entera sirve si el resumen no la trae", () => {
    const v = vencimientoDeGuiaGuardada(guia(null, { serforGtf: { fechaVencimiento: "29/09/2026" } }), HOY);
    expect(v).toMatchObject({ tono: "pronto", vencimiento: "2026-09-29" });
  });

  it("una fecha que no existe no se lee como otra", () => {
    expect(vencimientoDeGuiaGuardada(guia("31/02/2026"), HOY).tono).toBe("sin_fecha");
  });
});

describe("aviso de la bandeja", () => {
  const vs = ["24/09/2026", "20/09/2026", "27/09/2026", "28/09/2026", "29/09/2026", "15/10/2026", null].map((f) =>
    vencimientoDeGuiaGuardada(guia(f), HOY),
  );

  it("cuenta vencidas, de hoy, pronto y sin fecha", () => {
    expect(contarVencimientos(vs)).toEqual({ vencidas: 2, hoy: 1, pronto: 2, sinFecha: 1 });
  });

  it("arma la frase con singular y plural, sólo con lo que apura", () => {
    expect(trozosDelAviso(contarVencimientos(vs)).map((t) => t.texto)).toEqual([
      "1 vence hoy",
      "2 vencen pronto",
      "2 vencidas",
    ]);
    expect(trozosDelAviso({ vencidas: 1, hoy: 0, pronto: 1, sinFecha: 3 }).map((t) => t.texto)).toEqual([
      "1 vence pronto",
      "1 vencida",
    ]);
    expect(trozosDelAviso({ vencidas: 0, hoy: 0, pronto: 0, sinFecha: 4 })).toEqual([]);
  });
});

describe("ordenarPorVencimiento", () => {
  it("la fecha más vieja arriba, sin fecha al final, empates en el orden que traía", () => {
    const lista = [
      { id: "sin", ...guia(null, { verificadaEnSerfor: false, resumen: null }) },
      { id: "ok", ...guia("15/10/2026") },
      { id: "hoy", ...guia("27/09/2026") },
      { id: "vencida", ...guia("24/09/2026") },
      { id: "pronto-a", ...guia("29/09/2026") },
      { id: "pronto-b", ...guia("29/09/2026") },
    ];
    expect(ordenarPorVencimiento(lista, HOY).map((g) => g.id)).toEqual([
      "vencida",
      "hoy",
      "pronto-a",
      "pronto-b",
      "ok",
      "sin",
    ]);
  });

  it("no toca la lista que recibe", () => {
    const lista = [{ id: "b", ...guia("29/09/2026") }, { id: "a", ...guia("24/09/2026") }];
    ordenarPorVencimiento(lista, HOY);
    expect(lista.map((g) => g.id)).toEqual(["b", "a"]);
  });
});
