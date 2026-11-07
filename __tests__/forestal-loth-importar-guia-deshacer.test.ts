/**
 * ADR-461 §12 — «Deshacer la importación» (las reglas PURAS) y los arreglos de
 * la revisión del 02-10: el aviso sin «línea #0», el tope de N° de registro por
 * pedido, la caché de SERFOR que no guarda 10 min un «no encontrada».
 *
 * Las trozas son las REALES de Blas (`forestal-loth-importar-guia.fichas-blas.json`):
 * el árbol 173 viene en dos guías (173-A/B/C en la GTF 7, 173-D en la 8).
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  llavePlanNuevo,
  medidasDeTala,
  notaPlanImportado,
  observacionGuia,
  observacionTrozado,
  queLinea,
  trozasDeLaGuia,
  vistaPreviaDeTanda,
  type GuiaParaRevisar,
  type PiezaDeTala,
} from "@/lib/forestal/loth-importar-guia";
import {
  accionSobreTala,
  bajaDelPlan,
  esPlanDeImportacion,
  esTrozadoDeLaImportacion,
  importacionDeLaGuia,
} from "@/lib/forestal/loth-importar-guia-deshacer";
import { pedidoDeshacerSchema, pedidoVistaPreviaSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { IMPORTAR_SERFOR_POR_PEDIDO } from "@/lib/forestal/loth-importar-guia-tipos";
import { vigenciaEnCache } from "@/lib/forestal/serfor-gtf-fetch";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;
const ficha = (registro: string): GtfSerfor => structuredClone(FICHAS[registro]);
const G07 = "1-10-0473187"; // GTF 010-001-0000007 · 161-C, 173-A, 173-B, 173-C
const G08 = "1-10-0473188"; // GTF 010-001-0000008 · 173-D, 189-B, 226-A, 243-A, 243-B
const G14 = "1-10-0474633"; // GTF 010-001-0000014 · 186A, 186B, 62B, 62C, 85B
const G01FMC = "1-19-0300920"; // GTF 019-0000001 · DEMA · 84/A…, 85/A…D

/** Las trozas del árbol en una guía, como piezas de su tala. */
const piezasDe = (registro: string, arbol: string): PiezaDeTala[] =>
  trozasDeLaGuia(ficha(registro))
    .filter((t) => t.treeCode === arbol)
    .map((t) => ({ code: t.trozaCode, d1: t.diamMayorM, d2: t.diamMenorM, l: t.lengthM, v: t.volumeM3 }));

describe("qué asentó la importación", () => {
  it("la guía: sólo la observación exacta del importador, con o sin registro, de SERFOR o de una foto", () => {
    expect(importacionDeLaGuia(observacionGuia("1-19-0313629", true))).toEqual({ registro: "1-19-0313629", verificada: true });
    expect(importacionDeLaGuia(observacionGuia("1-10-0474633", false))).toEqual({ registro: "1-10-0474633", verificada: false });
    expect(importacionDeLaGuia(observacionGuia("", true))).toEqual({ registro: null, verificada: true });
    // La de la GTF 019-0000003 que quedó viva en `main` (02-10).
    expect(importacionDeLaGuia("Importada al Libro TH desde SERFOR · registro SERFOR 1-19-0313629 (ADR-461).")?.registro).toBe("1-19-0313629");
    // Una guía del TH normal, o una observación que sólo se parece, NO es importada.
    expect(importacionDeLaGuia(null)).toBeNull();
    expect(importacionDeLaGuia("Despacho a la planta de Pucallpa")).toBeNull();
    expect(importacionDeLaGuia("Importada al Libro TH desde SERFOR (ADR-461). Y algo más")).toBeNull();
    expect(importacionDeLaGuia("Importada al Libro TH desde mi casa (ADR-461).")).toBeNull();
  });

  it("los trozados: el de la importación de ESTA guía, no el de otra ni uno editado", () => {
    const obs = observacionTrozado({ sinCodigo: false }, "019-0000003", "1-19-0313629");
    expect(esTrozadoDeLaImportacion(obs, "019-0000003", "1-19-0313629")).toBe(true);
    expect(esTrozadoDeLaImportacion(observacionTrozado({ sinCodigo: true }, "019-0000003", "1-19-0313629"), "019-0000003", "1-19-0313629")).toBe(true);
    expect(esTrozadoDeLaImportacion(obs, "019-0000004", "1-19-0313629")).toBe(false);
    expect(esTrozadoDeLaImportacion(`${obs} corregido`, "019-0000003", "1-19-0313629")).toBe(false);
    expect(esTrozadoDeLaImportacion(null, "019-0000003", null)).toBe(false);
  });

  it("el plan: el que creó una importación (cualquiera), por su nota", () => {
    expect(esPlanDeImportacion(notaPlanImportado("019-0000003", "1-19-0313629"))).toBe(true);
    expect(esPlanDeImportacion(notaPlanImportado("019-0000003", ""))).toBe(true);
    expect(esPlanDeImportacion("Plan cargado a mano")).toBe(false);
    expect(esPlanDeImportacion(null)).toBe(false);
  });
});

