/**
 * ADR-477 (reemplaza §2 de ADR-474) — código único de troza SIEMPRE por guía
 * (Brandon 08-10-2026): toda troza que entra al Libro TH desde una guía lleva
 * `<código en la guía>-<correlativo corto>` («62B-0014»), aunque no se repita.
 *
 * La casilla de ADR-474 sigue: si el código DE LA GUÍA ya salió con OTRA guía
 * del MISMO permiso, la troza entra `renombrada` y se exige confirmada (si
 * fuera la misma troza física, OSINFOR vería su volumen dos veces). Los
 * papeles (hoja SERFOR, lista de trozas) siguen imprimiendo el de la guía.
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  arbolDeCodificacion,
  arbolesParaTrazar,
  codigosDeLaGuia,
  codigosParaRevisar,
  estadoDeLaRevision,
  observacionTrozado,
  prefijosParaRevisar,
  renombresSinConfirmar,
  revisarGuia,
  trozasDeLaGuia,
  vistaPreviaDeTanda,
  type DestinoDeLaGuia,
  type GuiaParaRevisar,
  type LibroDeLaGuia,
  type LineaDelLibro,
  type SalidaDelLibro,
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
  /* La especie de 62B en la guía de Blas: si no, la línea choca por especie. */
  speciesCommon: "Ana Caspi",
  speciesScientific: null,
  diamMayorM: 0.6,
  diamMenorM: 0.5,
  lengthM: 3,
  volumeM3: 0.8,
  fecha: "2026-09-01",
  referencial: null,
  ...p,
});
const salida = (trozaCode: string, gtfNumber: string | null, section: SalidaDelLibro["section"] = "despacho_troza"): SalidaDelLibro => ({
  trozaCode,
  section,
  lineNo: 7,
  gtfNumber,
});
/** El libro con 62B (con el código `code`) trozada en `planId` y despachada con la guía `gtf`. */
const libroCon62B = (gtf: string | null, opts: { planId?: string; code?: string; section?: SalidaDelLibro["section"] } = {}): LibroDeLaGuia => ({
  ...LIBRO_VACIO,
  trozados: [trozado({ planId: opts.planId ?? PLAN_ID, trozaCode: opts.code ?? "62B" })],
  salidas: [salida(opts.code ?? "62B", gtf, opts.section)],
});
const t62B = (l: LibroDeLaGuia, g = ficha()) => revisarGuia(g, destino, l, { verificada: true }).trozas.find((x) => x.codificacionGuia === "62B");

describe("el árbol y la trazabilidad quitan el sufijo", () => {
  it("«12A-0001» es del árbol 12; el formato viejo de ADR-474 se sigue leyendo", () => {
    expect(arbolDeCodificacion("12A-0001")).toBe("12");
    expect(arbolDeCodificacion("12-A-019/0001")).toBe("12");
    expect(arbolDeCodificacion("173-D-0008")).toBe("173");
    expect(arbolDeCodificacion("12A (0000002)")).toBe("12");
    expect(arbolDeCodificacion("85-TOR-A")).toBe("85-TOR");
  });

  it("el QR deriva el árbol del código único, sin perder la regla vieja del guion", () => {
    expect(arbolesParaTrazar("12A-0001")[0]).toBe("12");
    expect(arbolesParaTrazar("1-0001")).toEqual(["1"]);
    expect(arbolesParaTrazar("12-A (0000002)")).toEqual(["12"]);
    expect(arbolesParaTrazar("85-TOR-A")).toEqual(["85-TOR"]);
    expect(arbolesParaTrazar("85-1")).toContain("85");
  });

  it("la revisión pide al libro los únicos que daría y los de otras guías con el mismo código", () => {
    expect(codigosParaRevisar(ficha())).toEqual(expect.arrayContaining(["62B", "62B-0014", "62B-010/0014", "62B-010-001/0014"]));
    expect(prefijosParaRevisar(ficha())).toEqual(["186A", "186B", "62B", "62C", "85B"]);
  });
});

