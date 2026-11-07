/**
 * patio-por-permiso — «¿cuántas trozas me quedan por permiso?» (ADR-431).
 *
 * La misma pregunta tenía cuatro respuestas: 125,22 m³ en la antigüedad de
 * Saldos (m³ del libro por guía), 135,59 en la capacidad (sólo lo recibido),
 * 155,65 en el saldo por permiso de Producción (mezcla lo que no bajó del
 * camión) y 46 trozas en Consumos (esconde lo que no se recibió). Medido en
 * Blas el 24-09: 77 trozas / 155,65 m³ vivas en 2 permisos, de las que 46 /
 * 135,59 están en el patio y 31 / 20,06 esperan que se recepcione su guía.
 *
 * Acá hay UN criterio —el del libro, `estaDisponible`— partido en TRES cubetas
 * que no se suman a ciegas:
 *  · **libres**: recibida y sin lote; se puede llevar a la sierra hoy.
 *  · **en lote**: recibida y apartada para una corrida.
 *  · **por recepcionar**: su guía sigue en la bandeja; está anotada, no en la pila.
 * libres + en lote = «en el patio». Lo por recepcionar va aparte y NUNCA cuenta
 * días en el patio: su única fecha es la del asiento de la guía.
 *
 * PURO y client-safe. Lo re-exporta `patio-resumen`, que es por donde se importa.
 */