describe("la tala referencial al deshacer (árbol 173 en dos guías)", () => {
  const A_B_C = piezasDe(G07, "173");
  const D = piezasDe(G08, "173");
  const ref = (gtfs: string[]) => ({ gtfs, registros: [G07, G08].slice(0, gtfs.length), trozas: [...A_B_C, ...D].map((p) => p.code) });

  it("las piezas reales: 173-A/B/C en la 7 y 173-D en la 8", () => {
    expect(A_B_C.map((p) => p.code)).toEqual(["173-A", "173-B", "173-C"]);
    expect(D.map((p) => p.code)).toEqual(["173-D"]);
  });

  it("deshacer la 8: la tala se REDUCE a lo de la 7 (lo mismo que arma la 7 sola)", () => {
    const acc = accionSobreTala(ref(["010-001-0000007", "010-001-0000008"]), "010-001-0000008", G08, A_B_C);
    expect(acc.accion).toBe("reducir");
    if (acc.accion !== "reducir") return;
    expect(acc.medidas).toEqual(medidasDeTala(A_B_C));
    expect(acc.medidas.volumeM3).toBeCloseTo(16.404, 3);
    expect(acc.otrasGuias).toEqual(["010-001-0000007"]);
    expect(acc.marca.referencial).toEqual({ gtfs: ["010-001-0000007"], registros: [G07], trozas: ["173-A", "173-B", "173-C"] });
    expect(acc.observacion).toContain("GTF 010-001-0000007");
    expect(acc.observacion).not.toContain("0000008");
  });

  it("deshacer la 7 (la que la creó): queda con la 173-D de la 8", () => {
    const acc = accionSobreTala(ref(["010-001-0000007", "010-001-0000008"]), "010-001-0000007", G07, D);
    expect(acc).toMatchObject({ accion: "reducir", otrasGuias: ["010-001-0000008"] });
    if (acc.accion === "reducir") expect(acc.medidas.volumeM3).toBeCloseTo(D[0].v ?? 0, 4);
  });

  it("la armó sólo esta guía → se anula; el N° se compara tramo a tramo (19-001-7 ≡ 019-001-0000007)", () => {
    expect(accionSobreTala(ref(["010-001-0000007"]), "10-001-7", G07, [])).toEqual({ accion: "anular" });
    // Aunque el árbol tenga trozas de ANTES de importar (la tala las incluyó): antes no tenía tala, vuelve a no tenerla.
    expect(accionSobreTala(ref(["010-001-0000007"]), "010-001-0000007", G07, D)).toEqual({ accion: "anular" });
    // Otra guía la sostiene, pero sus trozas ya no están vivas: tampoco queda.
    expect(accionSobreTala(ref(["010-001-0000007", "010-001-0000008"]), "010-001-0000007", G07, [])).toEqual({ accion: "anular" });
  });

  it("una tala medida en campo, o que no cita esta guía, NO se toca", () => {
    expect(accionSobreTala(null, "010-001-0000007", G07, A_B_C)).toEqual({ accion: "dejar" });
    expect(accionSobreTala(ref(["010-001-0000008"]), "010-001-0000007", G07, D)).toEqual({ accion: "dejar" });
  });
});

describe("el permiso al deshacer", () => {
  const vacio = { lineasVivas: 0, guiasVigentes: 0, especies: 0, censo: 0, permisos: 0 };
  const creado = { notes: notaPlanImportado("019-0000003", "1-19-0313629"), deletedAt: null };

  it("lo creó la importación y queda vacío → baja", () => {
    expect(bajaDelPlan(creado, vacio)).toMatchObject({ baja: true });
  });

  it("con lo que alguien le cargó después, o creado a mano, o ya de baja → queda y se dice por qué", () => {
    expect(bajaDelPlan(creado, { ...vacio, especies: 3 })).toEqual({ baja: false, motivo: expect.stringContaining("3 especie(s) cargadas") });
    expect(bajaDelPlan(creado, { ...vacio, lineasVivas: 2, guiasVigentes: 1 }).baja).toBe(false);
    expect(bajaDelPlan({ notes: "PO1 de Brandon", deletedAt: null }, vacio).baja).toBe(false);
    expect(bajaDelPlan({ ...creado, deletedAt: new Date() }, vacio)).toMatchObject({ baja: false, motivo: expect.stringContaining("ya estaba") });
  });
});

