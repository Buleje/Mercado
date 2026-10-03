/**
 * El ANEXO N° 04 contra el resumen por especie y tipo (Brandon, 2026-10-03):
 * «una tabla comparativa de lo que está en resumen tipo especie de la tabla vs
 * lo que está en ese modal, para ver la diferencia o si es exacto».
 *
 * Los dos lados salen de lugares distintos y por eso pueden no coincidir:
 *  · **Resumen**: las piezas que entraron al modal, agrupadas por especie ×
 *    tipo como «Por especie y tipo» de Resúmenes — piezas, el PT de cada fila
 *    tal como lo guardó el cubicador (redondeado a 2 decimales) y su m³.
 *  · **Anexo**: lo que IMPRIME la hoja — las filas editadas en «Editar
 *    medidas», el dueño elegido, el origen elegido, y el redondeo del papel
 *    (PT exacto por fila, subtotal a 3 decimales por bloque, sumando los
 *    bloques de continuación como los sumaría alguien con el papel en la mano).
 *
 * Tolerancias en la unidad del negocio (regla `verificacion-de-verdad` §4):
 * 0,01 PT y 0,001 m³. Lo que se pasa de eso pero cabe en el redondeo
 * conocido (el cubicador redondea el PT de CADA fila; la hoja suma el exacto)
 * es «Redondeo», no «Difiere»: siete rojos falsos enseñan a ignorar la lista.
 */
