/**
 * Ficha del permiso (vista «Control del permiso» del Libro TH).
 *
 * Los dos planes son los REALES del tenant Blas (medidos 2026-09-30):
 *  · cmrtxh5bp… — Tornillo, vigente 20/03/2026 → 20/03/2028, parcela PC-12,
 *    «quedan 537 días» al 30/09/2026;
 *  · cmuamvvnu… — 65 árboles de censo, sin vigencia ni parcela de corta.
 * Y 0 carátulas cargadas: el caso de todos los días hoy.
 */

import { describe, it, expect } from "vitest";
import { construirFichaPermiso, fechaDelPermiso, type PlanFicha } from "@/lib/forestal/loth-ficha-permiso";

/** 30/09/2026, 10:00 de Lima. */
const AHORA = new Date("2026-09-30T15:00:00.000Z");

const planTornillo: PlanFicha = {
  planType: "PO",
  planNumber: null,
  tituloHabilitante: null,
  resolucionNumber: null,
  resolucionDate: null,
  titularName: "Inversiones Agroforestales Blas S.A.",
  parcelaCorta: "PC-12",
  vigenciaDesde: "2026-03-20T00:00:00.000Z",
  vigenciaHasta: "2028-03-20T00:00:00.000Z",
  estado: "vigente",
};

const planCenso: PlanFicha = {
  planType: "PO",
  planNumber: null,
  titularName: "Inversiones Agroforestales Blas S.A.",
  parcelaCorta: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  estado: "vigente",
};

describe("construirFichaPermiso — planes reales, sin carátula", () => {
  it("Tornillo: vigente, quedan 537 días, parcela PC-12", () => {
    const f = construirFichaPermiso(null, planTornillo, AHORA);
    expect(f.estado).toBe("vigente");
    expect(f.diasQuedan).toBe(537);
    expect(f.estadoTexto).toBe("Vigente · quedan 537 días");
    expect(f.parcelaCorta).toBe("PC-12");
    expect(f.vigenciaDesde).toBe("viernes 20/03/2026");
    expect(f.vigenciaHasta).toBe("lunes 20/03/2028");
    expect(f.titular).toBe("Inversiones Agroforestales Blas S.A.");
    expect(f.documentoGestion).toBe("PO");
    expect(f.avancePct).toBe(27); // 194 de 731 días corridos = 26,5 %
    expect(f.faltantes.map((x) => x.texto)).toEqual(["Falta la carátula del libro"]);
    expect(f.faltantes[0].completar).toBe("caratula");
  });

  it("plan del censo: sin vigencia cargada, y lo dice con dónde completarlo", () => {
    const f = construirFichaPermiso(null, planCenso, AHORA);
    expect(f.estado).toBe("sin_vigencia");
    expect(f.diasQuedan).toBeNull();
    expect(f.estadoTexto).toBe("Sin vigencia cargada");
    expect(f.avancePct).toBeNull();
    expect(f.faltantes.map((x) => [x.texto, x.completar])).toEqual([
      ["Falta la carátula del libro", "caratula"],
      ["El plan no tiene vigencia", "plan"],
      ["El plan no tiene parcela de corta", "plan"],
    ]);
  });

  it("a las 20:00 de Lima (ya 1/10 en UTC) sigue contando 537, no 536", () => {
    const f = construirFichaPermiso(null, planTornillo, new Date("2026-10-01T01:00:00.000Z"));
    expect(f.diasQuedan).toBe(537);
  });
});

describe("construirFichaPermiso — estados y reglas", () => {
  const conFin = (hasta: string, estado = "vigente"): PlanFicha => ({ ...planTornillo, vigenciaHasta: hasta, estado });

  it("vence en ≤ 90 días → por_vencer; a los 91 sigue vigente", () => {
    expect(construirFichaPermiso(null, conFin("2026-12-29"), AHORA).estado).toBe("por_vencer"); // 90
    expect(construirFichaPermiso(null, conFin("2026-12-30"), AHORA).estado).toBe("vigente"); // 91
  });

  it("vencido: días negativos", () => {
    const f = construirFichaPermiso(null, conFin("2026-09-20"), AHORA);
    expect(f.estado).toBe("vencido");
    expect(f.diasQuedan).toBe(-10);
    expect(f.estadoTexto).toBe("Vencido hace 10 días");
  });

  it("estado declarado le gana al calendario (suspendido / vencido sin fecha)", () => {
    expect(construirFichaPermiso(null, conFin("2028-03-20", "suspendido"), AHORA).estado).toBe("suspendido");
    const f = construirFichaPermiso(null, { ...planCenso, estado: "vencido" }, AHORA);
    expect(f.estado).toBe("vencido");
    expect(f.estadoTexto).toBe("Vencido");
  });

  it("sin plan ni carátula: dos faltantes, ningún dato inventado", () => {
    const f = construirFichaPermiso(null, null, AHORA);
    expect(f.estado).toBe("sin_vigencia");
    expect(f.estadoTexto).toBe("Sin plan de manejo");
    expect(f.titulo).toBeNull();
    expect(f.titular).toBeNull();
    expect(f.faltantes.map((x) => x.completar)).toEqual(["caratula", "plan"]);
  });

  it("la carátula manda; el plan llena el hueco; resolución y fecha no se mezclan", () => {
    const f = construirFichaPermiso(
      {
        tituloHabilitante: "17-UCA/C-J-001-02",
        registroNumber: "LO-0042",
        tomo: "2",
        titularName: "Blas S.A.",
        ruc: " 20601234567 ",
        docGestionType: "PO",
        docGestionName: "Zafra 2026",
        resolucionNumber: null,
      },
      { ...planTornillo, resolucionNumber: "RD 012-2026", resolucionDate: "2026-03-18T00:00:00.000Z" },
      AHORA,
    );
    expect(f.titulo).toBe("17-UCA/C-J-001-02");
    expect(f.titular).toBe("Blas S.A.");
    expect(f.ruc).toBe("20601234567");
    expect(f.documentoGestion).toBe("PO Zafra 2026");
    expect(f.resolucion).toBe("RD 012-2026");
    expect(f.resolucionFecha).toBe("miércoles 18/03/2026");
    expect(f.faltantes).toEqual([]);
  });

  it("carátula sin título habilitante (y el plan tampoco lo tiene) → se reclama a la carátula", () => {
    const f = construirFichaPermiso({ titularName: "Blas S.A." }, planTornillo, AHORA);
    expect(f.faltantes.map((x) => x.clave)).toEqual(["caratula-titulo"]);
  });
});

describe("fechaDelPermiso", () => {
  it("date-only en UTC, con día y año", () => {
    expect(fechaDelPermiso("2026-09-10")).toBe("jueves 10/09/2026");
    expect(fechaDelPermiso(new Date("2026-09-10T00:00:00.000Z"))).toBe("jueves 10/09/2026");
    expect(fechaDelPermiso(null)).toBeNull();
    expect(fechaDelPermiso("basura")).toBeNull();
  });
});
