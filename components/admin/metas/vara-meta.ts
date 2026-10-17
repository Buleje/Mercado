/**
 * components/admin/metas/vara-meta.ts — la vara de una meta: lo que dio el
 * período ANTERIOR entero (`AnteriorMetaDTO`, medido en el servidor).
 *
 * Responde «¿mi objetivo es realista?» con datos, no con una regla inventada:
 * la tarjeta dice «Setiembre: S/ 24,100 · meta +24 %» y el modal propone el
 * objetivo («Como setiembre», «+10 %», «+20 %»). Es exclusivo de la vista
 * Metas: Hoy compara a esta hora y Calendario al mismo día del mes, nunca el
 * período entero contra el objetivo.
 */
import type { AnteriorMetaDTO } from "@/lib/admin/metas-catalogo";
import { DIAS_SEMANA, MESES, type SentidoMeta } from "@/lib/admin/metas-periodo";
import type { PeriodoMeta } from "@/lib/admin/metas-tareas";
import type { TonoMeta } from "./clases-meta";
import { cifraDeMeta, esConteo } from "./formato-meta";

const anioDe = (f: string) => Number(f.slice(0, 4));

/** «el sábado pasado», «la semana pasada», «setiembre», «diciembre 2025», «el trimestre pasado», «2025». */
export function nombreDelAnterior(period: PeriodoMeta, anterior: Pick<AnteriorMetaDTO, "desde">, hoy: string): string {
  const { desde } = anterior;
  switch (period) {
    case "diario":
      return `el ${DIAS_SEMANA[new Date(`${desde}T00:00:00Z`).getUTCDay()]} pasado`;
    case "semanal":
      return "la semana pasada";
    case "mensual": {
      const mes = MESES[Number(desde.slice(5, 7)) - 1] ?? "";
      return anioDe(desde) === anioDe(hoy) ? mes : `${mes} ${anioDe(desde)}`;
    }
    case "trimestral":
      return "el trimestre pasado";
    case "anual":
      return String(anioDe(desde));
  }
}

const mayuscula = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);
/** La comparación no se parte a media línea («meta +9» arriba y «%» abajo, medido a 1280). */
const junto = (t: string) => t.replace(/ /g, "\u00a0");

export interface DatosVara {
  anterior: AnteriorMetaDTO | undefined;
  period: PeriodoMeta;
  hoy: string;
  target: number;
  /** Lo que lleva este período (`null` sin dato). */
  avance: number | null;
  sentido: SentidoMeta;
  unidad: string;
}

/**
 * UNA línea: «Setiembre: S/ 24,100 · meta +24 %». Si este período ya pasó al
 * anterior lo dice («ya lo superaste»; en un tope, «ya gastaste más»). Sin
 * dato del anterior no hay línea (nunca un 0 de relleno).
 */
export function lineaVara(d: DatosVara): { texto: string; tono: TonoMeta } | null {
  const a = d.anterior;
  if (!a || a.avance === null || !Number.isFinite(a.avance)) return null;
  const base = `${mayuscula(nombreDelAnterior(d.period, a, d.hoy))}: ${cifraDeMeta(a.avance, d.unidad)}`;
  if (a.avance <= 0) return { texto: base, tono: "neutro" };
  if (d.avance !== null && d.avance >= a.avance) {
    return d.sentido === "baja"
      ? { texto: `${base} · ${junto("ya lo pasaste")}`, tono: "aviso" }
      : { texto: `${base} · ${junto("ya lo superaste")}`, tono: "exito" };
  }
  const pct = Math.round((d.target / a.avance - 1) * 100);
  const palabra = d.sentido === "baja" ? "tope" : "meta";
  if (pct === 0) return { texto: `${base} · ${junto(`tu ${palabra} es igual`)}`, tono: "neutro" };
  return { texto: `${base} · ${junto(`${palabra} ${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`)}`, tono: "neutro" };
}

/** Un objetivo redondo en la unidad del negocio: S/ a la centena (o decena), conteos enteros, m³ a un decimal. */
export function redondearObjetivo(v: number, unidad: string): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (esConteo(unidad)) return Math.max(1, Math.round(v));
  if (unidad === "S/") return v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
  if (unidad === "PT") return Math.max(10, Math.round(v / 10) * 10);
  if (unidad === "%") return Math.min(100, Math.round(v));
  if (unidad === "m³") return Math.max(0.1, Math.round(v * 10) / 10);
  return Math.round(v * 100) / 100;
}

export interface Sugerencia {
  etiqueta: string;
  valor: number;
}

/**
 * Tres objetivos para elegir con un toque: lo mismo que el período anterior y
 * un 10 % y un 20 % más (en un tope, menos). Sin anterior o en 0, ninguna.
 */
export function sugerencias(anterior: AnteriorMetaDTO | undefined, unidad: string, sentido: SentidoMeta): Sugerencia[] {
  if (!anterior || anterior.avance === null || !(anterior.avance > 0)) return [];
  const signo = sentido === "baja" ? -1 : 1;
  const lista: Sugerencia[] = [
    { etiqueta: "Igual", valor: redondearObjetivo(anterior.avance, unidad) },
    { etiqueta: `${signo > 0 ? "+" : "−"}10 %`, valor: redondearObjetivo(anterior.avance * (1 + signo * 0.1), unidad) },
    { etiqueta: `${signo > 0 ? "+" : "−"}20 %`, valor: redondearObjetivo(anterior.avance * (1 + signo * 0.2), unidad) },
  ];
  return lista.filter((s, i) => s.valor > 0 && lista.findIndex((o) => o.valor === s.valor) === i);
}
