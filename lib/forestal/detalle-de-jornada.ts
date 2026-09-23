/**
 * Las jornadas de la tira de días, y el detalle de UN día de producción.
 *
 * Pedido de Brandon (2026-09-14): *«en el día del registro… al pasar el mouse
 * o tener un ícono de cada día se pueda ver un menú del detalle, así flotante,
 * de dueño, especies, clasificación y demás detalles»*.
 *
 * El casillero dice CUÁNTO se produjo ese día (PT, m³, piezas). Eso alcanza
 * para ver que el día ya se cargó, pero no para saber si lo que se va a cargar
 * es lo mismo: dos corridas de tornillo comercial del mismo lote se leen como
 * la misma jornada; una de tercero en paquetería corta, no. El detalle es el
 * que responde esa pregunta sin abrir el resumen.
 *
 * Criterios (los mismos de `ForestCtpDB.resumenDeJornadas`, para que el panel
 * y el resumen que abre digan lo mismo):
 *  · el m³ sólo se suma si el asiento está en m³ — convertir otra unidad a ojo
 *    inventaría la producción del día;
 *  · las especies se juntan por `claveEspecie`: «TORNILLO» y «Tornillo» son una;
 *  · lo declarado que los paquetes no detallan tiene su renglón (L1 permite
 *    `Σ paquetes ≤ quantity`): sin él, las clasificaciones suman menos que el día;
 *  · «sin trozas vinculadas» es `corridaSinOrigen`, la regla de Consumos.
 *
 * PURO y client-safe: lo arma el servidor y se prueba sin base.
 */

