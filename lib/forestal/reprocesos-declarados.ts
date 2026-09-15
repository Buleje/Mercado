/**
 * Qué reprocesos declaró la planta — la lectura que pide un fiscalizador y que
 * el dueño no tenía en ningún lado (Brandon, 2026-09-09).
 *
 * El reproceso ya se registraba (ADR-316) y descontaba stock, pero vivía
 * **suelto**: cada asiento por su lado, sin una vista que dijera «este mes
 * volvieron 4.2 m³ a la sierra, salieron 3.6 y de eso la mitad fue una
 * conversión rara». Sin esa vista, la pregunta «¿por qué en el libro figura
 * comercial saliendo de una tabla?» se contesta abriendo asiento por asiento.
 *
 * Este módulo es PURO: recibe lo que la DB ya leyó y deriva lo que se lee.
 * Vive aparte de `forest-ctp-reproceso.db.ts` para poder probar la merma y la
 * detección de conversiones sin una base de datos al lado.
 *
 * ## Dos cuentas que no se pueden confundir
 *
 * · **Lo que ENTRÓ** es la suma de las líneas de origen: cuánto producto
 *   terminado volvió a la sierra.
 * · **Lo que SALIÓ** es la cantidad de la corrida destino.
 *
 * La diferencia es **merma real de aserrío** (el corte, el recorte, el
 * aserrín). Nunca al revés: si salió más de lo que entró, eso no es un
 * rendimiento bueno — es un asiento mal cargado, y se marca como tal en vez de
 * mostrar una merma negativa que nadie sabe leer.
 */

import { esConversionHabitual, porQueNoSePuede } from "./reproceso-reglas";
import { tipoComercialDelProducto } from "./loctp-catalogos";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Una corrida que entró a un reproceso. */
export interface OrigenDeclarado {
  entryId: string;
  lineNo: number | null;
  producto: string | null;
  especie: string | null;
  /** Cuánto de esa corrida entró a este reproceso. */
  cantidad: number;
}

/** Un reproceso declarado, tal como lo devuelve la DB. */
export interface ReprocesoDeclarado {
  destinoEntryId: string;
  lineNo: number | null;
  /** ISO date-only: se formatea con `timeZone: "UTC"` (bug off-by-one Lima). */
  fecha: string;
  producto: string | null;
  especie: string | null;
  unidad: string | null;
  /** Lo que declaró la corrida destino. */
  salio: number;
  observaciones: string | null;
  permiso: string | null;
  origenes: OrigenDeclarado[];
}

/** Una conversión de este reproceso, ya juzgada contra la matriz (ADR-407). */
export interface ConversionDeclarada {
  desde: string;
  hacia: string;
  cantidad: number;
  habitual: boolean;
  /** Por qué no es habitual, para no repetir la regla en la pantalla. */
  porque: string | null;
}

export interface ReprocesoAnalizado extends ReprocesoDeclarado {
  /** Suma de lo que entró — el producto terminado que volvió a la sierra. */
  entro: number;
  /** `entro − salio`, nunca negativo: ver `sospechoso`. */
  mermaM3: number;
  /** La merma sobre lo que entró, en %. `null` si no entró nada declarado. */
  mermaPct: number | null;
  /**
   * `true` cuando salió MÁS de lo que entró. Un reproceso no crea madera: es
   * un asiento para revisar, no un rendimiento del 110 %.
   */
  sospechoso: boolean;
  conversiones: ConversionDeclarada[];
  /** `true` si alguna conversión de este reproceso no es de las habituales. */
  tieneNoHabitual: boolean;
}

/**
 * Deriva merma y conversiones de un reproceso.
 *
 * Las conversiones se juntan por par origen→destino: dos corridas de comercial
 * que alimentan la misma paquetería son **una** conversión de la suma, no dos
 * renglones iguales que hay que sumar con el dedo.
 */
