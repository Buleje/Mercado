/**
 * Las cuentas del bloque «Costeo, estado y observaciones» del alta de un plan.
 *
 * Todo es VISTA PREVIA: el formulario no guarda ningún total; guarda los tres
 * costos por m³, la UIT, el estado y las observaciones tal como estaban.
 *
 * PURO: sin React ni fetch.
 */

import { diaConNombre } from "./plazo-de-apartado";

/**
 * La UIT (S/) de los años que el repo YA conoce. Una sola fuente hoy:
 * `lib/tax/obligaciones-peru.ts` («La UIT 2025 fue S/ 5,350»). La de 2026 no
 * está confirmada ahí, así que no va: el módulo no inventa cifras oficiales.
 * Para sumar un año, agregarlo acá con su fuente.
 */
export const UIT_POR_ANIO: Readonly<Record<number, number>> = { 2025: 5350 };

/** El año de una fecha `YYYY-MM-DD`, o `null` si no hay fecha. */
export function anioDe(fecha: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec((fecha ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** La UIT de ese año, si el repo la conoce. */
export function uitDelAnio(anio: number | null): number | null {
  return anio != null && Object.hasOwn(UIT_POR_ANIO, anio) ? UIT_POR_ANIO[anio] : null;
}

const numero = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Σ de los costos por m³ cargados. `null` si no hay ninguno. */
export function costoPorM3(valores: readonly string[]): { total: number; cargados: number } | null {
  const nums = valores.map(numero).filter((n): n is number => n != null);
  if (nums.length === 0) return null;
  return { total: Math.round(nums.reduce((a, n) => a + n, 0) * 100) / 100, cargados: nums.length };
}

/** Costo por m³ × volumen: el estimado del plan entero. `null` sin volumen. */
export function costoEstimado(totalPorM3: number, volumenM3: number | null): number | null {
  if (volumenM3 == null || !(volumenM3 > 0)) return null;
  return Math.round(totalPorM3 * volumenM3 * 100) / 100;
}

/** ¿La vigencia ya terminó y el plan sigue marcado «vigente»? (`hoy` = clave Lima). */
export function vencidoPeroVigente(estado: string, vigenciaHasta: string, hoy: string): boolean {
  const hasta = vigenciaHasta.trim().slice(0, 10);
  return estado === "vigente" && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && hasta < hoy;
}

/** «jueves 10/09», con el año si no es el de hoy («jueves 10/09/2027»). */
export function fechaConDia(iso: string, hoy: string): string {
  const d = diaConNombre(iso);
  return iso.slice(0, 4) === hoy.slice(0, 4) ? d : `${d}/${iso.slice(0, 4)}`;
}

/** Frases que se repiten en las observaciones de un plan. */
export const FRASES_OBSERVACION = [
  "Pendiente de aprobación ARFFS",
  "Con supervisión OSINFOR",
  "Observaciones de la ARFFS por subsanar",
  "Informe de ejecución presentado",
  "Falta el acta de asamblea comunal",
] as const;

export const MAX_OBSERVACIONES = 1000;

/**
 * Agrega una frase al final, en su propio renglón. `null` si ya está o si no
 * entra en el máximo: el chip se apaga en vez de cortar el texto.
 */
export function agregarFrase(notas: string, frase: string, max = MAX_OBSERVACIONES): string | null {
  if (notas.includes(frase)) return null;
  const base = notas.replace(/\s+$/, "");
  const nuevo = base ? `${base}\n${frase}` : frase;
  return nuevo.length <= max ? nuevo : null;
}
