/**
 * ctp-radar-tiempo — la dimensión que al radar le faltaba: CUÁNDO.
 *
 * La cadena de custodia no sólo tiene que cerrar en volumen, tiene que cerrar
 * en el tiempo. Una corrida fechada antes que la GTF que la surtió, o un
 * despacho anterior a la producción que salió en él, es un imposible físico —
 * y es de lo primero que cruza un fiscalizador cuando revisa el libro contra
 * las guías. Hasta acá el radar dibujaba esas cadenas como perfectamente sanas.
 *
 * También mide la PERMANENCIA (días entre el ingreso de la troza y su salida
 * como producto): una madera que entró hace 8 meses y sigue sin despacharse es
 * capital parado, y una que entra y sale el mismo día suele ser un registro
 * hecho a posteriori.
 *
 * Fechas date-only (`entryDate`): se comparan por día UTC, nunca con la hora
 * local — en Lima (UTC−5) un `new Date(iso).getDate()` devuelve el día anterior.
 *
 * PURO y client-safe.
 */

import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

/** Permanencia a partir de la cual la madera "duerme" en planta. */
export const PERMANENCIA_LARGA_DIAS = 180;

export type AnomaliaTipo = "produccion_antes_del_ingreso" | "despacho_antes_de_produccion";

export interface AnomaliaTiempo {
  tipo: AnomaliaTipo;
  /** Nodo que hay que corregir (el de fecha imposible). */
  nodoId: string;
  /** Nodo con el que se contradice. */
  contraId: string;
  etiqueta: string;
  detalle: string;
  /** Días de desfase (siempre > 0). */
  dias: number;
}

export interface Permanencia {
  ingresoId: string;
  etiqueta: string;
  /** Días entre el ingreso y el ÚLTIMO despacho de su cadena. */
  dias: number;
  /** true si la madera todavía no salió (se mide contra `hoy`). */
  abierta: boolean;
}

export interface AnalisisTiempo {
  anomalias: AnomaliaTiempo[];
  permanencias: Permanencia[];
  /** Ingresos parados hace más de `PERMANENCIA_LARGA_DIAS`. */
  dormidos: Permanencia[];
  /** Extremos del período dibujado, para el eje de la línea de tiempo. */
  desde: string | null;
  hasta: string | null;
  permanenciaMediaDias: number | null;
}

const MS_DIA = 86_400_000;

/** Día UTC como entero (evita el off-by-one de Lima en fechas date-only). */
export function diaUtc(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / MS_DIA) : null;
}

/** Fecha corta legible («14 jul»), siempre en UTC. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Cruza las fechas de la cadena contra su dirección física.
 *
 * `hoy` entra por parámetro (no `Date.now()`): así el resultado es determinista
 * y testeable, y el componente decide qué "hoy" usar.
 */
export function analizarTiempo(g: TrazaGrafo, hoy: Date): AnalisisTiempo {
  const ing = new Map(g.ingresos.map((w) => [w.id, w]));
  const cor = new Map(g.corridas.map((c) => [c.id, c]));
  const des = new Map(g.despachos.map((d) => [d.id, d]));

  const anomalias: AnomaliaTiempo[] = [];

  // Una corrida no puede ser anterior a la GTF que la surtió.
  for (const c of g.consumos) {
    const w = ing.get(c.from);
    const k = cor.get(c.to);
    if (!w || !k) continue;
    const dw = diaUtc(w.fecha);
    const dk = diaUtc(k.fecha);
    if (dw == null || dk == null || dk >= dw) continue;
    anomalias.push({
      tipo: "produccion_antes_del_ingreso",
      nodoId: k.id,
      contraId: w.id,
      etiqueta: `Corrida #${k.lineNo}`,
      detalle: `producida el ${fechaCorta(k.fecha)}, pero la GTF ${w.gtf || "—"} que la surtió ingresó el ${fechaCorta(w.fecha)}`,
      dias: dw - dk,
    });
  }

  // Un despacho no puede ser anterior a la corrida que salió en él.
  for (const o of g.origenes) {
    const k = cor.get(o.from);
    const d = des.get(o.to);
    if (!k || !d) continue;
    const dk = diaUtc(k.fecha);
    const dd = diaUtc(d.fecha);
    if (dk == null || dd == null || dd >= dk) continue;
    anomalias.push({
      tipo: "despacho_antes_de_produccion",
      nodoId: d.id,
      contraId: k.id,
      etiqueta: `Despacho #${d.lineNo}`,
      detalle: `despachado el ${fechaCorta(d.fecha)}, pero la corrida #${k.lineNo} que salió en él se produjo el ${fechaCorta(k.fecha)}`,
      dias: dk - dd,
    });
  }
  anomalias.sort((a, b) => b.dias - a.dias);

  // Permanencia: del ingreso hasta el último despacho al que llega su cadena.
  const corridasDeIngreso = new Map<string, Set<string>>();
  for (const c of g.consumos) {
    const s = corridasDeIngreso.get(c.from) ?? new Set<string>();
    s.add(c.to);
    corridasDeIngreso.set(c.from, s);
  }
  const despachosDeCorrida = new Map<string, Set<string>>();
  for (const o of g.origenes) {
    const s = despachosDeCorrida.get(o.from) ?? new Set<string>();
    s.add(o.to);
    despachosDeCorrida.set(o.from, s);
  }

  const hoyDia = Math.floor(hoy.getTime() / MS_DIA);
  const permanencias: Permanencia[] = [];
  for (const w of g.ingresos) {
    const d0 = diaUtc(w.fecha);
    if (d0 == null) continue;
    let ultimo: number | null = null;
    for (const cid of corridasDeIngreso.get(w.id) ?? []) {
      for (const did of despachosDeCorrida.get(cid) ?? []) {
        const dd = des.get(did) ? diaUtc(des.get(did)!.fecha) : null;
        if (dd != null && (ultimo == null || dd > ultimo)) ultimo = dd;
      }
    }
    const abierta = ultimo == null;
    // Sin salida todavía, la permanencia se cuenta contra hoy: es lo que lleva
    // esperando, no un cero.
    const dias = Math.max(0, (abierta ? hoyDia : ultimo!) - d0);
    permanencias.push({ ingresoId: w.id, etiqueta: `GTF ${w.gtf || "—"}`, dias, abierta });
  }

  const fechas = [
    ...g.ingresos.map((w) => w.fecha),
    ...g.corridas.map((c) => c.fecha),
    ...g.despachos.map((d) => d.fecha),
  ].filter((f) => diaUtc(f) != null).sort();

  const cerradas = permanencias.filter((p) => !p.abierta);
  return {
    anomalias,
    permanencias,
    dormidos: permanencias.filter((p) => p.abierta && p.dias >= PERMANENCIA_LARGA_DIAS).sort((a, b) => b.dias - a.dias),
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
    permanenciaMediaDias: cerradas.length
      ? Math.round(cerradas.reduce((s, p) => s + p.dias, 0) / cerradas.length)
      : null,
  };
}

/** Posición 0–1 de una fecha dentro del período (para el eje temporal). */
export function posicionEnEje(iso: string, desde: string | null, hasta: string | null): number | null {
  const d = diaUtc(iso);
  const a = desde ? diaUtc(desde) : null;
  const b = hasta ? diaUtc(hasta) : null;
  if (d == null || a == null || b == null) return null;
  if (b <= a) return 0.5; // todo el período en un mismo día: al centro
  return Math.min(1, Math.max(0, (d - a) / (b - a)));
}
