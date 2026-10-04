/**
 * anexo04-resumen-papel — el «Resumen del papel» del ANEXO N° 04: lo que lleva
 * cada hoja impresa (tipo × especie, renglones, piezas, m³, PT) y el resumen
 * general, con el control de cuadre para compararlo con el papel y con el
 * LO-CTP de SERFOR (Brandon, 2026-10-03).
 *
 * No recalcula volúmenes: lee el `Anexo04` ya armado por `construirAnexo04`.
 *  · m³ de una fila = Σ de los `m3` de sus bloques (ya en milésimos oficiales).
 *  · Total de la hoja = `hoja.totalM3`; total del anexo = `anexo.totalM3`.
 *  · PT con el anexo en pie tablar = lo IMPRESO (Σ de los subtotales). Con el
 *    anexo en m³ el PT no está en el papel: se saca de las piezas
 *    (`ptExactoDeLinea`, sumado y redondeado UNA vez a 2 decimales por fila) y
 *    el resumen lo declara `derivado` — un derivado no se presenta como el dato.
 *  · Los totales suman filas ya redondeadas, con aritmética decimal exacta.
 */
import type { PiezaCubicada } from "./cubicacion";
import type { Anexo04, BloqueAnexo04 } from "./anexo04-serfor";
import { ptExactoDeLinea, sumaExacta } from "./gtf-redondeo";

export interface FilaResumenPapel {
  tipo: string;
  especie: string;
  /** Renglones (filas con medida) impresos. */ reg: number;
  piezas: number;
  m3: number;
  /** `null` si faltó alguna pieza para derivarlo (anexo en m³). */ pt: number | null;
}

export interface TotalResumenPapel {
  reg: number;
  piezas: number;
  m3: number;
  pt: number | null;
}

export interface HojaResumenPapel {
  /** 1-based. */ numero: number;
  filas: FilaResumenPapel[];
  /** Lo que suman las filas. */ suma: TotalResumenPapel;
  /** (3) VOLUMEN TOTAL impreso en esa hoja. */ totalImpresoM3: number;
}

export interface ControlCuadre {
  texto: string;
  unidad: "m3" | "piezas";
  esperado: number;
  obtenido: number;
  /** obtenido − esperado, a 3 decimales exactos. */ diferencia: number;
  cuadra: boolean;
}

export interface ResumenPapel {
  unidadV: Anexo04["unidadV"];
  /** El PT sale de las piezas (anexo en m³), no del papel. */ ptDerivado: boolean;
  decimalesPt: 2 | 3;
  hojas: HojaResumenPapel[];
  general: { filas: FilaResumenPapel[]; total: TotalResumenPapel };
  /** El (3) que se imprime en el anexo y el que salió de las piezas. */
  totalImpresoM3: number;
  totalCalculadoM3: number;
  controles: ControlCuadre[];
  cuadra: boolean;
}

const sumar = (vals: Iterable<number>, dec: number) => sumaExacta(vals).toDecimalPlaces(dec).toNumber();
const entero = (vals: Iterable<number>) => sumar(vals, 0);

/** Σ de renglones/piezas/m³/PT de una lista de filas ya redondeadas. */
function totalDe(filas: readonly FilaResumenPapel[], decPt: number): TotalResumenPapel {
  const pts = filas.map((f) => f.pt);
  return {
    reg: entero(filas.map((f) => f.reg)),
    piezas: entero(filas.map((f) => f.piezas)),
    m3: sumar(filas.map((f) => f.m3), 3),
    pt: pts.some((p) => p == null) ? null : sumar(pts as number[], decPt),
  };
}

