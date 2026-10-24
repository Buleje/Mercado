/**
 * «Un anexo por tipo» y «el cuadre como candado» (Brandon, 2026-10-03).
 *
 *  · Partir: cada parte un solo tipo (o especie), Σ piezas/PT/m³ = el anexo
 *    entero, y cada parte imprime los mismos bloques que tenía en el entero.
 *  · El PDF de varios: cada anexo empieza en hoja nueva (se cuentan páginas
 *    con el mismo constructor que descarga, sin guardar nada).
 *  · Candado: la frase del cuadre sale del cuadre REAL de una distribución
 *    (`cuadrarReparto`), y sólo «difiere» frena.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04, DATOS_ANEXO04_DEFAULT } from "@/lib/forestal/anexo04-serfor";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { formatoCantidad } from "@/lib/forestal/anexo04-vista";
import { nombrePdfPartido, partirAnexo } from "@/lib/forestal/anexo04-partir";
import { construirDocDeVarios } from "@/lib/forestal/anexo04-pdf";
import { cuadreDelPapel, cuadreFrena, difCorta } from "@/lib/forestal/cuadre-del-papel";
import { cuadrarReparto } from "@/lib/forestal/reparto-cuadre";
import { distribuirPorCapacidad, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie, ...cubicarPieza(dims) };
}

/* Comercial (2×8×10, 2×6×10), Larga angosta (2×4×10, 3×3×12), Tabla (1×6×10). */
const LOTE: PiezaCubicada[] = [
  pieza(40, 2, 8, 10, "Tornillo"),
  pieza(30, 2, 6, 10, "Cumala"),
  pieza(20, 2, 4, 10, "Tornillo"),
  pieza(3, 3, 3, 12, "Cumala"),
  pieza(12, 1, 6, 10, "Tornillo"),
  pieza(5, 2, 8, 10, "Tornillo"),
];
const DATOS = { unidadV: "pt" as const, modo: "oficial" as const };

describe("partirAnexo por tipo", () => {
  const partes = partirAnexo(LOTE, "tipo");

  it("cada parte lleva un solo tipo, en el orden canónico", () => {
    expect(partes.map((p) => p.clave)).toEqual(["Comercial", "Tabla", "Larga angosta"]);
    for (const p of partes) expect(new Set(p.piezas.map((r) => tipoDePieza(r)))).toEqual(new Set([p.clave]));
  });

  it("Σ piezas, PT y m³ de las partes = el anexo entero (cada fila en una sola parte)", () => {
    const entero = construirAnexo04(LOTE, DATOS);
    const anexos = partes.map((p) => construirAnexo04(p.piezas, DATOS));
    expect(partes.reduce((a, p) => a + p.piezas.length, 0)).toBe(LOTE.length);
    expect(anexos.reduce((a, x) => a + x.totalPiezas, 0)).toBe(entero.totalPiezas);
    expect(partes.reduce((a, p) => a + p.totalPiezas, 0)).toBe(entero.totalPiezas);
    /* PT y m³ del papel: cada anexo redondea su total una vez (2 y 3 decimales). */
    expect(Math.abs(anexos.reduce((a, x) => a + x.totalPt, 0) - entero.totalPt)).toBeLessThanOrEqual(0.005 * partes.length);
    expect(Math.abs(anexos.reduce((a, x) => a + x.totalM3, 0) - entero.totalM3)).toBeLessThanOrEqual(0.0005 * partes.length);
    /* Lo crudo cuadra exacto. */
    const m3Lote = LOTE.reduce((a, r) => a + r.m3, 0);
    expect(Math.abs(partes.reduce((a, p) => a + p.totalM3, 0) - m3Lote)).toBeLessThan(1e-9 + 0.0001 * partes.length);
  });

  it("no corta ningún bloque: los subtotales impresos son los mismos que en el entero", () => {
    const sub = (x: ReturnType<typeof construirAnexo04>) =>
      x.hojas.flatMap((h) => h.bloques.map((b) => `${b.especie}|${b.tipo}|${b.subtotal}`)).sort();
    const entero = construirAnexo04(LOTE, DATOS);
    const juntos = partes.flatMap((p) => sub(construirAnexo04(p.piezas, DATOS))).sort();
    expect(juntos).toEqual(sub(entero));
  });

  it("respeta el formato: con «Sumada» parte las filas ya sumadas", () => {
    const sumadas = formatoCantidad(LOTE, "sumada");
    const ps = partirAnexo(sumadas, "tipo");
    const comercial = ps.find((p) => p.clave === "Comercial")!;
    /* 40 + 5 de Tornillo 2×8×10 en una línea, 30 de Cumala en otra. */
    expect(comercial.piezas.map((r) => r.cantidad).sort((a, b) => a - b)).toEqual([30, 45]);
    expect(ps.reduce((a, p) => a + p.totalPiezas, 0)).toBe(110);
  });
});