describe("la revisión", () => {
  it("1.ª guía: TODAS entran con su código único, sin casilla", () => {
    const rev = revisarGuia(ficha(), destino, LIBRO_VACIO, { verificada: true });
    expect(rev.trozas.map((t) => [t.codificacionGuia, t.trozaCode, t.estado, t.treeCode])).toEqual([
      ["186A", "186A-0014", "nueva", "186"],
      ["186B", "186B-0014", "nueva", "186"],
      ["62B", "62B-0014", "nueva", "62"],
      ["62C", "62C-0014", "nueva", "62"],
      ["85B", "85B-0014", "nueva", "85"],
    ]);
    expect(rev.avisos.some((a) => a.codigo === "troza_renombrada")).toBe(false);
    expect(renombresSinConfirmar(rev.trozas, [])).toEqual([]);
  });

  it("2.ª guía del MISMO permiso que repite el código (ya con sufijo) → renombrada con casilla", () => {
    const t = t62B(libroCon62B("010-001-0000014", { code: "62B-0014" }), ficha15());
    expect(t).toMatchObject({ estado: "renombrada", trozaCode: "62B-0015", treeCode: "62", repiteGuia: "010-001-0000014" });
    expect(t?.detalle).toMatch(/ya salió con la GTF 010-001-0000014/);
    const rev = revisarGuia(ficha15(), destino, libroCon62B("010-001-0000014", { code: "62B-0014" }), { verificada: true });
    expect(rev.avisos.find((a) => a.codigo === "troza_renombrada")).toMatchObject({ nivel: "atencion" });
    expect(renombresSinConfirmar(rev.trozas, [])).toEqual(["62B-0015"]);
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("lista");
  });

  it("también si la anterior entró con el código crudo (importada antes de ADR-477)", () => {
    expect(t62B(libroCon62B("010-001-0000009"))).toMatchObject({ estado: "renombrada", trozaCode: "62B-0014" });
  });

  it("dos talonarios con el mismo correlativo → nivel 2 «62B-010/0014»; nivel 3; todo tomado → choque", () => {
    const tomado = (...codes: string[]): LibroDeLaGuia => ({ ...LIBRO_VACIO, trozados: codes.map((c) => trozado({ trozaCode: c })), salidas: codes.map((c) => salida(c, "020-001-0000014")) });
    expect(t62B(tomado("62B-0014"))).toMatchObject({ trozaCode: "62B-010/0014", estado: "renombrada" });
    expect(t62B(tomado("62B-0014", "62B-010/0014"))).toMatchObject({ trozaCode: "62B-010-001/0014" });
    const todo = t62B(tomado("62B-0014", "62B-010/0014", "62B-010-001/0014"));
    expect(todo?.estado).toBe("conflicto");
    expect(todo?.detalle).toMatch(/no tiene código único libre/);
  });

  it("de OTRO permiso (crudo o con sufijo): sigue chocando como hoy", () => {
    expect(t62B(libroCon62B("010-001-0000009", { planId: "otro-plan" }))).toMatchObject({ estado: "conflicto", trozaCode: "62B" });
    expect(t62B(libroCon62B("010-001-0000009", { planId: "otro-plan", code: "62B-0009" }))?.estado).toBe("conflicto");
  });

  it("un consumo o una salida sin N° del código crudo: choque", () => {
    expect(t62B(libroCon62B("010-001-0000009", { section: "consumo_troza" }))?.estado).toBe("conflicto");
    expect(t62B(libroCon62B(null))?.estado).toBe("conflicto");
  });

  it("troza registrada A MANO en el permiso, sin salida → ya_trozada con su código (no se renombra: puede tener etiqueta)", () => {
    const t = t62B({ ...LIBRO_VACIO, trozados: [trozado({})] });
    expect(t).toMatchObject({ estado: "ya_trozada", trozaCode: "62B" });
  });

  it("guía VIEJA ya importada con el código crudo → ya_trozada sobre esa línea", () => {
    const libro: LibroDeLaGuia = {
      ...libroCon62B("010-001-0000014"),
      guias: [{ id: "g14", gtfNumber: "010-001-0000014", status: "emitida", titularName: ficha().titular, tituloHabilitante: ficha().numeroTitulo, planId: PLAN_ID, observations: null }],
    };
    const rev = revisarGuia(ficha(), destino, libro, { verificada: true });
    expect(rev.yaImportada).not.toBeNull();
    expect(rev.trozas.find((x) => x.codificacionGuia === "62B")).toMatchObject({ estado: "ya_trozada", trozaCode: "62B" });
  });

  it("guía NUEVA ya importada → ya_trozada con su código único, sin sumar otra vez a la tala", () => {
    const libro = {
      trozados: [trozado({ id: "62B-0014", trozaCode: "62B-0014" }), trozado({ id: "62B-0015", trozaCode: "62B-0015", speciesCommon: "Ana Caspi" })],
      talas: [
        trozado({
          id: "tala62",
          section: "tala",
          trozaCode: null,
          volumeM3: 1.6,
          referencial: { gtfs: ["010-001-0000014", "010-001-0000015"], registros: [], trozas: ["62B-0014", "62B-0015"] },
        }),
      ],
      salidas: [salida("62B-0014", "010-001-0000014"), salida("62B-0015", "010-001-0000015")],
      guias: [{ id: "g15", gtfNumber: "010-001-0000015", status: "emitida", titularName: ficha15().titular, tituloHabilitante: ficha15().numeroTitulo, planId: PLAN_ID, observations: null }],
      cierres: [],
    } as unknown as LibroDeLaGuia;
    const rev = revisarGuia(ficha15(), destino, libro, { verificada: true });
    expect(rev.yaImportada).not.toBeNull();
    expect(rev.trozas.find((t) => t.codificacionGuia === "62B")).toMatchObject({ estado: "ya_trozada", trozaCode: "62B-0015" });
    expect(rev.avisos.some((a) => a.codigo === "troza_renombrada")).toBe(false);
    expect(rev.talas.find((x) => x.treeCode === "62")?.trozas.filter((c) => c === "62B-0015")).toHaveLength(1);
  });

  it("dos veces el mismo código en la guía sigue siendo error", () => {
    const g = ficha();
    g.trozas = [...(g.trozas ?? []), { ...(g.trozas ?? [])[0] }];
    const rev = revisarGuia(g, destino, LIBRO_VACIO, { verificada: true });
    expect(rev.trozas.filter((x) => x.estado === "conflicto").map((x) => x.trozaCode)).toEqual(["186A", "186A"]);
  });

  it("la renombrada entra como nueva en la tala referencial de su árbol", () => {
    const pmfi = { ...destino, plantacion: false };
    const libro = {
      ...libroCon62B("010-001-0000009"),
      talas: [trozado({ section: "tala", trozaCode: null, volumeM3: 0.8, lineNo: 2, referencial: { gtfs: ["010-001-0000009"], registros: [], trozas: ["62B"] } })],
    };
    const tala = revisarGuia(ficha(), pmfi, libro, { verificada: true }).talas.find((x) => x.treeCode === "62");
    expect(tala).toMatchObject({ estado: "ampliar" });
    expect(tala?.trozas).toEqual(expect.arrayContaining(["62B", "62B-0014", "62C-0014"]));
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

  it("la 1.ª sale «nueva» con «-0014»; la 2.ª «renombrada» con «-0015», y la tala del árbol se amplía", () => {
    const out = vistaPreviaDeTanda([entrada(ficha15(), "b"), entrada(ficha(), "a")], {
      planes: [],
      contratos: [],
      libro: LIBRO_VACIO,
      bajoDmc: new Map(),
    });
    expect(out.map((x) => x.estado)).toEqual(["lista", "lista"]);
    expect(out[1].trozas.map((t) => [t.trozaCode, t.estado])).toEqual([
      ["186A-0014", "nueva"],
      ["186B-0014", "nueva"],
      ["62B-0014", "nueva"],
      ["62C-0014", "nueva"],
      ["85B-0014", "nueva"],
    ]);
    expect(out[0].trozas.map((t) => [t.codificacionGuia, t.trozaCode, t.estado])).toEqual([
      ["186A", "186A-0015", "renombrada"],
      ["186B", "186B-0015", "renombrada"],
      ["62B", "62B-0015", "renombrada"],
      ["62C", "62C-0015", "renombrada"],
      ["85B", "85B-0015", "renombrada"],
    ]);
    expect(out[0].talas.find((t) => t.treeCode === "186")).toMatchObject({ estado: "ampliar" });
    expect(out[0].base?.avanzaLibro).toBe(true);
  });
});

describe("la confirmación y lo que se guarda", () => {
  const rev = () => revisarGuia(ficha(), destino, libroCon62B("010-001-0000009"), { verificada: true });

  it("sin confirmar cada renombrada, la importación la rechaza", () => {
    expect(renombresSinConfirmar(rev().trozas, undefined)).toEqual(["62B-0014"]);
    expect(renombresSinConfirmar(rev().trozas, ["otro"])).toEqual(["62B-0014"]);
    expect(renombresSinConfirmar(rev().trozas, [" 62B-0014 "])).toEqual([]);
  });

  it("items[].codigoGuia de TODAS las que cambian de código; las sin código no llevan", () => {
    const r = rev();
    expect([...codigosDeLaGuia(r.trozas)]).toEqual([
      ["186A-0014", "186A"],
      ["186B-0014", "186B"],
      ["62B-0014", "62B"],
      ["62C-0014", "62C"],
      ["85B-0014", "85B"],
    ]);
    expect([...codigosDeLaGuia([{ trozaCode: "SC-1-10-1-1", codificacionGuia: "-" }, { trozaCode: "62B", codificacionGuia: "62B" }])]).toEqual([]);
  });

  it("la observación no cambia: «Deshacer la importación» la reconoce igual que antes", () => {
    for (const t of rev().trozas) {
      const obs = observacionTrozado(t, "010-001-0000014", G14);
      expect(esTrozadoDeLaImportacion(obs, "010-001-0000014", G14)).toBe(true);
      expect(esTrozadoDeLaImportacion(obs, "010-001-0000015", G14)).toBe(false);
    }
    expect(observacionTrozado({ sinCodigo: false, estado: "nueva" }, "010-001-0000014", G14)).toBe("Importada de la GTF 010-001-0000014 (registro SERFOR 1-10-0474633).");
  });

  it("el pedido acepta los renombres confirmados", () => {
    const item = {
      fuente: { tipo: "serfor", numeroRegistro: G14 },
      planDestino: { tipo: "existente", planId: PLAN_ID },
      crearTala: false,
      confirmaRenombres: ["62B-0014"],
    };
    const p = pedidoImportarSchema.safeParse({ items: [item] });
    expect(p.success && p.data.items[0].confirmaRenombres).toEqual(["62B-0014"]);
  });
});

describe("los papeles imprimen el código de la guía", () => {
  const items = [
    { code: "62B-0014", codigoGuia: "62B", treeCode: "62", species: "Tornillo", volumeM3: 0.8, trozadoId: "tz-1" },
    { code: "62C", treeCode: "62", species: "Tornillo", volumeM3: 0.5 },
  ];

  it("hoja SERFOR: casillero (35) y la presentación del (37)", () => {
    const doc = { items, tipo: "trozas", volumenTotalM3: 1.3 } as unknown as LothGtfDoc;
    expect(listasTrozasDe(doc)).toBe("62B, 62C");
    expect(lineasDeGtf(doc).map((l) => l.presentacion)).toEqual(["62B", "62C"]);
  });

  it("lista de trozas imprime «62B»; lo que ata líneas del libro sigue usando el código único", () => {
    const piezas = piezasDeItems(items);
    expect(piezas[0]).toMatchObject({ codigo: "62B-0014", codigoGuia: "62B" });
    expect(listaDeTrozas(piezas).map((f) => f.codificacion)).toEqual(["62B", "62C"]);
    const lineas = [
      { trozaCode: "62B", planId: PLAN_ID },
      { trozaCode: "62B-0014", planId: PLAN_ID },
      { trozaCode: "62C", planId: PLAN_ID },
    ];
    expect(lineasDeLaGuia({ items, planId: PLAN_ID, titularName: null }, lineas, { otrasConElNumero: 1 }).map((l) => l.trozaCode)).toEqual([
      "62B-0014",
      "62C",
    ]);
  });

  it("el pase al CTP lee codigoGuia pero guarda el código único (sin falso «ya está en tu libro»)", () => {
    const [a, b] = leerItemsGuiaTh(items);
    expect(a).toMatchObject({ code: "62B-0014", codigoGuia: "62B", trozadoId: "tz-1" });
    expect(b.codigoGuia).toBeNull();
  });
});

describe("revisión de ADR-477 (hallazgos del reviewer)", () => {
  it("anulada y reemitida: «62B-0014» volvió al stock → ya_trozada con su código, sin sumar otra vez a la tala", () => {
    const pmfi = { ...destino, plantacion: false };
    const libro: LibroDeLaGuia = {
      ...LIBRO_VACIO,
      trozados: [trozado({ trozaCode: "62B-0014" })],
      talas: [trozado({ section: "tala", trozaCode: null, volumeM3: 0.8, lineNo: 2, referencial: { gtfs: ["010-001-0000014"], registros: [], trozas: ["62B-0014"] } })],
    };
    expect(t62B({ ...LIBRO_VACIO, trozados: [trozado({ trozaCode: "62B-0014" })] }, ficha15())).toMatchObject({ estado: "ya_trozada", trozaCode: "62B-0014" });
    const rev = revisarGuia(ficha15(), pmfi, libro, { verificada: true });
    expect(rev.trozas.find((t) => t.codificacionGuia === "62B")).toMatchObject({ estado: "ya_trozada", trozaCode: "62B-0014" });
    expect(rev.talas.find((x) => x.treeCode === "62")?.trozas.filter((c) => c.startsWith("62B"))).toEqual(["62B-0014"]);
    expect(renombresSinConfirmar(rev.trozas, [])).toEqual([]);
  });

  it("la misma guía anulada y vuelta a importar con su N° → ya_trozada, no «62B-010/0014»", () => {
    const libro: LibroDeLaGuia = {
      ...LIBRO_VACIO,
      trozados: [trozado({ trozaCode: "62B-0014" })],
      guias: [{ id: "g14", gtfNumber: "010-001-0000014", status: "anulada", titularName: ficha().titular, tituloHabilitante: ficha().numeroTitulo, planId: PLAN_ID, observations: null }],
    };
    expect(t62B(libro)).toMatchObject({ estado: "ya_trozada", trozaCode: "62B-0014" });
  });

  it("dos en stock con el mismo código de guía → renombrada con casilla; otro árbol u otra salida viva no cuentan", () => {
    const dos = t62B({ ...LIBRO_VACIO, trozados: [trozado({ trozaCode: "62B-0009" }), trozado({ trozaCode: "62B-0012" })] }, ficha15());
    expect(dos).toMatchObject({ estado: "renombrada", trozaCode: "62B-0015" });
    expect(dos?.detalle).toMatch(/sin salida/);
    expect(t62B({ ...LIBRO_VACIO, trozados: [trozado({ trozaCode: "62B-0014", treeCode: "99" })] }, ficha15())).toMatchObject({ estado: "nueva", trozaCode: "62B-0015" });
    expect(t62B({ ...LIBRO_VACIO, trozados: [trozado({ trozaCode: "62B-0014" })], salidas: [salida("62B-0014", null, "consumo_troza")] }, ficha15())?.estado).toBe("nueva");
  });

  it("el árbol de la GUÍA sale del código crudo: «P1-0234» y «P1-0235» son dos árboles", () => {
    expect(arbolDeCodificacion("P1-0234", { crudo: true })).toBe("P1-0234");
    expect(arbolDeCodificacion("P1-0234")).toBe("P1");
    const g = ficha();
    g.gtfNumber = "010-001-0000234";
    g.trozas = [{ ...(g.trozas ?? [])[0], codificacion: "P1-0234" }, { ...(g.trozas ?? [])[0], codificacion: "P1-0235" }];
    expect(trozasDeLaGuia(g).map((t) => t.treeCode)).toEqual(["P1-0234", "P1-0235"]);
  });

  it("un N° sin correlativo de 4 a 7 dígitos → choque, no entra con el código crudo", () => {
    for (const numero of ["010-001-ABC", "010-001-12345678"]) {
      const t = t62B(LIBRO_VACIO, { ...ficha(), gtfNumber: numero });
      expect(t).toMatchObject({ estado: "conflicto", trozaCode: "62B" });
      expect(t?.detalle).toMatch(/no da un correlativo/);
    }
  });
});
