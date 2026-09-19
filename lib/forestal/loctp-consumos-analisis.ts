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

import { RENDIMIENTO_PLAUSIBLE_MAX, RENDIMIENTO_PLAUSIBLE_MIN } from "./loctp-catalogos";
import type { FilaConsumo, GrafoConsumos } from "./loctp-consumos";

/** Redondeo del libro: cuatro decimales, como el resto del módulo. */
const r4 = (n: number): number => Number(n.toFixed(4));

/** Tolerancia para comparar volúmenes (evita "0.0000001 sin atribuir"). */
const EPS = 1e-4;

/** Sólo estas unidades se pueden sumar entre sí para medir rendimiento. */
const UNIDAD_VOLUMEN = /^m3?$|^m³$|^metros? c[úu]bicos?$/i;

export type AgrupacionConsumo = "ninguna" | "especie" | "guia" | "corrida" | "permiso";

export interface GrupoConsumo {
  /** Con qué se agrupó (nombre de especie, N° de guía, corrida…). */
  clave: string;
  filas: FilaConsumo[];
  /** Suma de (9) del grupo. */
  cantidad: number;
  /** Cuántas guías distintas aportaron — dice si el grupo mezcla orígenes. */
  guias: number;
  /** El grupo por especie, adentro — útil cuando se agrupa por algo que NO es
   *  la especie (permiso, guía): un permiso puede traer más de una especie y
   *  el total solo no dice de qué está hecho (Brandon, 2026-09-01). */
  porEspecie: { especie: string; cantidad: number }[];
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
    por === "especie"
      ? f.especieComun || "—"
      : por === "guia"
        ? f.gtf || "—"
        : por === "permiso"
          ? f.codigoOrigen || "Sin permiso"
          : f.observaciones || "—";

  const mapa = new Map<string, FilaConsumo[]>();
  for (const f of filas) {
    const k = clave(f);
    const arr = mapa.get(k);
    if (arr) arr.push(f);
    else mapa.set(k, [f]);
  }

  const porEspecieDe = (fs: FilaConsumo[]): { especie: string; cantidad: number }[] => {
    const m = new Map<string, number>();
    for (const f of fs) {
      const e = f.especieComun || "—";
      m.set(e, (m.get(e) ?? 0) + (Number(f.cantidad) || 0));
    }
    return [...m.entries()]
      .map(([especie, cantidad]) => ({ especie, cantidad: r4(cantidad) }))
      .sort((a, b) => b.cantidad - a.cantidad);
  };

