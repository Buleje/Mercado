/**
 * ADR-474 — código único de troza por guía (Brandon 07-10-2026: «en el mismo
 * permiso en plantación los códigos de trozas vienen y son lo mismo pero con
 * diferente guía y eso confunde»).
 *
 * La troza cuyo código ya SALIÓ con OTRA guía del MISMO permiso se propone como
 * `12A (0000002)` (estado `renombrada`), se exige confirmada, y los papeles
 * (hoja SERFOR, lista de trozas) siguen imprimiendo el código de la guía.
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  arbolDeCodificacion,
  arbolesParaTrazar,
  codigoUnicoDeGuia,
  codigosDeLaGuia,
  codigosParaRevisar,
  estadoDeLaRevision,
  observacionTrozado,
  renombresSinConfirmar,
  revisarGuia,
  vistaPreviaDeTanda,
  type DestinoDeLaGuia,
  type GuiaParaRevisar,
  type LibroDeLaGuia,
  type LineaDelLibro,
} from "@/lib/forestal/loth-importar-guia";
import { pedidoImportarSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { lineasDeGtf, listasTrozasDe, type LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { lineasDeLaGuia, listaDeTrozas, piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { leerItemsGuiaTh } from "@/lib/forestal/guia-th-al-ctp";
import { esTrozadoDeLaImportacion } from "@/lib/forestal/loth-importar-guia-deshacer";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;
/** GTF 010-001-0000014 · PMFI 10-HUA-PUE/PER-FMP-2026-007 · 186A, 186B, 62B, 62C, 85B. */
const G14 = "1-10-0474633";
const ficha = (): GtfSerfor => structuredClone(FICHAS[G14]);
/** La «siguiente» guía del MISMO permiso, con los MISMOS códigos (plantación de Blas). */
const ficha15 = (): GtfSerfor => ({ ...ficha(), gtfNumber: "010-001-0000015", numeroRegistro: "1-10-0474634" });

const PLAN_ID = "plan-fmp";
const LIBRO_VACIO: LibroDeLaGuia = { trozados: [], talas: [], salidas: [], guias: [], cierres: [] };
const destino: DestinoDeLaGuia = { planId: PLAN_ID, nuevo: false, plantacion: true, especies: [], nombre: "REG-PLT de prueba" };
const trozado = (p: Partial<LineaDelLibro>): LineaDelLibro => ({
  id: `l-${Math.random()}`,
  lineNo: 3,
  section: "trozado",
  planId: PLAN_ID,
  treeCode: "62",
  trozaCode: "62B",
  speciesCommon: "Tornillo",
  speciesScientific: null,
  diamMayorM: 0.6,
  diamMenorM: 0.5,
  lengthM: 3,
  volumeM3: 0.8,
  fecha: "2026-09-01",
  referencial: null,
  ...p,
});
/** El libro con 62B trozada en `planId` y despachada con la guía `gtf`. */
const libroCon62B = (gtf: string | null, planId = PLAN_ID, section: "despacho_troza" | "consumo_troza" = "despacho_troza"): LibroDeLaGuia => ({
  ...LIBRO_VACIO,
  trozados: [trozado({ planId })],
  salidas: [{ trozaCode: "62B", section, lineNo: 7, gtfNumber: gtf }],
});

