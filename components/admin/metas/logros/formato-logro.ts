/**
 * components/admin/metas/logros/formato-logro.ts — cómo se dicen las cifras y
 * las fechas de «Logros»: «jueves 17/05» (con el año si no es el de hoy),
 * «Te faltan 80 ventas», «Te falta 1 día». Puro: sin React.
 */
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { diaConNombre } from "@/lib/forestal/arbol-de-troza";
import { formatNumber } from "@/lib/format";
import type { LogroDTO } from "@/lib/metas/logros-reglas";

/** «S/ 245», «38,2 m³», «80 ventas», «1 día» (`cifraDeMeta` no conoce «días»: 4 letras). */
export function cifraLogro(v: number, unidad: string): string {
  if (unidad === "días") return `${formatNumber(v, { max: 0 })} ${v === 1 ? "día" : "días"}`;
  if (unidad === "m³") return `${formatNumber(v, { max: 1 })} m³`;
  return cifraDeMeta(v, unidad);
}

/** «hoy», «ayer», «jueves 17/05» o «jueves 17/05/2025» si no es el año de `hoy`. */
export function fechaLogro(dia: string, hoy: string): string {
  if (dia === hoy) return "hoy";
  const ayer = new Date(`${hoy}T12:00:00.000Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (dia === ayer.toISOString().slice(0, 10)) return "ayer";
  const corto = diaConNombre(dia);
  return dia.slice(0, 4) === hoy.slice(0, 4) ? corto : `${corto}/${dia.slice(0, 4)}`;
}

/** «el jueves 17/05», «hoy», «ayer»: para «Ganado …» y «terminó …». */
export const elDia = (dia: string, hoy: string): string => {
  const f = fechaLogro(dia, hoy);
  return f === "hoy" || f === "ayer" ? f : `el ${f}`;
};

/** Cuánto falta para un logro con progreso; `null` si no se mide así. */
export function faltaLogro(logro: LogroDTO): string | null {
  const p = logro.progreso;
  if (!p || p.meta <= 0 || p.valor >= p.meta) return null;
  const falta = Math.round((p.meta - p.valor) * 100) / 100;
  const verbo = falta === 1 && p.unidad !== "S/" && p.unidad !== "m³" ? "Te falta" : "Te faltan";
  const cola = logro.id === "mejor-dia" ? " hoy para batir tu récord" : "";
  return `${verbo} ${cifraLogro(falta, p.unidad)}${cola}`;
}

/** 0-1: cuánto se avanzó (para ordenar y para la barra). */
export function avanceLogro(logro: LogroDTO): number {
  const p = logro.progreso;
  return p && p.meta > 0 ? Math.max(0, Math.min(1, p.valor / p.meta)) : 0;
}