  return [...mapa.entries()]
    .map(([k, fs]) => ({
      clave: k,
      filas: fs,
      cantidad: r4(fs.reduce((a, f) => a + (Number(f.cantidad) || 0), 0)),
      guias: new Set(fs.map((f) => f.gtf).filter(Boolean)).size,
      porEspecie: porEspecieDe(fs),
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
  /* Una corrida tiene origen si le llega CUALQUIERA de las dos aristas: madera
     de un ingreso (`consumos`) o producto de otra corrida que volvió a la
     sierra (`reprocesos`, ADR-316). Contar sólo la primera acusaba de huérfana
     a la corrida reprocesada, que es justo la que tiene su cadena escrita —su
     origen es otra línea del mismo libro, con su propia GTF detrás. */
  const porConsumo = aristasQueLlegan(grafo?.consumos ?? []);
  const porReproceso = aristasQueLlegan(grafo?.reprocesos ?? []);
  const corridasSinOrigen = corridas
    .filter((c) =>
      corridaSinOrigen({ consumos: porConsumo.get(c.id) ?? 0, reprocesos: porReproceso.get(c.id) ?? 0 }),
    )
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
 * ¿La corrida quedó sin origen? — LA regla, en un solo lugar.
 *
 * Tiene origen si le llega CUALQUIERA de las dos aristas de la cadena: madera
 * de un ingreso (`ForestCtpConsumo`, con sus trozas por pieza — ADR-326) o
 * producto de otra corrida que volvió a la sierra (`ForestCtpReproceso` como
 * destino, ADR-316). El volumen de entrada escrito en el asiento NO cuenta: es
 * un número, no una atribución — sin arista no se sabe de qué guía salió.
 *
 * La usan el resumen de Consumos (`corridasSinOrigen`) y el detalle flotante de
 * la tira de días. Con dos reglas, una pantalla decía 14 y la otra 9 sobre las
 * mismas corridas de Blas (2026-09-14): el 01/08 declaraba 142 m³ de entrada y
 * ninguna troza.
 */
export function corridaSinOrigen(aristas: { consumos: number; reprocesos: number }): boolean {
  return aristas.consumos === 0 && aristas.reprocesos === 0;
}

/**
 * Cuántas aristas llegan a cada nodo.
 *
 * Exportada para que el Radar (`ctp-radar.ts`) cuente sus propios `consumos` y
 * `reprocesos` con la misma cuenta que usa `resumenConsumos` — antes tenía una
 * copia que sólo miraba el volumen de `consumos` e ignoraba `reprocesos` por
 * completo, así que una corrida nacida de un reproceso (sin ningún consumo
 * directo) salía "sin materia prima" en el Radar aunque `resumenConsumos` ya
 * la reconociera con origen (ADR-316).
 */
export function aristasQueLlegan(aristas: ReadonlyArray<{ to: string }>): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const a of aristas) cuenta.set(a.to, (cuenta.get(a.to) ?? 0) + 1);
  return cuenta;
}

/**
 * Agrega las corridas SIN ORIGEN de un período: cuántas son y cuánto m³
 * produjeron. Pura y probada; la llama `ForestCtpDB.contarCorridasSinOrigen`
 * con los dos contadores de puente que ya trae la consulta.
 *
 * Existe aparte del resumen de Consumos porque los pendientes del libro sólo
 * necesitan las dos cifras, no el grafo: hasta 2026-09-19 el pendiente estaba
 * hardcodeado en 0 justamente porque calcularlo exigía bajarse el grafo entero.
 * La regla es la MISMA (`corridaSinOrigen`) — con dos reglas, una pantalla dijo
 * 14 y la otra 9 sobre las mismas corridas de Blas.
 */
export function agregarSinOrigen(
  filas: ReadonlyArray<{
    quantity?: number | string | null;
    unit?: string | null;
    consumos: number;
    reprocesos: number;
  }>,
): { corridas: number; producidoM3: number } {
  let corridas = 0;
  let producidoM3 = 0;
  for (const f of filas) {
    if (!corridaSinOrigen({ consumos: f.consumos, reprocesos: f.reprocesos })) continue;
    corridas += 1;
    /* Una corrida medida en PT se cuenta como sin origen igual, pero su cifra
       no entra en un total que dice «m³»: mezclar unidades es cómo nace un
       número que parece oficial y no lo es. */
    if (UNIDAD_VOLUMEN.test((f.unit ?? "").trim())) producidoM3 += Number(f.quantity) || 0;
  }
  return { corridas, producidoM3: r4(producidoM3) };
}

/**
 * Cómo se lee un rendimiento de aserrío.
 *
 * Los límites salen de `loctp-catalogos` —donde vive también la meta operativa—
 * y no se repiten acá: cuando estaban duplicados, esta hoja juzgaba con 40/75
 * mientras el formulario de producción juzgaba con la meta de 56, y la misma
 * corrida recibía dos veredictos distintos según dónde se la mirara.
 */
export function juzgarRendimientoConsumo(pct: number | null): {
  tono: "ok" | "aviso" | "malo" | "neutro";
  texto: string;
} {
  if (pct == null) return { tono: "neutro", texto: "Sin dato comparable" };
  if (pct < RENDIMIENTO_PLAUSIBLE_MIN) return { tono: "aviso", texto: "Bajo para aserrío" };
  if (pct > RENDIMIENTO_PLAUSIBLE_MAX) return { tono: "malo", texto: "Revisar: muy alto" };
  return { tono: "ok", texto: "En rango de aserrío" };
}