import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { esDuenoMadera, etiquetaDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import { corridaSinOrigen } from "@/lib/forestal/loctp-consumos-analisis";
import { claveEspecie } from "@/lib/forestal/loth-constants";

export interface DetalleDeJornada {
  /** Por m³ descendente, juntas por `claveEspecie`. */
  especies: { especie: string; corridas: number; m3: number; pt: number }[];
  /** `productType` de los paquetes vivos, por m³ descendente. */
  clasificaciones: { producto: string; piezas: number; m3: number }[];
  duenos: { etiqueta: string; corridas: number }[];
  /** `originCode` distintos, no vacíos. */
  permisos: string[];
  /** `lineaProduccion` distintas, no vacías. */
  lineas: string[];
  /**
   * Corridas SIN ORIGEN según `corridaSinOrigen`: no les llega consumo de
   * madera (trozas/guía) ni reproceso. Es la misma cuenta que «corridas sin
   * origen» de Consumos; el volumen de entrada escrito no la salva.
   */
  sinMateriaPrima: number;
  paquetes: number;
  /** Las primeras `TOPE_CORRIDAS_DEL_DETALLE`, por `lineNo`. */
  corridas: { lineNo: number; especie: string | null; m3: number; materiaPrimaRef: string | null }[];
}

/** Un número como lo devuelve Prisma: `Decimal`, número o nada. */
type NumeroDelLibro = number | string | { valueOf(): string | number } | null | undefined;

/** Lo que hace falta de UNA corrida para armar el detalle. */
export interface FilaDeJornada {
  lineNo: number;
  quantity: NumeroDelLibro;
  unit: string | null;
  pieces: number | null;
  volumeInputM3: NumeroDelLibro;
  /** Consumos de madera atribuidos (`_count.consumos`). */
  consumos: number;
  /** Reprocesos que PRODUCEN esta corrida (`_count.reprocesosEntrada`, ADR-316). */
  reprocesosEntrada: number;
  speciesCommon: string | null;
  duenoMadera: string | null;
  titularNombre: string | null;
  originCode: string | null;
  lineaProduccion: string | null;
  materiaPrimaRef: string | null;
  /** Sólo los vivos (`deletedAt: null`). */
  paquetes: { productType: string | null; cantidad: number | null; volumenM3: NumeroDelLibro }[];
}

/** Un asiento de la semana, ya con su día (`YYYY-MM-DD`, UTC). */
export interface FilaDeLaSemana extends FilaDeJornada {
  dia: string;
}

export type SeccionDeLaTira = "produccion" | "consumo" | "despacho";

/** Lo que devuelve `ForestCtpDB.jornadasDeProduccion`, un día por fila. */
export interface JornadaDelLibro {
  dia: string;
  corridas: number;
  m3: number;
  pt: number;
  piezas: number;
  /** Sólo en producción. */
  detalle?: DetalleDeJornada;
}

export const SIN_ESPECIE = "Sin especie declarada";
export const SIN_CLASIFICACION = "Sin clasificación";
export const SIN_DUENO = "Sin declarar";
/** Más de seis renglones dejan de ser un vistazo: el resto está en el resumen. */
export const TOPE_CORRIDAS_DEL_DETALLE = 6;

const num = (v: NumeroDelLibro): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const texto = (v: string | null | undefined) => (v ?? "").trim();

/**
 * El volumen que cuenta de una corrida: el declarado, sólo si está en m³.
 *
 * `quantity` casi siempre está en m³ (`guardar-produccion-corrida` manda
 * `unit: "m3"`). Si una fila vieja declaró en otra unidad, su volumen NO se
 * suma —convertir a ojo sería inventar el número que después se lee como
 * producción del día— pero la fila sí se cuenta: el día tuvo trabajo.
 */
function m3Declarado(f: FilaDeJornada): number {
  return !f.unit || f.unit === "m3" ? num(f.quantity) : 0;
}

/**
 * Las jornadas de una semana a partir de sus asientos.
 *
 * Es la cuenta de `ForestCtpDB.jornadasDeProduccion` sin la base. Por sección:
 *  · `produccion` y `despacho`: m³ declarado (sólo en m³) y piezas del asiento;
 *  · `consumo`: m³ de ENTRADA y piezas = consumos del puente (ADR-326).
 * El detalle se arma sólo en producción, con las filas del día en el MISMO
 * orden en que se sumó su m³: así el PT del día y el de sus especies salen de
 * la misma suma, sin un pie de diferencia por el punto flotante.
 */
export function jornadasDesdeFilas(
  filas: readonly FilaDeLaSemana[],
  seccion: SeccionDeLaTira,
): JornadaDelLibro[] {
  const porDia = new Map<string, { corridas: number; m3: number; piezas: number; filas: FilaDeLaSemana[] }>();
  for (const f of filas) {
    const acc = porDia.get(f.dia) ?? { corridas: 0, m3: 0, piezas: 0, filas: [] };
    acc.corridas += 1;
    if (seccion === "consumo") {
      acc.m3 += num(f.volumeInputM3);
      acc.piezas += f.consumos;
    } else {
      acc.m3 += m3Declarado(f);
      acc.piezas += f.pieces ?? 0;
    }
    if (seccion === "produccion") acc.filas.push(f);
    porDia.set(f.dia, acc);
  }

  return [...porDia.entries()]
    .map(([dia, v]) => ({
      dia,
      corridas: v.corridas,
      m3: r4(v.m3),
      /* PT = m³ × `PT_POR_M3`, la equivalencia de la plaza: el aserradero habla
         en pies tablares, el m³ es la unidad del papel. */
      pt: Math.round(v.m3 * PT_POR_M3),
      piezas: v.piezas,
      ...(seccion === "produccion" ? { detalle: detalleDeJornada(v.filas) } : {}),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Reparte un total de PT entre renglones sin que la suma se desvíe.
 *
 * Redondeando cada especie por su cuenta, dos de 0.0012 m³ dan 1 PT cada una
 * bajo un día que dice 1 PT: cifras contiguas que no cierran enseñan a
 * desconfiar del panel entero. Se reparte por el mayor resto.
 */
export function repartirPt(m3s: readonly number[], total: number): number[] {
  const crudos = m3s.map((m) => m * PT_POR_M3);
  const pisos = crudos.map((c) => Math.floor(c));
  let resto = total - pisos.reduce((a, b) => a + b, 0);
  const orden = crudos
    .map((c, i) => ({ i, fraccion: c - Math.floor(c) }))
    .sort((a, b) => b.fraccion - a.fraccion || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    pisos[i] = (pisos[i] ?? 0) + 1;
    resto -= 1;
  }
  return pisos;
}

/** Arma el detalle de un día a partir de sus corridas. */
export function detalleDeJornada(filas: readonly FilaDeJornada[]): DetalleDeJornada {
  const especies = new Map<string, { especie: string; lineNo: number; corridas: number; m3: number }>();
  const clasificaciones = new Map<string, { piezas: number; m3: number }>();
  const duenos = new Map<string, number>();
  const permisos = new Set<string>();
  const lineas = new Set<string>();
  let sinMateriaPrima = 0;
  let paquetes = 0;
  let totalM3 = 0;

  const sumarClasificacion = (producto: string, piezas: number, m3: number) => {
    const acc = clasificaciones.get(producto) ?? { piezas: 0, m3: 0 };
    acc.piezas += piezas;
    acc.m3 += m3;
    clasificaciones.set(producto, acc);
  };

  for (const f of filas) {
    const m3 = m3Declarado(f);
    totalM3 += m3;

    const nombre = texto(f.speciesCommon);
    const clave = claveEspecie(nombre);
    const e = especies.get(clave) ?? {
      especie: clave ? nombre : SIN_ESPECIE,
      lineNo: f.lineNo,
      corridas: 0,
      m3: 0,
    };
    /* Se muestra el nombre de la corrida más vieja (menor N.º): el orden en
       que llegan las filas no puede cambiar cómo se lee la especie. */
    if (clave && f.lineNo < e.lineNo) {
      e.especie = nombre;
      e.lineNo = f.lineNo;
    }
    e.corridas += 1;
    e.m3 += m3;
    especies.set(clave, e);

    if (f.paquetes.length === 0) {
      sumarClasificacion(SIN_CLASIFICACION, f.pieces ?? 0, m3);
    } else {
      let detallado = 0;
      for (const p of f.paquetes) {
        const volumen = num(p.volumenM3);
        detallado += volumen;
        sumarClasificacion(texto(p.productType) || SIN_CLASIFICACION, p.cantidad ?? 0, volumen);
      }
      /* Tolerancia de un litro: la del aserradero, no la del float. */
      if (m3 - detallado > 0.001) sumarClasificacion(SIN_CLASIFICACION, 0, m3 - detallado);
    }
    paquetes += f.paquetes.length;

    /* «No se declaró» NO es «es propia»: sin elección no se le inventa dueño. */
    const etiqueta =
      etiquetaDeDueno({
        dueno: esDuenoMadera(f.duenoMadera) ? f.duenoMadera : null,
        titularNombre: f.titularNombre,
      }) ?? SIN_DUENO;
    duenos.set(etiqueta, (duenos.get(etiqueta) ?? 0) + 1);

    if (texto(f.originCode)) permisos.add(texto(f.originCode));
    if (texto(f.lineaProduccion)) lineas.add(texto(f.lineaProduccion));
    if (corridaSinOrigen({ consumos: f.consumos, reprocesos: f.reprocesosEntrada })) sinMateriaPrima += 1;
  }

  const listaEspecies = [...especies.values()]
    .map(({ especie, corridas, m3 }) => ({ especie, corridas, m3 }))
    .sort((a, b) => b.m3 - a.m3 || b.corridas - a.corridas || a.especie.localeCompare(b.especie, "es"));
  const pts = repartirPt(
    listaEspecies.map((e) => e.m3),
    Math.round(totalM3 * PT_POR_M3),
  );

  return {
    especies: listaEspecies.map((e, i) => ({ ...e, m3: r4(e.m3), pt: pts[i] ?? 0 })),
    clasificaciones: [...clasificaciones.entries()]
      .map(([producto, v]) => ({ producto, piezas: v.piezas, m3: r4(v.m3) }))
      .sort((a, b) => b.m3 - a.m3 || b.piezas - a.piezas || a.producto.localeCompare(b.producto, "es")),
    duenos: [...duenos.entries()]
      .map(([etiqueta, corridas]) => ({ etiqueta, corridas }))
      /* «Sin declarar» al final a igual cuenta: lo que se sabe se lee primero. */
      .sort(
        (a, b) =>
          b.corridas - a.corridas ||
          Number(a.etiqueta === SIN_DUENO) - Number(b.etiqueta === SIN_DUENO) ||
          a.etiqueta.localeCompare(b.etiqueta, "es"),
      ),
    permisos: [...permisos].sort((a, b) => a.localeCompare(b, "es")),
    lineas: [...lineas].sort((a, b) => a.localeCompare(b, "es")),
    sinMateriaPrima,
    paquetes,
    corridas: [...filas]
      .sort((a, b) => a.lineNo - b.lineNo)
      .slice(0, TOPE_CORRIDAS_DEL_DETALLE)
      .map((f) => ({
        lineNo: f.lineNo,
        especie: texto(f.speciesCommon) || null,
        m3: r4(m3Declarado(f)),
        materiaPrimaRef: texto(f.materiaPrimaRef) || null,
      })),
  };
}

/**
 * La clasificación para leer de un vistazo.
 *
 * En el libro real las seis empiezan igual —«MADERA ASERRADA (PAQUETERIA
 * LARGA)»— y en un panel de 20 rem lo que distingue queda cortado. Se quita el
 * prefijo común y el paréntesis que lo envuelve; el nombre completo va aparte.
 */
export function clasificacionCorta(producto: string): string {
  const sinPrefijo = producto.replace(/^MADERA ASERRADA\s+/i, "").trim();
  const envuelto = /^\((.+)\)$/.exec(sinPrefijo);
  return (envuelto?.[1] ?? sinPrefijo).trim() || producto;
}