describe("el código único", () => {
  it("código + correlativo de la guía, como lo escribe SERFOR; el árbol sigue siendo el mismo", () => {
    expect(codigoUnicoDeGuia("12A", "019-001-0000002")).toBe("12A (0000002)");
    expect(codigoUnicoDeGuia("12A", "19-001-2")).toBe("12A (0000002)");
    expect(codigoUnicoDeGuia("12A", "019-001-0000002", true)).toBe("12A (019-001-0000002)");
    expect(arbolDeCodificacion("12A (0000002)")).toBe("12");
    expect(arbolDeCodificacion("173-D (0000008)")).toBe("173");
  });

  it("la trazabilidad (QR) deriva el árbol también del código único con guion, sin perder la regla vieja", () => {
    expect(arbolesParaTrazar("12-A (0000002)")).toEqual(["12"]);
    expect(arbolesParaTrazar("186A (0000002)")[0]).toBe("186");
    expect(arbolesParaTrazar("85-TOR-A")).toEqual(["85-TOR"]);
    /* Lo que la regla vieja del guion ya encontraba sigue entrando. */
    expect(arbolesParaTrazar("85-1")).toContain("85");
    expect(arbolesParaTrazar("85-TOR")).toEqual(["85-TOR", "85"]);
  });

  it("la revisión pide al libro también los códigos que propondría", () => {
    expect(codigosParaRevisar(ficha())).toEqual(expect.arrayContaining(["62B", "62B (0000014)", "62B (010-001-0000014)"]));
  });
});

describe("la revisión", () => {
  it("ya salió con OTRA guía del MISMO permiso → renombrada (no choca), con aviso", () => {
    const rev = revisarGuia(ficha(), destino, libroCon62B("010-001-0000009"), { verificada: true });
    const t = rev.trozas.find((x) => x.codificacionGuia === "62B");
    expect(t).toMatchObject({ estado: "renombrada", trozaCode: "62B (0000014)", treeCode: "62" });
    expect(t?.detalle).toMatch(/ya salió con la GTF 010-001-0000009/);
    expect(rev.avisos.find((a) => a.codigo === "troza_renombrada")).toMatchObject({ nivel: "atencion" });
    expect(rev.avisos.some((a) => a.codigo === "conflicto_troza")).toBe(false);
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("lista");
  });

  it("de OTRO permiso: sigue chocando como hoy", () => {
    const rev = revisarGuia(ficha(), destino, libroCon62B("010-001-0000009", "otro-plan"), { verificada: true });
    expect(rev.trozas.find((x) => x.codificacionGuia === "62B")).toMatchObject({ estado: "conflicto", trozaCode: "62B" });
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("bloqueada");
  });

  it("la MISMA guía (mismo N°), un consumo o una salida sin guía: choque", () => {
    for (const libro of [
      libroCon62B("10-1-14"),
      libroCon62B("010-001-0000009", PLAN_ID, "consumo_troza"),
      libroCon62B(null),
    ]) {
      const rev = revisarGuia(ficha(), destino, libro, { verificada: true });
      expect(rev.trozas.find((x) => x.codificacionGuia === "62B")?.estado).toBe("conflicto");
    }
  });

  it("dos veces el mismo código en la guía sigue siendo error", () => {
    const g = ficha();
    g.trozas = [...(g.trozas ?? []), { ...(g.trozas ?? [])[0] }];
    const rev = revisarGuia(g, destino, LIBRO_VACIO, { verificada: true });
    expect(rev.trozas.filter((x) => x.estado === "conflicto").map((x) => x.trozaCode)).toEqual(["186A", "186A"]);
  });

  it("si el código corto ya está tomado usa el N° entero; si los dos, choca", () => {
    const corto = { ...libroCon62B("010-001-0000009"), trozados: [trozado({}), trozado({ trozaCode: "62B (0000014)" })] };
    expect(revisarGuia(ficha(), destino, corto, { verificada: true }).trozas.find((x) => x.codificacionGuia === "62B")?.trozaCode).toBe(
      "62B (010-001-0000014)",
    );
    const ambos = { ...corto, trozados: [...corto.trozados, trozado({ trozaCode: "62B (010-001-0000014)" })] };
    expect(revisarGuia(ficha(), destino, ambos, { verificada: true }).trozas.find((x) => x.codificacionGuia === "62B")?.estado).toBe(
      "conflicto",
    );
  });

  it("la guía YA importada con renombres se ve ya_trozada con su código único, sin sumar otra vez a la tala", () => {
    const libro = {
      trozados: [trozado({ id: "62B" }), trozado({ id: "62B (0000015)", trozaCode: "62B (0000015)", speciesCommon: "Ana Caspi" })],
      talas: [
        trozado({
          id: "tala62",
          section: "tala",
          trozaCode: null,
          volumeM3: 1.6,
          referencial: { gtfs: ["010-001-0000014", "010-001-0000015"], registros: [], trozas: ["62B", "62B (0000015)"] },
        }),
      ],
      salidas: [
        { trozaCode: "62B", section: "despacho_troza", lineNo: 7, gtfNumber: "010-001-0000014" },
        { trozaCode: "62B (0000015)", section: "despacho_troza", lineNo: 9, gtfNumber: "010-001-0000015" },
      ],
      guias: [{ id: "g15", gtfNumber: "010-001-0000015", status: "emitida", titularName: ficha15().titular, tituloHabilitante: ficha15().numeroTitulo, planId: PLAN_ID, observations: null }],
      cierres: [],
    } as unknown as LibroDeLaGuia;
    const rev = revisarGuia(ficha15(), destino, libro, { verificada: true });
    expect(rev.yaImportada).not.toBeNull();
    const t62 = rev.trozas.find((t) => t.codificacionGuia === "62B");
    expect(t62).toMatchObject({ estado: "ya_trozada", trozaCode: "62B (0000015)" });
    expect(rev.avisos.some((a) => a.codigo === "troza_renombrada")).toBe(false);
    const tala = rev.talas.find((x) => x.treeCode === "62");
    expect(tala?.trozas.filter((c) => c === "62B (0000015)")).toHaveLength(1);
  });

  it("la renombrada entra como nueva en la tala referencial de su árbol", () => {
    const pmfi = { ...destino, plantacion: false };
    const libro = {
      ...libroCon62B("010-001-0000009"),
      talas: [trozado({ section: "tala", trozaCode: null, volumeM3: 0.8, lineNo: 2, referencial: { gtfs: ["010-001-0000009"], registros: [], trozas: ["62B"] } })],
    };
    const tala = revisarGuia(ficha(), pmfi, libro, { verificada: true }).talas.find((x) => x.treeCode === "62");
    expect(tala).toMatchObject({ estado: "ampliar" });
    expect(tala?.trozas).toEqual(expect.arrayContaining(["62B", "62B (0000014)", "62C"]));
  });
});