import { estaDisponible, type TrozaConsumible } from "./consumo-trozas";
import { pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { diasDelAsiento, diasEnPatio, tramoDeDias, tramosEnCero, type TramoDias } from "./patio-dias";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const vol = (t: TrozaConsumible) => {
  const v = Number(t.volumenM3 ?? 0);
  return Number.isFinite(v) ? v : 0;
};
const clave = (v: string | null | undefined) => (v ?? "").trim();

/**
 * ⭐ La pieza está EN EL PATIO: su guía se recibió y el libro la da por
 * disponible (no consumida, no despachada, no descarte, no madre retrozada,
 * con volumen). Libre o apartada en un lote, las dos cuentan.
 *
 * `estaLibreEnPatio` es esto MÁS «sin lote»: un solo predicado de base, para
 * que la KPI, la tabla y el patio por permiso no puedan contar distinto.
 */
export function enPatio(t: TrozaConsumible): boolean {
  return t.guiaRecepcionada !== false && estaDisponible(t);
}

/** Anotada y disponible, pero su guía no se recepcionó: no está en la pila. */
export function porRecepcionarDelPatio(t: TrozaConsumible): boolean {
  return t.guiaRecepcionada === false && estaDisponible(t);
}

/** Piezas y metros cúbicos de una cubeta. */
export interface VolumenPatio {
  trozas: number;
  m3: number;
}

/** Una fecha con sus días, ya calculados con `diasParada` (día UTC). */
export interface FechaConDias {
  /** ISO. Recepción de la pieza o, si no se sabe, asiento de la guía. */
  fecha: string;
  dias: number;
}

export interface PorRecepcionarPatio extends VolumenPatio {
  /** Guías distintas que hay que recepcionar para destrabarlas. */
  guias: number;
  /**
   * El asiento más viejo de esas guías. **No son días en el patio**: se rotula
   * «guía asentada hace N días (sin recepcionar)».
   */
  asientoMasViejo: FechaConDias | null;
}

export interface FilaPermisoPatio {
  /** N° del título habilitante. `null` = la madera no declara permiso. */
  permiso: string | null;
  /** La resolución del plan que más aparece bajo ese permiso. */
  resolucion: string | null;
  /** enPatio + porRecepcionar: todo lo vivo del permiso en el libro. */
  total: VolumenPatio;
  /**
   * libres + en lote. `ptAserrable` es un DERIVADO: m³ × 56 % (RENDIMIENTO_META)
   * × 424 pt/m³ — lo que rendiría aserrado, no lo que hay.
   */
  enPatio: VolumenPatio & { ptAserrable: number };
  libres: VolumenPatio;
  enLote: VolumenPatio;
  porRecepcionar: PorRecepcionarPatio;
  /** Guías distintas de TODA la fila (en patio y por recepcionar). */
  guias: number;
  /** Especies distintas por la especie de la TROZA (no la de la guía), de toda la fila. */
  especies: number;
  /** La pieza del patio que lleva más días parada. Sólo sobre lo que está EN el patio. */
  masVieja: FechaConDias | null;
  /** Cuántas piezas EN el patio caen en cada tramo de días. */
  tramos: Record<TramoDias, number>;
}

export interface TotalesPermisoPatio extends Omit<FilaPermisoPatio, "permiso" | "resolucion"> {
  /** Cuántos permisos con nombre tienen madera viva (la fila sin permiso no cuenta). */
  permisos: number;
}

export interface ResumenPorPermiso {
  filas: FilaPermisoPatio[];
  totales: TotalesPermisoPatio;
}

interface Acumulador {
  permiso: string | null;
  resoluciones: Map<string, number>;
  libres: VolumenPatio;
  enLote: VolumenPatio;
  porRecepcionar: VolumenPatio;
  guias: Set<string>;
  guiasPorRecepcionar: Set<string>;
  especies: Set<string>;
  masVieja: FechaConDias | null;
  asientoMasViejo: FechaConDias | null;
  tramos: Record<TramoDias, number>;
}

const nuevo = (permiso: string | null): Acumulador => ({
  permiso,
  resoluciones: new Map(),
  libres: { trozas: 0, m3: 0 },
  enLote: { trozas: 0, m3: 0 },
  porRecepcionar: { trozas: 0, m3: 0 },
  guias: new Set(),
  guiasPorRecepcionar: new Set(),
  especies: new Set(),
  masVieja: null,
  asientoMasViejo: null,
  tramos: tramosEnCero(),
});

const isoDe = (v: string | Date | null | undefined): string | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const masViejaEntre = (a: FechaConDias | null, b: FechaConDias | null) =>
  b == null ? a : a == null || b.dias > a.dias ? b : a;

function sumar(acc: Acumulador, t: TrozaConsumible, ahora: Date): void {
  const v = vol(t);
  const guia = clave(t.gtfNumber) || t.woodEntryId;
  acc.guias.add(guia);
  const esp = claveEspecie(t.especieComun);
  if (esp) acc.especies.add(esp);
  const res = clave(t.resolucion);
  if (res) acc.resoluciones.set(res, (acc.resoluciones.get(res) ?? 0) + 1);

  if (porRecepcionarDelPatio(t)) {
    acc.porRecepcionar.trozas += 1;
    acc.porRecepcionar.m3 += v;
    acc.guiasPorRecepcionar.add(guia);
    const dias = diasDelAsiento(t, ahora);
    const fecha = isoDe(t.fechaIngreso);
    if (dias != null && fecha) acc.asientoMasViejo = masViejaEntre(acc.asientoMasViejo, { fecha, dias });
    return;
  }

  const cubeta = t.loteAserrioId ? acc.enLote : acc.libres;
  cubeta.trozas += 1;
  cubeta.m3 += v;
  const dias = diasEnPatio(t, ahora);
  const fecha = isoDe(t.fechaRecepcion) ?? isoDe(t.fechaIngreso);
  if (dias != null && fecha) {
    acc.masVieja = masViejaEntre(acc.masVieja, { fecha, dias });
    const tramo = tramoDeDias(dias);
    if (tramo) acc.tramos[tramo] += 1;
  }
}

const cerrar = (x: VolumenPatio): VolumenPatio => ({ trozas: x.trozas, m3: r4(x.m3) });

function aFila(acc: Acumulador): FilaPermisoPatio {
  const enPatioM3 = acc.libres.m3 + acc.enLote.m3;
  const resolucion =
    [...acc.resoluciones.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return {
    permiso: acc.permiso,
    resolucion,
    total: {
      trozas: acc.libres.trozas + acc.enLote.trozas + acc.porRecepcionar.trozas,
      m3: r4(enPatioM3 + acc.porRecepcionar.m3),
    },
    enPatio: {
      trozas: acc.libres.trozas + acc.enLote.trozas,
      m3: r4(enPatioM3),
      ptAserrable: pieTablarAserrableDe(enPatioM3, RENDIMIENTO_META),
    },
    libres: cerrar(acc.libres),
    enLote: cerrar(acc.enLote),
    porRecepcionar: {
      ...cerrar(acc.porRecepcionar),
      guias: acc.guiasPorRecepcionar.size,
      asientoMasViejo: acc.asientoMasViejo,
    },
    guias: acc.guias.size,
    especies: acc.especies.size,
    masVieja: acc.masVieja,
    tramos: acc.tramos,
  };
}

/**
 * El patio por permiso.
 *
 * Recibe la respuesta ENTERA de `GET /trozas/patio` (con `?contratoId=` si
 * «Solo este permiso» está prendido): con la pila ya filtrada por la pantalla,
 * la fila de un permiso dejaría de sumar lo que el filtro esconde.
 *
 * Sólo cuentan las piezas con `estaDisponible`: lo consumido, despachado,
 * descartado, las madres retrozadas y lo sin volumen no queda en ningún lado.
 *
 * Orden: más m³ en el patio primero; a igualdad, más m³ por recepcionar. La
 * fila sin permiso va SIEMPRE al final: es un pendiente, no un origen.
 */
export function resumenPorPermiso(trozas: readonly TrozaConsumible[], ahora: Date): ResumenPorPermiso {
  const porPermiso = new Map<string, Acumulador>();
  const todo = nuevo(null);
  const SIN = "\u0000sin-permiso";

  for (const t of trozas) {
    if (!estaDisponible(t)) continue;
    const permiso = clave(t.permiso) || null;
    const k = permiso ?? SIN;
    const acc = porPermiso.get(k) ?? nuevo(permiso);
    porPermiso.set(k, acc);
    sumar(acc, t, ahora);
    sumar(todo, t, ahora);
  }

  const filas = [...porPermiso.values()]
    .map(aFila)
    .sort((a, b) => {
      if (a.permiso == null) return 1;
      if (b.permiso == null) return -1;
      return (
        b.enPatio.m3 - a.enPatio.m3 ||
        b.porRecepcionar.m3 - a.porRecepcionar.m3 ||
        a.permiso.localeCompare(b.permiso, "es-PE", { numeric: true })
      );
    });

  const t = aFila(todo);
  return {
    filas,
    totales: {
      total: t.total,
      enPatio: t.enPatio,
      libres: t.libres,
      enLote: t.enLote,
      porRecepcionar: t.porRecepcionar,
      guias: t.guias,
      especies: t.especies,
      masVieja: t.masVieja,
      tramos: t.tramos,
      permisos: filas.filter((f) => f.permiso != null).length,
    },
  };
}
