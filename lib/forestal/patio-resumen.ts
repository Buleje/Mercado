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
 * PURO y client-safe.
 */

import { PT_POR_M3 } from "./cubicacion";
import { motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";

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
}

/**
 * Quince días.
 *
 * En selva una troza rolliza parada empieza a mancharse y a rajarse; a partir de
 * ahí lo que se pierde es precio, no volumen. El número sale de cómo se mide en
 * el patio —quincenas, no horas— y por eso es entero y generoso: un umbral que
 * se dispara todos los días deja de mirarse.
 */
export const DIAS_PATIO_ANEJO = 15;

/** Cuánto lleva esta pieza esperando. La recepción manda; el asiento es el respaldo. */
export function diasEnPatio(t: TrozaConsumible, ahora: Date): number | null {
  const iso = t.fechaRecepcion ?? t.fechaIngreso ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
  return dias < 0 ? 0 : dias;
}

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
    t.guiaRecepcionada !== false &&
    !t.consumidaEnId &&
    /* «Libre» es relativo al lote que se está cargando: una pieza YA APARTADA en
       ESTE lote está disponible para él —de hecho ya está adentro—, aunque no lo
       esté para el patio en general.

       Sin esto, elegir un lote con sus piezas apartadas dejaba la tabla en
       «Ninguna troza coincide con el filtro» mientras la cabecera de arriba
       decía «6 pza · 23.9220 m³ a consumir». El operador ve una tabla vacía y
       concluye que se rompió. (Medido en el tenant real, 2026-08-06.) */
    (!t.loteAserrioId || (opts.loteId != null && t.loteAserrioId === opts.loteId)) &&
    motivoBloqueo(t) === null
  );
}

/** Las piezas del patio que se pueden tomar hoy. */
export function libresDelPatio(
  trozas: readonly TrozaConsumible[],
  opts: { loteId?: string } = {},
): TrozaConsumible[] {
  return trozas.filter((t) => estaLibreEnPatio(t, opts));
}

/** Cómo se acota la pila desde la pantalla. */
export interface FiltroPatio {
  /** Busca por código de planta, codificación, parcela, especie, guía… */
  texto?: string;
  especie?: string;
  guia?: string;
  /** N° del título habilitante. */
  permiso?: string;
  /** N° de resolución que aprueba el plan de manejo. */
  resolucion?: string;
  proveedor?: string;
}

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Acota la pila. **Sin «sólo las libres»**: ése es un ayudante para elegir, no
 * un filtro de contenido, y si entrara acá los KPI dirían siempre «0 apartadas»
 * (ver `resumenPatio`).
 */
export function filtrarPatio(trozas: readonly TrozaConsumible[], f: FiltroPatio): TrozaConsumible[] {
  const texto = norm(f.texto);
  const especie = norm(f.especie);
  const guia = norm(f.guia);
  const permiso = norm(f.permiso);
  const resolucion = norm(f.resolucion);
  const proveedor = norm(f.proveedor);

  return trozas.filter((t) => {
    if (especie && norm(t.especieComun) !== especie) return false;
    if (guia && norm(t.gtfNumber) !== guia) return false;
    if (permiso && norm(t.permiso) !== permiso) return false;
    if (resolucion && norm(t.resolucion) !== resolucion) return false;
    if (proveedor && norm(t.proveedor) !== proveedor) return false;
    if (texto) {
      const campos = [
        t.codigoPlanta, t.codificacion, t.parcela, t.especieComun,
        t.gtfNumber, t.proveedor, t.permiso, t.resolucion,
      ];
      if (!campos.some((c) => norm(c).includes(texto))) return false;
    }
    return true;
  });
}

/** Lo que hay para elegir en cada `<select>`, sacado de la pila entera. */
export interface OpcionesPatio {
  especies: string[];
  guias: string[];
  permisos: string[];
  resoluciones: string[];
  proveedores: string[];
}

/**
 * Las opciones salen de TODA la pila, no de lo ya filtrado: si se achicaran con
 * el filtro puesto, quitar uno no se podría deshacer desde el propio selector.
 */
export function opcionesDePatio(trozas: readonly TrozaConsumible[]): OpcionesPatio {
  const unicos = (get: (t: TrozaConsumible) => string | null | undefined) =>
    [...new Set(trozas.map((t) => (get(t) ?? "").trim()).filter(Boolean))].sort();
  return {
    especies: unicos((t) => t.especieComun),
    guias: unicos((t) => t.gtfNumber),
    permisos: unicos((t) => t.permiso),
    resoluciones: unicos((t) => t.resolucion),
    proveedores: unicos((t) => t.proveedor),
  };
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

  const porEspecie = new Map<string, { piezas: number; volumenM3: number }>();
  const guias = new Set<string>();
  const permisos = new Set<string>();
  const proveedores = new Set<string>();

  for (const t of trozas) {
    const v = Number(t.volumenM3 ?? 0);
    const vol = Number.isFinite(v) ? v : 0;
    volumen += vol;
    if (vol > 0 && (mayor == null || vol > mayor)) mayor = vol;

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
  };
}
