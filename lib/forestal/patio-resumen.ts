/**
 * patio-resumen.ts — qué hay parado en el patio, en cifras (ADR-345).
 *
 * La pestaña Consumos mostraba siempre las cifras del CUADRO —lo que ya entró a
 * la sierra— incluso cuando lo que se estaba mirando era el patio. Dos cosas
 * distintas bajo los mismos cuatro números: el operador leía "3 consumos" con la
 * pila de trozas delante.
 *
 * Acá vive el resumen del patio: piezas, volumen, especies y espera. Las mismas
 * preguntas que se hacen parado frente a la pila —¿cuánto hay?, ¿de qué?, ¿hace
 * cuánto que está?— y ninguna que haya que derivar de otra pantalla.
 *
 * Es también la PUERTA del patio (ADR-431): re-exporta los días y tramos
 * (`patio-dias`), los filtros y facetas (`patio-filtros`) y el patio por
 * permiso (`patio-por-permiso`). Quien necesite algo del patio importa de acá.
 *
 * PURO y client-safe.
 */

import { PT_POR_M3 } from "./cubicacion";
import { motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";
import { TRAMOS_DIAS_PATIO, diasEnPatio } from "./patio-dias";
import { enPatio } from "./patio-por-permiso";

export {
  TRAMOS_DIAS_PATIO,
  TRAMOS_DIAS,
  ETIQUETA_TRAMO_DIAS,
  ETIQUETA_CORTA_TRAMO_DIAS,
  SEVERIDAD_TRAMO_DIAS,
  TONO_TRAMO_DIAS,
  tramoDeDias,
  tramoDeTroza,
  diasParada,
  diasEnPatio,
  diasDelAsiento,
  type TramoDias,
  type FechasDeTroza,
} from "./patio-dias";
export {
  filtrarPatio,
  opcionesDePatio,
  facetasDePatio,
  type FiltroPatio,
  type RangoPatio,
  type OpcionesPatio,
  type FacetaPatio,
  type RangoConDato,
  type FacetasDePatio,
} from "./patio-filtros";
export { esSinCodigo, diametroDe } from "./consumo-trozas";
export {
  enPatio,
  porRecepcionarDelPatio,
  resumenPorPermiso,
  type FilaPermisoPatio,
  type TotalesPermisoPatio,
  type ResumenPorPermiso,
  type VolumenPatio,
  type FechaConDias,
  type PorRecepcionarPatio,
} from "./patio-por-permiso";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Una especie de la pila, con lo que pesa dentro del patio. */
export interface EspecieEnPatio {
  especie: string;
  piezas: number;
  volumenM3: number;
  /** Cuánto del volumen del patio es de esta especie (0-100). */
  pctVolumen: number;
}

export interface ResumenPatio {
  /** Piezas de guías recepcionadas que todavía no se aserraron. */
  piezas: number;
  /** Se pueden elegir hoy: sin lote y sin nada que las bloquee. */
  libres: number;
  /** Apartadas en un lote de aserrío: están en la pila, pero con dueño. */
  apartadas: number;
  /** No se pueden consumir (sin volumen, descarte, madre retrozada…). */
  bloqueadas: number;
  volumenM3: number;
  pieTablar: number;
  /** El volumen que se puede mandar hoy a la sierra (sólo las libres). */
  volumenLibreM3: number;
  /** Promedio y máximo por pieza: dicen si la pila es de palo grueso o menudo. */
  promedioM3: number | null;
  mayorM3: number | null;
  especies: number;
  /** Ordenadas por volumen: la primera es la que manda en el patio. */
  porEspecie: EspecieEnPatio[];
  /** Guías, permisos y proveedores distintos que sostienen esta madera. */
  guias: number;
  permisos: number;
  proveedores: number;
  /** Días de la pieza más vieja que sigue esperando. */
  esperaMaxDias: number | null;
  /** Cuántas superan el plazo de espera razonable. */
  anejas: number;
  /**
   * Están en el patio pero su GUÍA no se recepcionó todavía.
   *
   * No es un bloqueo de la troza (`motivoBloqueo`) sino del papel que la ampara:
   * la madera está ahí y se ve, pero no puede entrar a la sierra hasta cerrar la
   * recepción. Medido en el tenant real (2026-09-12): 153 de 160 piezas, 181 m³
   * de 197 — el 92 % del patio esperando un trámite que la pantalla no nombraba.
   */
  sinRecepcionar: number;
  volumenSinRecepcionarM3: number;
  /** Cuántas guías distintas hay que recepcionar para destrabarlas. */
  guiasSinRecepcionar: number;
  /**
   * EN EL PATIO (`enPatio`: libres + apartadas en lote, guía recibida, sin
   * bloqueo). Es el número que comparten la KPI «Trozas en el patio», el
   * contador de la pestaña y la fila de «Por permiso» (ADR-431); `piezas` sigue
   * contando todo lo que se le pasó, bloqueadas incluidas.
   */
  enPatioPiezas: number;
  enPatioM3: number;
}

/**
 * Quince días: el primer borde de `TRAMOS_DIAS_PATIO` (ADR-431).
 *
 * En selva una troza rolliza parada empieza a mancharse y a rajarse; a partir de
 * ahí lo que se pierde es precio, no volumen. Sale de la escala única para que
 * la KPI, la columna y el Aging no puedan discrepar en el borde: 15 días ya es
 * «añeja» en todas (`>=`).
 */
export const DIAS_PATIO_ANEJO: number = TRAMOS_DIAS_PATIO[0];

const clave = (v: string | null | undefined) => (v ?? "").trim();

/**
 * ⭐ La pieza se puede apartar o mandar a la sierra HOY.
 *
 * Cuatro condiciones y las cuatro importan: la guía tiene que estar
 * recepcionada (ADR-339 — la madera que el papel declara pero nadie recibió no
 * está en la pila), la pieza sin consumir, sin lote que la haya apartado y sin
 * ningún motivo de bloqueo (descarte, madre retrozada, sin volumen).
 *
 * Vive acá y no repetida en cada pantalla porque **dos pantallas que cuentan la
 * misma madera con criterios distintos se contradicen en voz alta**: la de
 * Lotes prometía 47 piezas libres y la del patio ofrecía 30 — las 17 de
 * diferencia eran guías que seguían en la bandeja.
 */
export function estaLibreEnPatio(t: TrozaConsumible, opts: { loteId?: string } = {}): boolean {
  return (
    /* En el patio (`enPatio`: guía recibida + disponible según el libro) y sin
       lote. Un solo predicado de base para la KPI, la tabla y el patio por
       permiso (ADR-431): `esLibre` de la capacidad delega acá.

       «Libre» es relativo al lote que se está cargando: una pieza YA APARTADA en
       ESTE lote está disponible para él —de hecho ya está adentro—, aunque no lo
       esté para el patio en general.

       Sin esto, elegir un lote con sus piezas apartadas dejaba la tabla en
       «Ninguna troza coincide con el filtro» mientras la cabecera de arriba
       decía «6 pza · 23.9220 m³ a consumir». El operador ve una tabla vacía y
       concluye que se rompió. (Medido en el tenant real, 2026-08-06.) */
    enPatio(t) &&
    (!t.loteAserrioId || (opts.loteId != null && t.loteAserrioId === opts.loteId))
  );
}

/** Las piezas del patio que se pueden tomar hoy. */
export function libresDelPatio(
  trozas: readonly TrozaConsumible[],
  opts: { loteId?: string } = {},
): TrozaConsumible[] {
  return trozas.filter((t) => estaLibreEnPatio(t, opts));
}

/**
 * El patio en cifras.
 *
 * Recibe **las piezas del patio ya acotadas por el filtro de la pantalla**: los
 * números y la tabla tienen que decir lo mismo, igual que el CSV baja lo que se
 * está viendo. Si se le pasara la pila entera, el KPI contradiría a la tabla que
 * tiene debajo.
 */
export function resumenPatio(trozas: readonly TrozaConsumible[], ahora: Date): ResumenPatio {
  let volumen = 0;
  let volumenLibre = 0;
  let libres = 0;
  let apartadas = 0;
  let bloqueadas = 0;
  let mayor: number | null = null;
  let esperaMax: number | null = null;
  let anejas = 0;
  let sinRecepcionar = 0;
  let volumenSinRecepcionar = 0;
  let enPatioPiezas = 0;
  let enPatioM3 = 0;

  const guiasPendientes = new Set<string>();
  const porEspecie = new Map<string, { piezas: number; volumenM3: number }>();
  const guias = new Set<string>();
  const permisos = new Set<string>();
  const proveedores = new Set<string>();

  for (const t of trozas) {
    const v = Number(t.volumenM3 ?? 0);
    const vol = Number.isFinite(v) ? v : 0;
    volumen += vol;
    if (vol > 0 && (mayor == null || vol > mayor)) mayor = vol;

    /* La guía sin recepcionar se cuenta aparte de los bloqueos de la troza:
       una pieza puede estar perfecta y aun así no poder usarse porque su papel
       no está cerrado. Es lo que hay que ir a resolver, no un defecto. */
    if (t.guiaRecepcionada === false) {
      sinRecepcionar += 1;
      volumenSinRecepcionar += vol;
      if (clave(t.gtfNumber)) guiasPendientes.add(clave(t.gtfNumber));
    }

    const bloqueo = motivoBloqueo(t);
    if (bloqueo) bloqueadas += 1;
    else if (t.loteAserrioId) apartadas += 1;
    else if (estaLibreEnPatio(t)) {
      libres += 1;
      volumenLibre += vol;
    }

    const esp = clave(t.especieComun);
    if (esp) {
      const fila = porEspecie.get(esp) ?? { piezas: 0, volumenM3: 0 };
      fila.piezas += 1;
      fila.volumenM3 += vol;
      porEspecie.set(esp, fila);
    }
    if (clave(t.gtfNumber)) guias.add(clave(t.gtfNumber));
    if (clave(t.permiso)) permisos.add(clave(t.permiso));
    if (clave(t.proveedor)) proveedores.add(clave(t.proveedor));

    /* Sólo envejece lo que está EN el patio: una pieza consumida, descartada o
       madre retrozada no espera la sierra, y la que no se recepcionó no está en
       la pila — su fecha es la del asiento (ADR-431, C7). */
    if (!enPatio(t)) continue;
    enPatioPiezas += 1;
    enPatioM3 += vol;
    const dias = diasEnPatio(t, ahora);
    if (dias != null) {
      if (esperaMax == null || dias > esperaMax) esperaMax = dias;
      if (dias >= DIAS_PATIO_ANEJO) anejas += 1;
    }
  }

  const volumenM3 = r4(volumen);
  const lista: EspecieEnPatio[] = [...porEspecie.entries()]
    .map(([especie, f]) => ({
      especie,
      piezas: f.piezas,
      volumenM3: r4(f.volumenM3),
      /* Sobre el volumen y no sobre las piezas: cuatro trozas gruesas de shihuahuaco
         pesan en la sierra más que veinte de bolaina. */
      pctVolumen: volumenM3 > 0 ? Math.round((f.volumenM3 / volumenM3) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.volumenM3 - a.volumenM3 || b.piezas - a.piezas);

  return {
    piezas: trozas.length,
    libres,
    apartadas,
    bloqueadas,
    volumenM3,
    pieTablar: Math.round(volumenM3 * PT_POR_M3),
    volumenLibreM3: r4(volumenLibre),
    promedioM3: trozas.length > 0 ? r4(volumen / trozas.length) : null,
    mayorM3: mayor == null ? null : r4(mayor),
    especies: porEspecie.size,
    porEspecie: lista,
    guias: guias.size,
    permisos: permisos.size,
    proveedores: proveedores.size,
    esperaMaxDias: esperaMax,
    anejas,
    sinRecepcionar,
    volumenSinRecepcionarM3: r4(volumenSinRecepcionar),
    guiasSinRecepcionar: guiasPendientes.size,
    enPatioPiezas,
    enPatioM3: r4(enPatioM3),
  };
}
