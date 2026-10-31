/**
 * Aviso antes de que venza el plan (`loth-plan-aviso-vencimiento`): 90, 30, 7
 * y el día, una vez por escalón.
 */
import { describe, expect, it } from "vitest";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import {
  asuntoCorreoVencimiento,
  escalonQueToca,
  mensajeWhatsAppVencimiento,
  planearAvisosVencimiento,
  sellarAvisos,
} from "@/lib/forestal/loth-plan-aviso-vencimiento";

/** 24/10/2026, 08:22 de Lima (13:22 UTC), la hora del cron. */
const AHORA = new Date("2026-10-24T13:22:00Z");

function plan(p: Partial<PlanFichaApi> & Pick<PlanFichaApi, "id">): PlanFichaApi {
  return {
    isActive: true,
    alias: null,
    planType: "PO",
    planNumber: p.id.toUpperCase(),
    vigenciaDesde: "2026-01-14",
    vigenciaHasta: null,
    estado: "vigente",
    ...p,
  };
}

describe("escalonQueToca", () => {
  it("el más urgente pendiente, sellando también los largos", () => {
    expect(escalonQueToca(100, [])).toBeNull();
    expect(escalonQueToca(90, [])).toEqual({ umbral: 90, sellar: [90] });
    expect(escalonQueToca(20, [])).toEqual({ umbral: 30, sellar: [90, 30] });
    expect(escalonQueToca(20, [90, 30])).toBeNull();
    expect(escalonQueToca(5, [90, 30])).toEqual({ umbral: 7, sellar: [90, 30, 7] });
    expect(escalonQueToca(0, [90, 30, 7])).toEqual({ umbral: 0, sellar: [90, 30, 7, 0] });
    expect(escalonQueToca(0, [90, 30, 7, 0])).toBeNull();
  });

  it("vencido no (lo dice forestal-plazos); sin fecha una vez", () => {
    expect(escalonQueToca(-3, [])).toBeNull();
    expect(escalonQueToca(null, [])).toEqual({ umbral: "sin_fecha", sellar: ["sin_fecha"] });
    expect(escalonQueToca(null, ["sin_fecha"])).toBeNull();
    expect(escalonQueToca(null, [], false)).toBeNull();
  });
});

describe("planearAvisosVencimiento + sellarAvisos", () => {
  const planes = [
    plan({ id: "po12", vigenciaHasta: "2026-11-23" }), // 30 días
    plan({ id: "po9", vigenciaHasta: "2026-10-24" }), // hoy
    plan({ id: "po1", vigenciaHasta: null }), // sin fecha
    plan({ id: "plt", planType: "PLANTACION", vigenciaHasta: null }), // plantación sin fecha: no
    plan({ id: "viejo", vigenciaHasta: "2026-10-01" }), // vencido: no
    plan({ id: "baja", vigenciaHasta: "2026-10-30", isActive: false }),
    plan({ id: "cerr", vigenciaHasta: "2026-10-30", estado: "cerrado" }),
    plan({ id: "lejos", vigenciaHasta: "2027-06-30" }),
  ];

  it("hoy toca: el del día, el de 30 y el sin fecha — del más urgente al menos", () => {
    const a = planearAvisosVencimiento(planes, {}, AHORA);
    expect(a.map((x) => [x.planId, x.umbral])).toEqual([
      ["po9", 0],
      ["po12", 30],
      ["po1", "sin_fecha"],
    ]);
    expect(a[0]?.severidad).toBe("HIGH");
    expect(a[0]?.texto).toMatch(/^PO PO9 vence HOY \(sábado 24\/10\/2026\)/);
    expect(a[1]?.texto).toBe("PO PO12 vence en 30 días (lunes 23/11/2026).");
  });

  it("una vez sellado no se repite; cambiar la fecha lo vuelve a armar", () => {
    const hoy = planearAvisosVencimiento(planes, {}, AHORA);
    const reg = sellarAvisos({}, hoy);
    expect(reg.po12).toEqual({ hasta: "2026-11-23", enviados: [90, 30] });
    expect(planearAvisosVencimiento(planes, reg, AHORA)).toEqual([]);

    const renovado = planes.map((p) => (p.id === "po12" ? { ...p, vigenciaHasta: "2026-12-20" } : p));
    expect(planearAvisosVencimiento(renovado, reg, AHORA).map((x) => [x.planId, x.umbral])).toEqual([["po12", 90]]);
  });

  it("al día siguiente del de 30 no se manda nada hasta el de 7", () => {
    const reg = sellarAvisos({}, planearAvisosVencimiento(planes, {}, AHORA));
    const en20 = new Date("2026-11-03T13:22:00Z");
    expect(planearAvisosVencimiento(planes, reg, en20).filter((x) => x.planId === "po12")).toEqual([]);
    const en6 = new Date("2026-11-17T13:22:00Z");
    expect(planearAvisosVencimiento(planes, reg, en6).find((x) => x.planId === "po12")?.umbral).toBe(7);
  });

  it("DECLARADO vencido con fecha futura: no se avisa ningún escalón (M3)", () => {
    const declarado = [plan({ id: "po12", vigenciaHasta: "2026-11-23", estado: "vencido" }), plan({ id: "sinf", estado: "vencido" })];
    expect(planearAvisosVencimiento(declarado, {}, AHORA)).toEqual([]);
  });

  it("limpia los planes que ya no existen y respeta los demás", () => {
    const reg = sellarAvisos({ borrado: { hasta: null, enviados: ["sin_fecha"] }, lejos: { hasta: "2027-06-30", enviados: [] } }, [], ["lejos"]);
    expect(Object.keys(reg)).toEqual(["lejos"]);
  });
});

describe("mensajes", () => {
  it("un WhatsApp con todos y un asunto con el más urgente", () => {
    const a = planearAvisosVencimiento([plan({ id: "po12", vigenciaHasta: "2026-11-23" })], {}, AHORA);
    const wa = mensajeWhatsAppVencimiento(a, "Blas");
    expect(wa.split("\n")[0]).toBe("Blas · Libro TH — vigencia de tu plan");
    expect(wa).toContain("• PO PO12 vence en 30 días");
    expect(asuntoCorreoVencimiento(a)).toBe("Plan PO PO12 vence en 30 días (lunes 23/11/2026)");
    expect(asuntoCorreoVencimiento([...a, ...a])).toBe("2 planes de manejo por vencer");
  });
});