describe("los avisos nombran la línea real, nunca «línea #0»", () => {
  it("queLinea: el N° si existe; si no, la guía de la tanda; si no, «una tala ya registrada»", () => {
    expect(queLinea({ lineNo: 12 }, "tala")).toBe("línea #12");
    expect(queLinea({ lineNo: 0, gtfNumber: "019-0000001" }, "tala")).toBe("la de la GTF 019-0000001, en esta tanda");
    expect(queLinea({ lineNo: 0, referencial: { gtfs: ["010-001-0000007"] } }, "tala")).toBe("la de la GTF 010-001-0000007, en esta tanda");
    expect(queLinea({ lineNo: 0 }, "tala")).toBe("una tala ya registrada");
    expect(queLinea({ lineNo: null }, "trozado")).toBe("un trozado ya registrado");
  });

  it("tanda real (DEMA 019-0000001 + PMFI 0000014, árbol 85 en los dos): el choque nombra la guía, no «#0»", () => {
    const entrada = (registro: string): GuiaParaRevisar => ({
      clave: `ficha:${registro}`,
      fuente: { tipo: "serfor", numeroRegistro: registro },
      ficha: ficha(registro),
      verificada: true,
      falla: null,
      planElegido: null,
    });
    const out = vistaPreviaDeTanda([entrada(G14), entrada(G01FMC)], {
      planes: [],
      contratos: [],
      libro: { trozados: [], talas: [], salidas: [], guias: [], cierres: [] },
      bajoDmc: new Map(),
    });
    const textos = out.flatMap((g) => [...g.avisos.map((a) => a.mensaje), ...g.talas.map((t) => t.detalle ?? ""), ...g.trozas.map((t) => t.detalle ?? "")]);
    expect(textos.some((t) => t.includes("#0"))).toBe(false);
    const choque = out.find((g) => g.guia?.gtfNumber === "010-001-0000014")?.talas.find((t) => t.treeCode === "85");
    expect(choque?.detalle).toContain("la de la GTF 019-0000001, en esta tanda");
    // El permiso que la 0000014 crearía es otro que el del DEMA.
    expect(llavePlanNuevo(ficha(G14))).not.toBe(llavePlanNuevo(ficha(G01FMC)));
  });
});

describe("pedidos", () => {
  const serfor = (n: number) => Array.from({ length: n }, (_, i) => ({ tipo: "serfor" as const, numeroRegistro: `1-10-${String(474600 + i).padStart(7, "0")}` }));

  it(`vista previa: hasta ${IMPORTAR_SERFOR_POR_PEDIDO} N° de registro por pedido (las recibidas no cuentan)`, () => {
    expect(pedidoVistaPreviaSchema.safeParse({ fuentes: serfor(IMPORTAR_SERFOR_POR_PEDIDO) }).success).toBe(true);
    const ctp = Array.from({ length: 15 }, (_, i) => ({ tipo: "ctp" as const, woodEntryId: `w${i}` }));
    expect(pedidoVistaPreviaSchema.safeParse({ fuentes: [...serfor(IMPORTAR_SERFOR_POR_PEDIDO), ...ctp] }).success).toBe(true);
    const r = pedidoVistaPreviaSchema.safeParse({ fuentes: serfor(IMPORTAR_SERFOR_POR_PEDIDO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("consulta a SERFOR");
  });

  it("deshacer: el motivo con letras de verdad (no espacios invisibles)", () => {
    expect(pedidoDeshacerSchema.safeParse({ gtfId: "g1", motivo: "se importó en otro permiso" }).success).toBe(true);
    expect(pedidoDeshacerSchema.safeParse({ gtfId: "g1", motivo: "​​​" }).success).toBe(false);
    expect(pedidoDeshacerSchema.safeParse({ gtfId: "", motivo: "error de carga" }).success).toBe(false);
  });
});

describe("caché de la consulta a SERFOR", () => {
  it("encontrada 10 min; «no encontrada» sólo 60 s; sin respuesta, nada", () => {
    expect(vigenciaEnCache("encontrada")).toBe(10 * 60 * 1000);
    expect(vigenciaEnCache("no_encontrada")).toBe(60 * 1000);
    expect(vigenciaEnCache("sin_respuesta")).toBe(0);
  });
});