describe("partirAnexo por especie", () => {
  it("una parte por especie, en el orden del lote, con la especie global para las sin especie", () => {
    const ps = partirAnexo([...LOTE, pieza(2, 2, 8, 10)], "especie", "Shihuahuaco");
    expect(ps.map((p) => p.rotulo)).toEqual(["Tornillo", "Cumala", "Shihuahuaco"]);
    expect(ps.reduce((a, p) => a + p.totalPiezas, 0)).toBe(112);
  });
});

describe("el PDF de varios anexos", () => {
  it("cada anexo empieza en hoja nueva y la trasera va una vez al final", async () => {
    const partes = partirAnexo(LOTE, "tipo");
    const datos = { ...DATOS_ANEXO04_DEFAULT, ...DATOS };
    const sinTrasera = await construirDocDeVarios(partes.map((p) => ({ piezas: p.piezas, datos })));
    /* 3 tipos × 1 hoja cada uno (< 4 bloques, < 35 filas). */
    expect(sinTrasera!.getNumberOfPages()).toBe(3);
    const conTrasera = await construirDocDeVarios(partes.map((p, i) => ({
      piezas: p.piezas, datos, trasera: i === partes.length - 1 ? { piezas: LOTE, anchoM: 2.4 } : null,
    })));
    expect(conTrasera!.getNumberOfPages()).toBe(4);
  });

  it("nombre identificable por GTF", () => {
    expect(nombrePdfPartido("tipo", "0012 345", "2026-10-03")).toBe("anexos-04-por-tipo-0012345-2026-10-03.pdf");
    expect(nombrePdfPartido("especie", "", "2026-10-03")).toBe("anexos-04-por-especie-2026-10-03.pdf");
  });
});

// ─── Candado del cuadre ─────────────────────────────────────────────────────

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: `GTF ${o.id}`, especie: "Tornillo", m3: 5, origen: "manual", costoM3: null, aprovechablePct: 55, ...o,
});
const REP = [pieza(40, 2, 8, 10, "Tornillo"), pieza(20, 2, 4, 10, "Tornillo"), pieza(30, 2, 6, 10, "Cumala")];
const BLOQUES = [
  bloque({ id: "b1", m3: 4, permiso: "CON-25-UCA-0142" }),
  bloque({ id: "b2", especie: "Cumala", m3: 1, permiso: "CON-25-UCA-0207" }),
];

describe("cuadreDelPapel", () => {
  it("un reparto sano (aun con falta) no frena", () => {
    const c = cuadreDelPapel(cuadrarReparto({ dist: distribuirPorCapacidad(BLOQUES, REP, "tipo"), piezas: REP }));
    expect(c?.estado).not.toBe("difiere");
    expect(cuadreFrena(c)).toBe(false);
  });

  it("un m³ escrito a mano descuadra: frena, cita cuánto, dónde y abre en el control peor", () => {
    const dist: Distribucion = structuredClone(distribuirPorCapacidad(BLOQUES, REP, "tipo"));
    const b = dist.especies.flatMap((e) => e.bloques).find((x) => x.bloque.id === "b1")!;
    b.asignado[0].m3 += 0.242;
    b.asignado[0].m3Declarado = true;
    b.usadoM3 += 0.242;
    dist.totales.amparadaM3 += 0.242;
    dist.especies.find((e) => e.especie === "Tornillo")!.amparadaM3 += 0.242;
    const c = cuadreDelPapel(cuadrarReparto({ dist, piezas: REP }))!;
    expect(c.estado).toBe("difiere");
    expect(cuadreFrena(c)).toBe(true);
    expect(c.frase).toMatch(/^No cuadra por 0[.,]242 m³ · /);
    expect(c.frase).toMatch(/· GTF b1/);
    expect(c.lineas![0]).toMatch(/^GTF b1 \(0[.,]242 m³\): /);
    expect(c.lineas!.length).toBeLessThanOrEqual(5);
    expect(c.control).toBeTruthy();
  });

  it("sin controles no hay nada que frenar; redondeo no frena", () => {
    expect(cuadreDelPapel(null)).toBeNull();
    expect(cuadreFrena({ estado: "redondeo" })).toBe(false);
    expect(cuadreFrena(null)).toBe(false);
  });

  it("difCorta cita piezas antes que m³ y m³ antes que PT", () => {
    expect(difCorta({ piezas: -1, pt: 3, m3: 0.2 })).toBe("−1 pzas");
    expect(difCorta({ piezas: 0, pt: 3, m3: 0.242 })).toMatch(/^0[.,]242 m³$/);
    expect(difCorta({ piezas: 0, pt: 0.4, m3: 0 })).toMatch(/^0[.,]40 PT$/);
  });
});