describe("la tanda: dos guías del mismo permiso que repiten los códigos", () => {
  const entrada = (g: GtfSerfor, clave: string): GuiaParaRevisar => ({
    clave,
    fuente: { tipo: "serfor", numeroRegistro: g.numeroRegistro ?? "" },
    ficha: g,
    verificada: true,
    falla: null,
    planElegido: null,
  });

  it("la 2.ª sale lista con TODAS sus trozas renombradas a «(0000015)», y la tala del árbol se amplía", () => {
    const out = vistaPreviaDeTanda([entrada(ficha15(), "b"), entrada(ficha(), "a")], {
      planes: [],
      contratos: [],
      libro: LIBRO_VACIO,
      bajoDmc: new Map(),
    });
    expect(out.map((x) => x.estado)).toEqual(["lista", "lista"]);
    expect(out[1].trozas.every((t) => t.estado === "nueva")).toBe(true);
    expect(out[0].trozas.map((t) => [t.codificacionGuia, t.trozaCode, t.estado])).toEqual([
      ["186A", "186A (0000015)", "renombrada"],
      ["186B", "186B (0000015)", "renombrada"],
      ["62B", "62B (0000015)", "renombrada"],
      ["62C", "62C (0000015)", "renombrada"],
      ["85B", "85B (0000015)", "renombrada"],
    ]);
    expect(out[0].talas.find((t) => t.treeCode === "186")).toMatchObject({ estado: "ampliar" });
    expect(out[0].base?.avanzaLibro).toBe(true);
  });
});

