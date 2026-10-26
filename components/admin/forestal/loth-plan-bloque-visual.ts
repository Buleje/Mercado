/**
 * Cómo se DIBUJA cada bloque en «Por bloque o zona» (Brandon 26-10: «que cada
 * cosa se diferencie»): su tono, su insignia, su estado en una palabra y los
 * tramos de la barra autorizado = usado + preliminar + saldo (+ lo que se pasa).
 *
 * Puro y sin cuentas propias: las cifras vienen del saldo del servidor
 * (`saldoPorBloques`); acá sólo se reparten en anchos.
 */

import type { EspecieEnElBloque, SaldoDelBloque } from "@/lib/forestal/loth-plan-bloques-saldo";

/**
 * Un tono por bloque, de los tokens de datos del DS y en el orden del reparto.
 * Sin rojo ni coral: ésos dicen «se pasa» y «preliminar». Vecinos bien
 * distintos (azul → violeta → verde azulado → magenta → índigo → verde azulado
 * hondo, que en oscuro sale claro); del 7.º en adelante se repiten y diferencia
 * la insignia con su número.
 */
export const TONOS_DE_BLOQUE = [
  "var(--data-6)",
  "var(--data-8)",
  "var(--data-5)",
  "color-mix(in oklab, var(--data-8) 50%, var(--data-7))",
  "color-mix(in oklab, var(--data-6) 50%, var(--data-8))",
  "color-mix(in oklab, var(--data-5) 55%, var(--data-1))",
] as const;

export const tonoDelBloque = (indice: number): string => TONOS_DE_BLOQUE[((indice % TONOS_DE_BLOQUE.length) + TONOS_DE_BLOQUE.length) % TONOS_DE_BLOQUE.length]!;

const PALABRAS_DE_RELLENO = new Set(["bloque", "zona", "parcela", "sector", "area", "área", "lote", "de", "del", "la", "el", "los", "las"]);

/** «Bloque 2» → «2»; «Zona Norte» → «N»; «Parcela Alta Baja» → «AB»; «Bloque A» → «A». */
export function insigniaDelBloque(nombre: string): string {
  const limpio = nombre.trim();
  const numero = limpio.match(/\d+/)?.[0];
  if (numero) return numero.length <= 3 ? numero : numero.slice(-3);
  const palabras = limpio.split(/\s+/).filter((p) => p && !PALABRAS_DE_RELLENO.has(p.toLowerCase()));
  if (palabras.length === 0) return limpio.slice(0, 2).toUpperCase() || "?";
  return palabras
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** El estado del bloque a primera vista: palabra + color. */
export type EstadoDelBloque = "se_pasa" | "preliminar" | "cuadra" | "sin_uso";

/** Medio litro de madera: debajo de eso no es «uso» (el mismo orden que la tolerancia del reparto). */
const CASI_CERO_M3 = 0.0005;

export function estadoDelBloque(s: Pick<SaldoDelBloque, "excede" | "total">): EstadoDelBloque {
  if (s.excede) return "se_pasa";
  if (s.total.pendienteM3 > CASI_CERO_M3) return "preliminar";
  if (s.total.usadoM3 > CASI_CERO_M3) return "cuadra";
  return "sin_uso";
}

export const ESTADO_DEL_BLOQUE: Record<EstadoDelBloque, { texto: string; variante: "error" | "warning" | "success" | "neutral" }> = {
  se_pasa: { texto: "Se pasa", variante: "error" },
  preliminar: { texto: "Preliminar pendiente", variante: "warning" },
  cuadra: { texto: "Cuadra", variante: "success" },
  sin_uso: { texto: "Sin uso", variante: "neutral" },
};

/** Cuántos bloques hay en cada estado, en el orden en que se leen (lo urgente primero). */
export function conteoDeEstados(bloques: readonly Pick<SaldoDelBloque, "excede" | "total">[]): { estado: EstadoDelBloque; n: number }[] {
  const n = new Map<EstadoDelBloque, number>();
  for (const b of bloques) {
    const e = estadoDelBloque(b);
    n.set(e, (n.get(e) ?? 0) + 1);
  }
  return (["se_pasa", "preliminar", "cuadra", "sin_uso"] as const).filter((e) => n.has(e)).map((e) => ({ estado: e, n: n.get(e)! }));
}

/** Los tramos de una barra, en m³. `escala` = el largo entero; `tope` = dónde cae lo autorizado (0-1). */
export interface TramosDeBarra {
  usado: number;
  preliminar: number;
  libre: number;
  pasa: number;
  escala: number;
  tope: number;
}

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * Autorizado = usado + preliminar + saldo libre. Lo que pasa lo autorizado va
 * aparte, en rojo y DESPUÉS del tope: la barra se alarga, no se recorta (un
 * exceso escondido dentro del 100 % es el que nadie ve). Sólo hay tramo rojo si
 * el servidor dice que se pasa (`excede`, con su tolerancia).
 */
export function tramosDeEspecie(e: Pick<EspecieEnElBloque, "autorizadoM3" | "usadoM3" | "pendienteM3" | "excede">): TramosDeBarra {
  const aut = Math.max(0, e.autorizadoM3);
  const usadoM3 = Math.max(0, e.usadoM3);
  const pendienteM3 = Math.max(0, e.pendienteM3);
  const usado = Math.min(usadoM3, aut);
  const preliminar = Math.min(pendienteM3, aut - usado);
  const libre = Math.max(0, aut - usadoM3 - pendienteM3);
  const pasa = e.excede ? Math.max(0, usadoM3 + pendienteM3 - aut) : 0;
  const escala = aut + pasa;
  return { usado: r3(usado), preliminar: r3(preliminar), libre: r3(libre), pasa: r3(pasa), escala: r3(escala), tope: escala > 0 ? aut / escala : 1 };
}

/** La barra del bloque entero = la suma de las de sus especies: lo que se pasa una no lo tapa lo libre de otra. */
export function tramosDelBloque(especies: readonly Pick<EspecieEnElBloque, "autorizadoM3" | "usadoM3" | "pendienteM3" | "excede">[]): TramosDeBarra {
  const t = { usado: 0, preliminar: 0, libre: 0, pasa: 0, aut: 0 };
  for (const e of especies) {
    const x = tramosDeEspecie(e);
    t.usado += x.usado;
    t.preliminar += x.preliminar;
    t.libre += x.libre;
    t.pasa += x.pasa;
    t.aut += Math.max(0, e.autorizadoM3);
  }
  const escala = t.aut + t.pasa;
  return { usado: r3(t.usado), preliminar: r3(t.preliminar), libre: r3(t.libre), pasa: r3(t.pasa), escala: r3(escala), tope: escala > 0 ? t.aut / escala : 1 };
}

/** El ancho de un tramo en % de la barra (0 si la barra está vacía). */
export const pct = (v: number, escala: number): number => (escala > 0 ? Math.max(0, Math.min(100, (v / escala) * 100)) : 0);

/** El id de la tarjeta de un bloque (el mapa de arriba salta a ella): «Bloque 2» → «bloque-del-plan-bloque-2». */
export function idDeBloque(nombre: string): string {
  const slug = nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `bloque-del-plan-${slug || "sin-nombre"}`;
}
