/**
 * Aviso de plazos del Libro TH (`loth-aviso-plazos`).
 *
 * Fixtures con los datos reales de Blas que se conocen: un plan vivo SIN
 * vigencia (cmuamvvnu…), el de Tornillo que vence el 20/03/2028 y la GTF
 * 001-0045678 citada en el libro sin estar entre las guías registradas.
 */
import { describe, expect, it } from "vitest";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { construirFichaPermiso } from "@/lib/forestal/loth-ficha-permiso";
import {
  ACCION_DESPACHO,
  ACCION_GUIAS,
  ACCION_PLAN,
  construirAvisoTh,
  despachosSinAsentar,
  planesEnAviso,
  registrosTardiosRecientes,
  type DatosAvisoTh,
  type GtfAvisoTh,
} from "@/lib/forestal/loth-aviso-plazos";

/** 30/09/2026 a las 10:00 de Lima. */
const AHORA = new Date("2026-09-30T15:00:00Z");

let n = 0;
function linea(p: Partial<LothEntryDTO> & Pick<LothEntryDTO, "section">): LothEntryDTO {
  n += 1;
  return {
    id: `l${n}`,
    lineNo: n,
    entryDate: "2026-09-01T00:00:00.000Z",
    treeCode: null,
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: null,
    diamMenorM: null,
    lengthM: null,
    volumeM3: null,
    productType: null,
    quantity: null,
    unit: null,
    pieces: null,
    gtfNumber: null,
    discarded: false,
    consumoInterno: false,
    observations: null,
    status: "registrado",
    annulledReason: null,
    gpsLat: null,
    gpsLng: null,
    photoUrl: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...p,
  };
}

function gtf(numero: string, fecha: string | null, p: Partial<GtfAvisoTh> = {}): GtfAvisoTh {
  return { gtfNumber: numero, gtfDate: fecha, volumenTotalM3: "6.6102", piezasTotal: 4, status: "emitida", tipo: "trozas", ...p };
}

function plan(id: string, p: Partial<PlanFichaApi> = {}): PlanFichaApi {
  return { id, isActive: true, alias: null, planType: "PO", planNumber: null, estado: "vigente", ...p };
}

const vacio: DatosAvisoTh = { lineas: [], gtfs: [], planes: [] };

describe("despachos por asentar (GTF de trozas emitida sin línea de Despacho de trozas)", () => {
  it("avisa desde el día 10 y cuenta el plazo de 15 días calendario desde la guía", () => {
    const d: DatosAvisoTh = {
      ...vacio,
      gtfs: [
        gtf("001-A", "2026-09-18T00:00:00.000Z"), // 12 días → quedan 3
        gtf("001-B", "2026-09-25T00:00:00.000Z"), // 5 días → todavía no
        gtf("001-C", "2026-09-10T00:00:00.000Z"), // 20 días → vencido
        gtf("001-D", "2026-09-15T00:00:00.000Z"), // 15 días → hoy es el último
      ],
    };
    const r = despachosSinAsentar(d, AHORA);
    expect(r.map((x) => [x.gtfNumber, x.dias, x.quedan, x.estado])).toEqual([
      ["001-C", 20, -5, "vencido"],
      ["001-D", 15, 0, "vence_hoy"],
      ["001-A", 12, 3, "por_vencer"],
    ]);
    expect(r[2].fecha).toBe("18/09/2026");
    expect(r[2].volumenM3).toBe(6.6102);
  });

  it("no avisa la guía que el libro ya cita, la de producto, la anulada ni la sin fecha", () => {
    const d: DatosAvisoTh = {
      lineas: [
        linea({ section: "trozado", trozaCode: "T1", volumeM3: "6.6102" }),
        linea({ section: "despacho_troza", trozaCode: "T1", gtfNumber: "001-A" }),
      ],
      gtfs: [
        gtf("001-A", "2026-09-01T00:00:00.000Z"),
        gtf("001-P", "2026-09-01T00:00:00.000Z", { tipo: "producto" }),
        gtf("001-X", "2026-09-01T00:00:00.000Z", { status: "anulada" }),
        gtf("001-S", null),
      ],
      planes: [],
    };
    expect(despachosSinAsentar(d, AHORA)).toEqual([]);
  });

  it("el «hoy» es el de Lima: a las 22:00 del 30/09 en Pucallpa la guía del 15/09 vence hoy, no ayer", () => {
    const noche = new Date("2026-10-01T03:00:00Z"); // UTC ya es 1/10
    const r = despachosSinAsentar({ ...vacio, gtfs: [gtf("001-D", "2026-09-15T00:00:00.000Z")] }, noche);
    expect(r[0]).toMatchObject({ dias: 15, quedan: 0, estado: "vence_hoy" });
  });
});

describe("plan por vencer / sin vigencia (misma cuenta que la ficha del permiso)", () => {
  const blasSinVigencia = plan("cmuamvvnu0000", { planNumber: "PO-01" });
  const tornillo = plan("tornillo", { planNumber: "PO Tornillo", vigenciaDesde: "2026-03-20T00:00:00.000Z", vigenciaHasta: "2028-03-20T00:00:00.000Z" });

  it("Blas: avisa el plan vivo sin vigencia; el de Tornillo (vence 20/03/2028) no", () => {
    const r = planesEnAviso([blasSinVigencia, tornillo], AHORA);
    expect(r).toEqual([
      { id: "cmuamvvnu0000", nombre: "PO PO-01", estado: "sin_vigencia", diasQuedan: null, vigenciaHasta: null },
    ]);
  });

  it("≤ 90 días es «por vencer», con los MISMOS días que la ficha del permiso", () => {
    const p = plan("p90", { planNumber: "7", vigenciaHasta: "2026-11-15T00:00:00.000Z" });
    const r = planesEnAviso([p], AHORA);
    expect(r[0].estado).toBe("por_vencer");
    expect(r[0].diasQuedan).toBe(construirFichaPermiso(null, p, AHORA).diasQuedan);
    expect(r[0].diasQuedan).toBe(46);
  });

  it("vencido sí; dado de baja, cerrado o suspendido no", () => {
    const r = planesEnAviso(
      [
        plan("v", { vigenciaHasta: "2026-09-01T00:00:00.000Z" }),
        plan("baja", { isActive: false, vigenciaHasta: "2026-09-01T00:00:00.000Z" }),
        plan("cerrado", { estado: "cerrado", vigenciaHasta: "2026-09-01T00:00:00.000Z" }),
        plan("susp", { estado: "suspendido" }),
      ],
      AHORA,
    );
    expect(r.map((x) => [x.id, x.estado, x.diasQuedan])).toEqual([["v", "vencido", -29]]);
  });
});