describe("la confirmación y lo que se guarda", () => {
  const rev = () => revisarGuia(ficha(), destino, libroCon62B("010-001-0000009"), { verificada: true });

  it("sin confirmar cada renombrada, la importación la rechaza", () => {
    expect(renombresSinConfirmar(rev().trozas, undefined)).toEqual(["62B (0000014)"]);
    expect(renombresSinConfirmar(rev().trozas, ["otro"])).toEqual(["62B (0000014)"]);
    expect(renombresSinConfirmar(rev().trozas, [" 62B (0000014) "])).toEqual([]);
  });

  it("items[].codigoGuia sólo de las renombradas; la observación dice el código de la guía", () => {
    const r = rev();
    expect([...codigosDeLaGuia(r.trozas)]).toEqual([["62B (0000014)", "62B"]]);
    const t = r.trozas.find((x) => x.estado === "renombrada");
    const obs = t ? observacionTrozado(t, "010-001-0000014", G14) : "";
    expect(obs).toMatch(/En la guía: «62B»/);
    // «Deshacer la importación» la reconoce como suya (medido 07-10: sin esto quedaban vivas).
    expect(esTrozadoDeLaImportacion(obs, "010-001-0000014", G14)).toBe(true);
    expect(esTrozadoDeLaImportacion(obs, "010-001-0000015", G14)).toBe(false);
  });

  it("el pedido acepta los renombres confirmados", () => {
    const item = {
      fuente: { tipo: "serfor", numeroRegistro: G14 },
      planDestino: { tipo: "existente", planId: PLAN_ID },
      crearTala: false,
      confirmaRenombres: ["62B (0000014)"],
    };
    const p = pedidoImportarSchema.safeParse({ items: [item] });
    expect(p.success && p.data.items[0].confirmaRenombres).toEqual(["62B (0000014)"]);
  });
});

describe("los papeles imprimen el código de la guía", () => {
  const items = [
    { code: "62B (0000014)", codigoGuia: "62B", treeCode: "62", species: "Tornillo", volumeM3: 0.8, trozadoId: "tz-1" },
    { code: "62C", treeCode: "62", species: "Tornillo", volumeM3: 0.5 },
  ];

  it("hoja SERFOR: casillero (35) y la presentación del (37)", () => {
    const doc = { items, tipo: "trozas", volumenTotalM3: 1.3 } as unknown as LothGtfDoc;
    expect(listasTrozasDe(doc)).toBe("62B, 62C");
    expect(lineasDeGtf(doc).map((l) => l.presentacion)).toEqual(["62B", "62C"]);
  });

  it("lista de trozas imprime «62B»; lo que ata líneas del libro sigue usando el código único", () => {
    const piezas = piezasDeItems(items);
    expect(piezas[0]).toMatchObject({ codigo: "62B (0000014)", codigoGuia: "62B" });
    expect(listaDeTrozas(piezas).map((f) => f.codificacion)).toEqual(["62B", "62C"]);
    const lineas = [
      { trozaCode: "62B", planId: PLAN_ID },
      { trozaCode: "62B (0000014)", planId: PLAN_ID },
      { trozaCode: "62C", planId: PLAN_ID },
    ];
    expect(lineasDeLaGuia({ items, planId: PLAN_ID, titularName: null }, lineas, { otrasConElNumero: 1 }).map((l) => l.trozaCode)).toEqual([
      "62B (0000014)",
      "62C",
    ]);
  });

  it("el pase al CTP lee codigoGuia pero guarda el código único (sin falso «ya está en tu libro»)", () => {
    const [a, b] = leerItemsGuiaTh(items);
    expect(a).toMatchObject({ code: "62B (0000014)", codigoGuia: "62B", trozadoId: "tz-1" });
    expect(b.codigoGuia).toBeNull();
  });
});
