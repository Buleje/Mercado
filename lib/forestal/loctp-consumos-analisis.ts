/**
 * loctp-consumos-analisis.ts — lo que la Sección 2 no dice sola.
 *
 * La hoja de Consumos es una lista de "esta guía entró a esta corrida". Eso
 * responde el trámite, pero no las dos preguntas que se hacen mirándola:
 *
 *  1. **¿Cuánto rindió?** Entraron 9.9 m³ a la sierra, ¿cuánta madera salió?
 *     Es el número del negocio y el casillero (13) del Cuadro 3.
 *  2. **¿Quedó algo sin declarar?** Una corrida que produjo sin decir de qué
 *     guía salió su materia prima es un hueco en la cadena: el libro lo admite,
 *     el certificado no. Verlo acá es verlo a tiempo.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import type { FilaConsumo, GrafoConsumos } from "./loctp-consumos";

/** Redondeo del libro: cuatro decimales, como el resto del módulo. */
const r4 = (n: number): number => Number(n.toFixed(4));

/** Tolerancia para comparar volúmenes (evita "0.0000001 sin atribuir"). */
const EPS = 1e-4;

/** Sólo estas unidades se pueden sumar entre sí para medir rendimiento. */
const UNIDAD_VOLUMEN = /^m3?$|^m³$|^metros? c[úu]bicos?$/i;

export type AgrupacionConsumo = "ninguna" | "especie" | "guia" | "corrida";

export interface GrupoConsumo {
  /** Con qué se agrupó (nombre de especie, N° de guía, corrida…). */
  clave: string;
  filas: FilaConsumo[];
  /** Suma de (9) del grupo. */
  cantidad: number;
  /** Cuántas guías distintas aportaron — dice si el grupo mezcla orígenes. */
  guias: number;
}

/**
 * Agrupa las filas del libro para poder leerlas.
 *
 * Con veinte consumos la lista plana alcanza; con doscientos —un mes real— la
 * pregunta nunca es "mostrame todo", es "cuánto de Tornillo" o "qué salió de la
 * guía 019-4". Los grupos van ordenados por cantidad: lo que más pesa, primero.
 */
export function agruparConsumos(
  filas: ReadonlyArray<FilaConsumo>,
  por: AgrupacionConsumo,
): GrupoConsumo[] {
  if (por === "ninguna") return [];
  const clave = (f: FilaConsumo): string =>
    por === "especie" ? f.especieComun || "—" : por === "guia" ? f.gtf || "—" : f.observaciones || "—";

  const mapa = new Map<string, FilaConsumo[]>();
  for (const f of filas) {
    const k = clave(f);
    const arr = mapa.get(k);
    if (arr) arr.push(f);
    else mapa.set(k, [f]);
  }

  return [...mapa.entries()]
    .map(([k, fs]) => ({
      clave: k,
      filas: fs,
      cantidad: r4(fs.reduce((a, f) => a + (Number(f.cantidad) || 0), 0)),
      guias: new Set(fs.map((f) => f.gtf).filter(Boolean)).size,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.clave.localeCompare(b.clave, "es"));
}

export interface ResumenConsumos {
  /** m³ que entraron a la sierra en lo que se está viendo. */
  consumido: number;
  /** Lo producido por las corridas que consumieron ESA madera. */
  producido: number;
  /**
   * producido / consumido en %. `null` cuando no se puede afirmar: sin consumo,
   * o con corridas en una unidad que no es volumen.
   */
  rendimientoPct: number | null;
  /** Corridas cuya producción NO se puede sumar (pt, unidades, tablones…). */
  corridasOtraUnidad: number;
  /**
   * Corridas del período que produjeron SIN declarar de qué ingreso salieron.
   * Es el hueco que rompe la cadena hacia atrás.
   *
   * Llevan `label` y no sólo el N°: en datos reales el `lineNo` se repite
   * (tres corridas del mismo día comparten el 95000) y un aviso que dice
   * "#95000 · #95000 · #95000" no señala nada.
   */
  corridasSinOrigen: { id: string; lineNo: number; label: string; producido: number }[];
  /** Cuánto se produjo sin respaldo: es lo que un fiscalizador mide, no cuántas. */
  producidoSinOrigen: number;
}

/**
 * Las cifras del período que la tabla no muestra.
 *
 * ── Por qué el rendimiento puede salir `null` ────────────────────────────────
 * Porque mezclar unidades sería inventar el número. Una corrida que declara su
 * producción en pies tablares no se puede dividir por metros cúbicos sin un
 * factor de conversión que el libro no declara: esas corridas se cuentan aparte
 * (`corridasOtraUnidad`) y se dice, en vez de ensuciar el porcentaje.
 */
export function resumenConsumos(
  filas: ReadonlyArray<FilaConsumo>,
  grafo: GrafoConsumos | null,
): ResumenConsumos {
  const consumido = r4(filas.reduce((a, f) => a + (Number(f.cantidad) || 0), 0));

  const corridas = grafo?.corridas ?? [];
  const porId = new Map(corridas.map((c) => [c.id, c]));

  // Sólo las corridas que aparecen en lo que se está viendo: el rendimiento es
  // de ESTE consumo, no del período entero.
  const tocadas = new Set(filas.map((f) => f.corridaId).filter(Boolean));

  let producido = 0;
  let corridasOtraUnidad = 0;
  for (const id of tocadas) {
    const c = porId.get(id) as (typeof corridas)[number] & { quantity?: number };
    if (!c) continue;
    if (!UNIDAD_VOLUMEN.test((c.unit ?? "").trim())) {
      corridasOtraUnidad += 1;
      continue;
    }
    producido += Number(c.quantity) || 0;
  }
  producido = r4(producido);

  const rendimientoPct =
    consumido > EPS && corridasOtraUnidad === 0 && producido > 0
      ? Math.round((producido / consumido) * 1000) / 10
      : null;

  // Corrida huérfana: existe en el período y ninguna arista de consumo llega a
  // ella. Se mira contra el grafo COMPLETO, no contra lo filtrado: esconder un
  // hueco porque el filtro no lo alcanza es justamente lo que no se quiere.
  const conOrigen = new Set((grafo?.consumos ?? []).map((c) => c.to));
  const corridasSinOrigen = corridas
    .filter((c) => !conOrigen.has(c.id))
    .map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      label: c.label,
      producido: Number((c as { quantity?: number }).quantity) || 0,
    }));
  const producidoSinOrigen = r4(corridasSinOrigen.reduce((a, c) => a + c.producido, 0));

  return {
    consumido,
    producido,
    rendimientoPct,
    corridasOtraUnidad,
    corridasSinOrigen,
    producidoSinOrigen,
  };
}

/**
 * Cómo se lee un rendimiento de aserrío. Los rangos son los de la práctica
 * (ADR-314): abajo de 40 % algo se está yendo en aserrín o en descarte, arriba
 * de 75 % lo declarado no cierra con lo que da una troza.
 */
export function juzgarRendimientoConsumo(pct: number | null): {
  tono: "ok" | "aviso" | "malo" | "neutro";
  texto: string;
} {
  if (pct == null) return { tono: "neutro", texto: "Sin dato comparable" };
  if (pct < 40) return { tono: "aviso", texto: "Bajo para aserrío" };
  if (pct > 75) return { tono: "malo", texto: "Revisar: muy alto" };
  return { tono: "ok", texto: "En rango de aserrío" };
}