import type { PiezaCubicada } from "./cubicacion";
import { m3ExactoDePieza, m3OficialDeFila, ptExactoDePieza } from "./gtf-redondeo";
import { construirAnexo04, type UnidadVolumen } from "./anexo04-serfor";
import { ORDEN_TIPO, ordenTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";

export const TOLERANCIA_COMPARAR = { pt: 0.01, m3: 0.001 } as const;

/** Lo que el cubicador pierde por fila al guardar el PT con 2 decimales. */
const REDONDEO_PT_FILA = 0.005;
/** Lo que la hoja pierde por bloque al imprimir el subtotal con 3 decimales. */
const REDONDEO_BLOQUE = 0.0005;

export interface LadoComparado {
  piezas: number;
  pt: number;
  m3: number;
  /** Filas (medidas) que aportan: en el papel, renglones impresos. */
  filas: number;
}

export type EstadoComparado = "exacto" | "redondeo" | "difiere";

export interface FilaComparada {
  clave: string;
  especie: string;
  tipo: string;
  /** `null` = esa especie·tipo no está en el resumen. */
  resumen: LadoComparado | null;
  /** `null` = no llegó al papel (otro dueño, otra cubicación, medidas cambiadas de tipo). */
  anexo: LadoComparado | null;
  /** Anexo − resumen, con signo. */
  dif: { piezas: number; pt: number; m3: number };
  estado: EstadoComparado;
  /** Dónde cae en el papel, un rótulo por bloque impreso: «Hoja 1 · bloque 2». */
  ubicacion: string[];
}

export interface ComparacionAnexo {
  filas: FilaComparada[];
  total: FilaComparada;
  exactas: number;
  redondeo: number;
  difieren: number;
  /** La unidad en que la hoja imprime la columna (10) V. */
  unidadImpresa: UnidadVolumen;
  /** (3) VOLUMEN TOTAL que imprime la hoja. */
  totalImpresoM3: number;
  /** El (3) declarado a mano, si lo hay (`null` = se imprime el calculado). */
  totalDeclaradoM3: number | null;
}

interface Acumulado {
  especie: string;
  tipo: string;
  lado: LadoComparado;
  orden: number;
  bloques: number;
  ubicacion: string[];
}

const vacio = (): LadoComparado => ({ piezas: 0, pt: 0, m3: 0, filas: 0 });
const norma = (s: string) => s.trim().toUpperCase();
const clave = (especie: string, tipo: string) => `${norma(especie)}||${norma(tipo)}`;

/** Compara en micro-unidades enteras: «≤ 0,01» sin el ruido del float. */
const dentro = (d: number, tol: number) => Math.round(Math.abs(d) * 1e6) <= Math.round(tol * 1e6);

/** El tipo con su escritura de siempre («Paquetería larga»), aunque el papel lo imprima en mayúscula. */
const tipoLegible = (t: string): string => ORDEN_TIPO.find((o) => norma(o) === norma(t)) ?? t;

function estadoDe(
  resumen: LadoComparado | null,
  anexo: LadoComparado | null,
  dif: FilaComparada["dif"],
  bloques: number,
): EstadoComparado {
  if (!resumen || !anexo || dif.piezas !== 0) return "difiere";
  if (dentro(dif.pt, TOLERANCIA_COMPARAR.pt) && dentro(dif.m3, TOLERANCIA_COMPARAR.m3)) return "exacto";
  const cotaPt = Math.max(TOLERANCIA_COMPARAR.pt, REDONDEO_PT_FILA * resumen.filas + REDONDEO_BLOQUE * bloques);
  const cotaM3 = Math.max(TOLERANCIA_COMPARAR.m3, REDONDEO_BLOQUE * bloques);
  return dentro(dif.pt, cotaPt) && dentro(dif.m3, cotaM3) ? "redondeo" : "difiere";
}

function comparada(
  k: string,
  especie: string,
  tipo: string,
  resumen: LadoComparado | null,
  anexo: LadoComparado | null,
  bloques: number,
  ubicacion: string[],
): FilaComparada {
  const r = resumen ?? vacio();
  const a = anexo ?? vacio();
  const dif = { piezas: a.piezas - r.piezas, pt: a.pt - r.pt, m3: a.m3 - r.m3 };
  return { clave: k, especie, tipo, resumen, anexo, dif, estado: estadoDe(resumen, anexo, dif, bloques), ubicacion };
}

/**
 * Agrupa por especie × tipo con las MISMAS reglas que el papel: la especie de
 * la pieza o la del lote (`especieGlobal`), y el tipo de `tipoDePieza`.
 */
function agruparReferencia(rows: readonly PiezaCubicada[], especieGlobal?: string): Map<string, Acumulado> {
  const out = new Map<string, Acumulado>();
  const exactos = new Map<string, PiezaCubicada[]>();
  for (const r of rows) {
    const especie = r.especie?.trim() || especieGlobal?.trim() || "Sin especie";
    const tipo: TipoComercial = tipoDePieza(r);
    const k = clave(especie, tipo);
    const g = out.get(k) ?? { especie, tipo, lado: vacio(), orden: out.size, bloques: 0, ubicacion: [] };
    g.lado.piezas += r.cantidad;
    g.lado.filas += 1;
    (exactos.get(k) ?? exactos.set(k, []).get(k)!).push(r);
    out.set(k, g);
  }
  /* Cada especie × tipo es una fila de la GTF, como en la tabla «Por especie y
     tipo» de Resúmenes (`resumenPorEspecie`): suma EXACTA de sus piezas desde
     las medidas, redondeada UNA vez (regla de la GTF, 2026-10-03). */
  for (const [k, g] of out) {
    const piezas = exactos.get(k) ?? [];
    g.lado.pt = m3OficialDeFila(piezas.map(ptExactoDePieza));
    g.lado.m3 = m3OficialDeFila(piezas.map(m3ExactoDePieza));
  }
  return out;
}

/**
 * Lo que imprime la hoja, por especie × tipo. Se arma en las DOS unidades
 * porque el papel imprime sólo una en la columna (10) V: la otra es lo que
 * imprimiría si se cambia la unidad, con el mismo redondeo.
 */
function agruparAnexo(filas: PiezaCubicada[], opts: { especieGlobal?: string; totalManualM3?: number | null }) {
  const enPt = construirAnexo04(filas, { unidadV: "pt", modo: "oficial" }, opts);
  const enM3 = construirAnexo04(filas, { unidadV: "m3", modo: "oficial" }, opts);
  const out = new Map<string, Acumulado>();
  enPt.hojas.forEach((hoja, h) => {
    hoja.bloques.forEach((b, i) => {
      const k = clave(b.especie, b.tipo);
      const g = out.get(k) ?? { especie: b.especie, tipo: tipoLegible(b.tipo), lado: vacio(), orden: out.size, bloques: 0, ubicacion: [] };
      g.lado.piezas += b.filas.reduce((a, f) => a + f.cantidad, 0);
      g.lado.pt += b.subtotal;
      g.lado.m3 += enM3.hojas[h]?.bloques[i]?.subtotal ?? 0;
      g.lado.filas += b.filas.length;
      g.bloques += 1;
      g.ubicacion.push(`Hoja ${h + 1} · bloque ${i + 1}`);
      out.set(k, g);
    });
  });
  return { grupos: out, totalImpresoM3: enM3.totalM3 };
}

/**
 * Compara el papel con el resumen. `referencia` = las piezas del resumen (por
 * defecto, las que entraron al modal); `filasAnexo` = las que van a la hoja.
 */
export function compararAnexoConResumen(input: {
  filasAnexo: PiezaCubicada[];
  referencia: readonly PiezaCubicada[];
  unidadImpresa: UnidadVolumen;
  especieGlobal?: string;
  totalManualM3?: number | null;
}): ComparacionAnexo {
  const { filasAnexo, referencia, unidadImpresa, especieGlobal, totalManualM3 } = input;
  const ref = agruparReferencia(referencia, especieGlobal);
  const { grupos: anx, totalImpresoM3 } = agruparAnexo(filasAnexo, { especieGlobal, totalManualM3 });

  const filas: FilaComparada[] = [];
  /* En el orden del papel: es lo que se tiene al lado para cotejar. Lo que
     el papel no trae va al final, en el orden del resumen. */
  for (const [k, a] of anx) {
    const r = ref.get(k);
    filas.push(comparada(k, r?.especie ?? a.especie, a.tipo, r?.lado ?? null, a.lado, a.bloques, a.ubicacion));
  }
  const soloResumen = [...ref.entries()]
    .filter(([k]) => !anx.has(k))
    .sort(([, x], [, y]) => x.orden - y.orden || ordenTipo(x.tipo as TipoComercial) - ordenTipo(y.tipo as TipoComercial));
  for (const [k, r] of soloResumen) filas.push(comparada(k, r.especie, r.tipo, r.lado, null, 0, []));

  const suma = (lado: "resumen" | "anexo"): LadoComparado =>
    filas.reduce((acc, f) => {
      const l = f[lado];
      if (!l) return acc;
      return { piezas: acc.piezas + l.piezas, pt: acc.pt + l.pt, m3: acc.m3 + l.m3, filas: acc.filas + l.filas };
    }, vacio());
  const bloquesTotales = [...anx.values()].reduce((a, g) => a + g.bloques, 0);
  const total = comparada(
    "total", "Total", "",
    referencia.length > 0 ? suma("resumen") : null,
    filasAnexo.length > 0 ? suma("anexo") : null,
    bloquesTotales, [],
  );

  const manual = totalManualM3 != null && Number.isFinite(totalManualM3) && totalManualM3 >= 0 && filasAnexo.length > 0;
  return {
    filas,
    total,
    exactas: filas.filter((f) => f.estado === "exacto").length,
    redondeo: filas.filter((f) => f.estado === "redondeo").length,
    difieren: filas.filter((f) => f.estado === "difiere").length,
    unidadImpresa,
    totalImpresoM3,
    totalDeclaradoM3: manual ? totalImpresoM3 : null,
  };
}
