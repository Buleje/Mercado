import { describe, expect, it } from "vitest";
import {
  agruparBorrados,
  motivosGuardados,
  ORDEN_DE_RECUPERO,
  ordenarParaRecuperar,
  sinSuFuente,
  esLimpiezaDePruebas,
  type LineaBorradaDTO,
} from "@/lib/forestal/loth-papelera";
import type { LothSection } from "@/lib/forestal/loth-constants";

let n = 0;
const linea = (section: LothSection, lineNo: number, deletedAt: string, extra: Partial<LineaBorradaDTO> = {}): LineaBorradaDTO => ({
  id: `l${++n}`,
  section,
  lineNo,
  entryDate: "2026-10-01T00:00:00.000Z",
  deletedAt,
  status: "registrado",
  codigo: null,
  speciesCommon: null,
  volumeM3: 1,
  quantity: null,
  unit: null,
  gtfNumber: null,
  planId: null,
  ...extra,
});

describe("orden de recupero", () => {
  it("va de la fuente a la salida: tala → trozado → despacho de trozas", () => {
    const i = (s: LothSection) => ORDEN_DE_RECUPERO.indexOf(s);
    expect(i("tala")).toBe(0);
    expect(i("tala")).toBeLessThan(i("trozado"));
    expect(i("trozado")).toBeLessThan(i("despacho_troza"));
    expect(i("producto_terminado")).toBeLessThan(i("despacho_producto"));
  });

  it("ordena por sección y, dentro, por N° de línea", () => {
    const xs = [linea("despacho_troza", 3, "x"), linea("trozado", 9, "x"), linea("tala", 5, "x"), linea("trozado", 2, "x")];
    expect(ordenarParaRecuperar(xs).map((l) => `${l.section}:${l.lineNo}`)).toEqual([
      "tala:5",
      "trozado:2",
      "trozado:9",
      "despacho_troza:3",
    ]);
  });
});

describe("agruparBorrados", () => {
  // Lo medido en Blas: 07-10 09:34 y 09:35 (una sola limpieza) y 07-10 06:17 (otra).
  const lineas = [
    linea("despacho_troza", 30, "2026-10-07T14:34:10.000Z", { volumeM3: 0.5 }),
    linea("trozado", 20, "2026-10-07T14:35:40.000Z", { volumeM3: 0.25 }),
    linea("trozado", 21, "2026-10-07T14:35:41.000Z", { volumeM3: 0.25, status: "anulado" }),
    linea("tala", 4, "2026-10-07T11:17:00.000Z", { volumeM3: 8.2335 }),
  ];
  const eventos = [
    { createdAt: "2026-10-07T14:34:12.000Z", user: "blasadmin" },
    { createdAt: "2026-10-07T14:35:42.000Z", user: " blasadmin " },
    { createdAt: "2026-10-07T11:16:30.000Z", user: "qaadmin" },
    { createdAt: "2026-10-07T13:00:00.000Z", user: "otro" }, // fuera de toda ventana
  ];
  const grupos = agruparBorrados(lineas, eventos);

  it("junta borrados a ≤2 min y separa los que están lejos, el más reciente primero", () => {
    expect(grupos).toHaveLength(2);
    expect(grupos[0].lineas).toHaveLength(3);
    expect(grupos[0].desde).toBe("2026-10-07T14:34:10.000Z");
    expect(grupos[0].hasta).toBe("2026-10-07T14:35:41.000Z");
    expect(grupos[0].clave).toBe(grupos[0].hasta);
    expect(grupos[1].lineas.map((l) => l.section)).toEqual(["tala"]);
  });

  it("pone quién borró con la auditoría de esa ventana, sin repetir ni colar a otros", () => {
    expect(grupos[0].por).toBe("blasadmin");
    expect(grupos[1].por).toBe("qaadmin");
    expect(agruparBorrados(lineas)[0].por).toBeNull();
  });

  it("las anuladas cuentan como línea pero no suman m³", () => {
    const trozado = grupos[0].porSeccion.find((s) => s.section === "trozado");
    expect(trozado).toEqual({ section: "trozado", n: 2, m3: 0.25 });
    expect(grupos[0].m3).toBe(0.75);
    expect(grupos[0].porSeccion.map((s) => s.section)).toEqual(["trozado", "despacho_troza"]);
    expect(grupos[0].lineas.map((l) => l.lineNo)).toEqual([20, 21, 30]);
  });

  it("descarta una fecha de borrado inválida en vez de romper la lista", () => {
    expect(agruparBorrados([linea("tala", 1, "no-es-fecha")])).toEqual([]);
  });
});

describe("motivosGuardados", () => {
  it("saca la justificación DMC y el motivo de cupo con que se registró la tala", () => {
    const obs =
      "[Tala sobre el cupo: Shihuahuaco 112 % de lo aprobado (11,2 de 10 m³). Motivo: árbol caído por viento] [Tala bajo DMC justificada: fuste hueco] nota libre";
    expect(motivosGuardados(obs)).toEqual({ justificacionDmc: "fuste hueco", motivoSobreCupo: "árbol caído por viento" });
  });

  it("un motivo con corchetes adentro vuelve entero", () => {
    expect(motivosGuardados("[Tala bajo DMC justificada: caído [por viento] en la trocha]").justificacionDmc).toBe(
      "caído [por viento] en la trocha",
    );
  });

  it("sin marcas o vacío → null", () => {
    expect(motivosGuardados("solo una nota")).toEqual({ justificacionDmc: null, motivoSobreCupo: null });
    expect(motivosGuardados(null)).toEqual({ justificacionDmc: null, motivoSobreCupo: null });
  });
});

describe("sinSuFuente", () => {
  const trozados = [
    linea("trozado", 1, "x", { codigo: "A1-1" }),
    linea("trozado", 2, "x", { codigo: "B2-1" }),
    linea("trozado", 3, "x", { codigo: "c3-1" }),
  ];
  const arbol: Record<string, string> = { "A1-1": " a1 ", "B2-1": "B2", "c3-1": "C3" };
  const claveDe = (l: LineaBorradaDTO) => arbol[l.codigo ?? ""];

  it("la tala que no volvió arrastra a su trozado (sin importar espacios ni mayúsculas)", () => {
    expect(sinSuFuente(trozados, claveDe, new Set(["A1"]), new Set()).map((l) => l.lineNo)).toEqual([1]);
  });

  it("si el árbol ya tiene otra tala viva en el libro, el trozado vuelve", () => {
    expect(sinSuFuente(trozados, claveDe, new Set(["A1", "C3"]), new Set(["C3"])).map((l) => l.lineNo)).toEqual([1]);
  });

  it("sin código no se arrastra nada", () => {
    expect(sinSuFuente([linea("trozado", 9, "x")], () => null, new Set(["A1"]), new Set())).toEqual([]);
  });
});

describe("esLimpiezaDePruebas", () => {
  it("reconoce la limpieza de pruebas de Blas y no a un usuario común", () => {
    expect(esLimpiezaDePruebas("claude-limpieza-qa-2026-09-28")).toBe(true);
    expect(esLimpiezaDePruebas("blasadmin")).toBe(false);
    expect(esLimpiezaDePruebas("qaadmin")).toBe(false);
    expect(esLimpiezaDePruebas(null)).toBe(false);
  });
});