describe("líneas asentadas fuera de plazo (sólo se cuentan)", () => {
  it("cuenta las de los últimos 7 días que pasaron los 15; ignora las viejas y las en plazo", () => {
    const lineas = [
      linea({ section: "trozado", entryDate: "2026-09-01T00:00:00.000Z", createdAt: "2026-09-28T10:00:00.000Z" }), // 27 d, reciente
      linea({ section: "tala", entryDate: "2026-08-01T00:00:00.000Z", createdAt: "2026-09-10T10:00:00.000Z" }), // tarde pero viejo
      linea({ section: "tala", entryDate: "2026-09-20T00:00:00.000Z", createdAt: "2026-09-29T10:00:00.000Z" }), // en plazo
    ];
    expect(registrosTardiosRecientes(lineas, AHORA)).toEqual([{ section: "trozado", lineNo: lineas[0].lineNo, dias: 27 }]);
  });

  it("solas no disparan el aviso (ya no se pueden salvar)", () => {
    const a = construirAvisoTh(
      { ...vacio, lineas: [linea({ section: "trozado", entryDate: "2026-09-01T00:00:00.000Z", createdAt: "2026-09-28T10:00:00.000Z" })] },
      AHORA,
    );
    expect(a.hayQueAvisar).toBe(false);
    expect(a.tardias).toHaveLength(1);
    expect(a.grupos.map((g) => [g.clave, g.dispara])).toEqual([["tardias", false]]);
    expect(a.grupos[0].accion.url).toBe("/admin?tab=loth-libro-operaciones&vista=secciones&seccion=trozado");
  });
});

describe("construirAvisoTh — el aviso completo", () => {
  it("Blas: la GTF 001-0045678 citada sin registrar + el plan sin vigencia, cada uno con su clic", () => {
    const a = construirAvisoTh(
      {
        lineas: [
          linea({ section: "trozado", trozaCode: "113-1", volumeM3: "2.5" }),
          linea({ section: "despacho_troza", trozaCode: "113-1", gtfNumber: "001-0045678" }),
        ],
        gtfs: [],
        planes: [plan("cmuamvvnu0000", { planNumber: "PO-01" })],
      },
      AHORA,
      "Inversiones Agroforestales Blas",
    );
    expect(a.hayQueAvisar).toBe(true);
    expect(a.severidad).toBe("MEDIUM");
    expect(a.guias).toEqual([{ gtfNumber: "001-0045678", trozas: 1, codigos: ["113-1"] }]);
    const porClave = Object.fromEntries(a.grupos.map((g) => [g.clave, g]));
    expect(porClave.guias.accion).toEqual(ACCION_GUIAS);
    expect(porClave.guias.accion.url).toBe("/admin?tab=loth-libro-operaciones&vista=gtf");
    expect(porClave.planes.accion).toEqual(ACCION_PLAN);
    expect(porClave.planes.titulo).toBe("Plan PO PO-01: no tiene la vigencia cargada");
    expect(a.whatsapp).toContain("GTF 001-0045678");
    expect(a.whatsapp).toContain("Inversiones Agroforestales Blas");
    expect(a.whatsapp).toContain("15 días calendario");
  });

  it("un despacho vencido es HIGH y encabeza; su acción abre Despacho de trozas", () => {
    const a = construirAvisoTh(
      { ...vacio, gtfs: [gtf("001-C", "2026-09-10T00:00:00.000Z")], planes: [plan("p", { vigenciaHasta: "2026-12-01T00:00:00.000Z" })] },
      AHORA,
    );
    expect(a.severidad).toBe("HIGH");
    expect(a.grupos[0].clave).toBe("despachos");
    expect(a.grupos[0].accion).toEqual(ACCION_DESPACHO);
    expect(a.grupos[0].accion.url).toBe("/admin?tab=loth-libro-operaciones&vista=secciones&seccion=despacho_troza");
    expect(a.titulo).toBe("1 despacho sin asentar, fuera de plazo, en el Libro TH");
  });

  it("un plan vencido encabeza aunque haya despachos vencidos", () => {
    const a = construirAvisoTh(
      { ...vacio, gtfs: [gtf("001-C", "2026-09-10T00:00:00.000Z")], planes: [plan("p", { planNumber: "9", vigenciaHasta: "2026-09-20T00:00:00.000Z" })] },
      AHORA,
    );
    expect(a.grupos.map((g) => g.clave)).toEqual(["planes", "despachos"]);
    expect(a.titulo).toBe("Plan PO 9: venció hace 10 días");
  });

  it("libro al día: no avisa", () => {
    const a = construirAvisoTh(
      { ...vacio, planes: [plan("t", { vigenciaHasta: "2028-03-20T00:00:00.000Z" })] },
      AHORA,
    );
    expect(a.hayQueAvisar).toBe(false);
    expect(a.grupos).toEqual([]);
  });
});