/** Junta bloques de un mismo tipo × especie (dentro de una hoja o entre hojas). */
function filasPorTipoEspecie(
  bloques: readonly BloqueAnexo04[],
  unidadV: Anexo04["unidadV"],
  ptDeBloque: (b: BloqueAnexo04) => number[] | null,
): FilaResumenPapel[] {
  const grupos = new Map<string, BloqueAnexo04[]>();
  for (const b of bloques) {
    const k = `${b.tipo}||${b.especie}`;
    const g = grupos.get(k);
    if (g) g.push(b);
    else grupos.set(k, [b]);
  }
  return [...grupos.values()].map((bs) => {
    const exactos = bs.map(ptDeBloque);
    const pt =
      unidadV === "pt"
        ? sumar(bs.map((b) => b.subtotal), 3)
        : exactos.some((e) => e == null)
          ? null
          : sumaExacta(exactos.flat() as number[]).toDecimalPlaces(2).toNumber();
    return {
      tipo: bs[0].tipo,
      especie: bs[0].especie,
      reg: bs.reduce((a, b) => a + b.filas.length, 0),
      piezas: entero(bs.flatMap((b) => b.filas.map((f) => f.cantidad))),
      m3: sumar(bs.map((b) => b.m3), 3),
      pt,
    };
  });
}

/**
 * @param anexo  el `Anexo04` que se ve (mismas opciones: especie global, total a mano).
 * @param piezas las piezas de ese anexo: sólo hacen falta para el PT cuando va en m³.
 */
export function resumenDelPapel(anexo: Anexo04, piezas: readonly PiezaCubicada[] = []): ResumenPapel {
  const porId = new Map(piezas.map((p) => [p.id, p]));
  const ptDerivado = anexo.unidadV === "m3";
  const decimalesPt = ptDerivado ? 2 : 3;
  /* PT exacto de las piezas de un bloque; `null` si alguna no está. */
  const ptDeBloque = (b: BloqueAnexo04): number[] | null => {
    const xs: number[] = [];
    for (const f of b.filas) {
      const p = porId.get(f.id);
      if (!p) return null;
      xs.push(ptExactoDeLinea(p).toNumber());
    }
    return xs;
  };

  const hojas: HojaResumenPapel[] = anexo.hojas.map((h, i) => {
    const filas = filasPorTipoEspecie(h.bloques, anexo.unidadV, ptDeBloque);
    return { numero: i + 1, filas, suma: totalDe(filas, decimalesPt), totalImpresoM3: h.totalM3 };
  });

  const filasGenerales = filasPorTipoEspecie(anexo.hojas.flatMap((h) => h.bloques), anexo.unidadV, ptDeBloque);
  const total = totalDe(filasGenerales, decimalesPt);

  const ctl = (texto: string, esperado: number, obtenido: number, unidad: ControlCuadre["unidad"] = "m3"): ControlCuadre => {
    const diferencia = sumaExacta([obtenido, -esperado]).toDecimalPlaces(3).toNumber();
    return { texto, unidad, esperado, obtenido, diferencia, cuadra: diferencia === 0 };
  };
  const controles: ControlCuadre[] = [
    ...hojas.map((h) => ctl(`Hoja ${h.numero}: Suma de sus filas = total impreso en la hoja`, h.totalImpresoM3, h.suma.m3)),
    ctl("Suma de los totales de las hojas = total del anexo", anexo.totalM3, sumar(hojas.map((h) => h.totalImpresoM3), 3)),
    ctl("Suma de las filas del resumen general = total del anexo", anexo.totalM3, total.m3),
    ctl("Piezas del resumen general = piezas del anexo", anexo.totalPiezas, total.piezas, "piezas"),
  ];
  /* Con un total declarado a mano, el del papel ya no es el de las piezas: se dice. */
  if (anexo.totalM3 !== anexo.totalCalculadoM3) {
    controles.push(ctl("Total declarado a mano = total calculado de las piezas", anexo.totalCalculadoM3, anexo.totalM3));
  }

  return {
    unidadV: anexo.unidadV, ptDerivado, decimalesPt, hojas,
    general: { filas: filasGenerales, total },
    totalImpresoM3: anexo.totalM3, totalCalculadoM3: anexo.totalCalculadoM3,
    controles, cuadra: controles.every((c) => c.cuadra),
  };
}