export function analizarReproceso(r: ReprocesoDeclarado): ReprocesoAnalizado {
  const entro = r4(r.origenes.reduce((a, o) => a + o.cantidad, 0));
  const salio = r4(r.salio);
  const tipoDestino = tipoComercialDelProducto(r.producto);

  const porPar = new Map<string, ConversionDeclarada>();
  for (const o of r.origenes) {
    const tipoOrigen = tipoComercialDelProducto(o.producto);
    /* Sin el tipo de alguna punta no se juzga nada: «MADERA ASERRADA» a secas
       no dice qué es, y marcar eso como raro enseña a ignorar las marcas. */
    const desde = tipoOrigen ?? (o.producto ?? "").trim() ?? "";
    const hacia = tipoDestino ?? (r.producto ?? "").trim() ?? "";
    const clave = `${desde}→${hacia}`;
    const habitual = esConversionHabitual(tipoOrigen, tipoDestino);
    const acc = porPar.get(clave);
    if (acc) acc.cantidad = r4(acc.cantidad + o.cantidad);
    else {
      porPar.set(clave, {
        desde: desde || "—",
        hacia: hacia || "—",
        cantidad: r4(o.cantidad),
        habitual,
        porque: habitual ? null : porQueNoSePuede(tipoOrigen, tipoDestino),
      });
    }
  }

  const conversiones = [...porPar.values()].sort((a, b) => b.cantidad - a.cantidad);
  return {
    ...r,
    entro,
    salio,
    mermaM3: r4(Math.max(0, entro - salio)),
    mermaPct: entro > 0 ? r1((Math.max(0, entro - salio) / entro) * 100) : null,
    sospechoso: salio > entro + 0.0001,
    conversiones,
    tieneNoHabitual: conversiones.some((c) => !c.habitual),
  };
}

export interface ResumenReprocesos {
  cuantos: number;
  entro: number;
  salio: number;
  mermaM3: number;
  /** La merma del CONJUNTO, no el promedio de las mermas: el 5 % de un
   *  reproceso de 10 m³ pesa más que el 40 % de uno de 0.05. */
  mermaPct: number | null;
  noHabituales: number;
  sospechosos: number;
  /** Las especies que pasaron por la sierra otra vez. */
  especies: string[];
}

/** El encabezado del panel: lo que entró, lo que salió y qué hay para mirar. */
export function resumirReprocesos(rs: readonly ReprocesoAnalizado[]): ResumenReprocesos {
  const entro = r4(rs.reduce((a, r) => a + r.entro, 0));
  const salio = r4(rs.reduce((a, r) => a + r.salio, 0));
  const merma = r4(Math.max(0, entro - salio));
  return {
    cuantos: rs.length,
    entro,
    salio,
    mermaM3: merma,
    mermaPct: entro > 0 ? r1((merma / entro) * 100) : null,
    noHabituales: rs.filter((r) => r.tieneNoHabitual).length,
    sospechosos: rs.filter((r) => r.sospechoso).length,
    especies: [...new Set(rs.map((r) => (r.especie ?? "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
  };
}

/**
 * Qué producto salió de qué producto, sumado sobre todos los reprocesos.
 *
 * Es la tabla que contesta la pregunta de fiscalización sin abrir asiento por
 * asiento: «de tabla salió comercial 3 veces, 1.2 m³».
 */
export interface ParDeConversion {
  clave: string;
  desde: string;
  hacia: string;
  veces: number;
  cantidad: number;
  habitual: boolean;
  porque: string | null;
}

export function conversionesFrecuentes(rs: readonly ReprocesoAnalizado[]): ParDeConversion[] {
  const m = new Map<string, ParDeConversion>();
  for (const r of rs) {
    for (const c of r.conversiones) {
      const clave = `${c.desde}→${c.hacia}`;
      const acc = m.get(clave);
      if (acc) {
        acc.veces += 1;
        acc.cantidad = r4(acc.cantidad + c.cantidad);
      } else {
        m.set(clave, {
          clave,
          desde: c.desde,
          hacia: c.hacia,
          veces: 1,
          cantidad: r4(c.cantidad),
          habitual: c.habitual,
          porque: c.porque,
        });
      }
    }
  }
  /* Lo no habitual primero: es lo que hay que poder explicar. Dentro de cada
     grupo, lo más grande arriba. */
  return [...m.values()].sort(
    (a, b) => Number(a.habitual) - Number(b.habitual) || b.cantidad - a.cantidad,
  );
}
