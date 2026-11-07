/**
 * conteo-patio-pasos.ts — «Contar el patio» como recorrido guiado de tres
 * pasos, pensado para el celular (Brandon 2026-10-05: «fin de mes, 15 minutos
 * y tienes el acta lista para OSINFOR»):
 *
 *   1. Etiquetas — cuántas piezas del patio no tienen su QR: imprimirlas o
 *      seguir sin ellas (se cuenta tipeando el código pintado).
 *   2. Recorrer  — escanear la pila; «8 de 13 encontradas».
 *   3. Acta      — faltan (con su cancha y sus días), sobran y encontradas.
 *
 * El conteo en sí (`conteo-patio.ts`) no cambia: esto decide en qué paso está
 * la pantalla y arma los datos que el paso muestra. PURO y client-safe.
 */
import type { TrozaConsumible } from "./consumo-trozas";
import type { ConteoPatio, TrozaDelConteo } from "./conteo-patio";

export type PasoConteo = 1 | 2 | 3;

export const PASOS_DEL_CONTEO: readonly { paso: PasoConteo; titulo: string }[] = [
  { paso: 1, titulo: "Etiquetas" },
  { paso: 2, titulo: "Recorrer" },
  { paso: 3, titulo: "Acta" },
];

export interface EtiquetasDelPatio {
  /** Piezas que se esperan encontrar (las del patio). */
  esperadas: number;
  /** Las esperadas sin etiqueta QR impresa. Vacío si no se sabe. */
  sin: TrozaDelConteo[];
  /** `false` = la foto es anterior al dato (o vino sin él): no se afirma nada. */
  conocido: boolean;
}

export function etiquetasDelPatio(c: Pick<ConteoPatio, "trozas">): EtiquetasDelPatio {
  const esperadas = c.trozas.filter((t) => t.motivo === null);
  const conocido = esperadas.every((t) => typeof t.etiquetada === "boolean");
  return {
    esperadas: esperadas.length,
    sin: conocido ? esperadas.filter((t) => t.etiquetada === false) : [],
    conocido,
  };
}

/**
 * En qué paso está la pantalla.
 *  - Terminado → 3 (el acta), siempre.
 *  - Lo que eligió la persona (volver a «Etiquetas» o «Seguir sin etiquetas»).
 *  - Ya escaneó algo → 2: recargar no la devuelve al principio.
 *  - Si no: hay piezas sin etiqueta → 1; si todas tienen (o no se sabe) → 2.
 */
export function pasoDelConteo(
  c: Pick<ConteoPatio, "trozas" | "lecturas" | "terminadoEn">,
  elegido: Exclude<PasoConteo, 3> | null,
): PasoConteo {
  if (c.terminadoEn) return 3;
  if (elegido) return elegido;
  if (c.lecturas.length > 0) return 2;
  const e = etiquetasDelPatio(c);
  return e.conocido && e.sin.length > 0 ? 1 : 2;
}

const DIA_MS = 86_400_000;
const diaUtc = (aaaaMmDd: string) => Date.parse(`${aaaaMmDd.slice(0, 10)}T00:00:00Z`);

/** Días que la pieza llevaba en el patio el día del conteo (por día, nunca por hora). */
export function diasEnElPatio(t: Pick<TrozaDelConteo, "desde">, fecha: string): number | null {
  if (!t.desde) return null;
  const desde = diaUtc(t.desde);
  const hoy = diaUtc(fecha);
  if (!Number.isFinite(desde) || !Number.isFinite(hoy)) return null;
  return Math.max(0, Math.round((hoy - desde) / DIA_MS));
}

/** «12 días», «1 día», «llegó hoy»; `null` sin fecha. */
export function textoDias(d: number | null): string | null {
  if (d == null) return null;
  if (d === 0) return "llegó hoy";
  return d === 1 ? "1 día" : `${d} días`;
}

/**
 * El nombre de la cancha donde está la pieza. `canchas` = `zonaId → nombre`
 * del Mapa de Planta; `zonaId` lo agrega `/trozas/patio` a cada pieza.
 */
export function canchaDe(
  t: Pick<TrozaConsumible, "id"> & { zonaId?: string | null },
  canchas: Readonly<Record<string, string>>,
): string | null {
  return (t.zonaId && canchas[t.zonaId]) || null;
}

/** El nombre corto de una zona del Mapa de Planta: su nombre o, si no tiene, su código. */
export function nombreDeCancha(z: { codigo?: string | null; nombre?: string | null }): string {
  return z.nombre?.trim() || z.codigo?.trim() || "Cancha sin nombre";
}

/** La ruta que abre «Contar el patio» directo, en el modo patio. */
export const RUTA_CONTAR_EL_PATIO = "/admin/patio";

export function urlContarElPatio(volver?: string | null): string {
  const q = new URLSearchParams({ contar: "1" });
  if (volver) q.set("volver", volver);
  return `${RUTA_CONTAR_EL_PATIO}?${q.toString()}`;
}

/**
 * A dónde volver al salir del conteo: SÓLO una ruta del panel. Un
 * `?volver=//otro.sitio` o `https://…` no se sigue (sería una redirección
 * abierta desde una pantalla con sesión).
 */
export function volverSeguro(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!/^\/admin(\/|\?|$)/.test(v) || /[\\\s]/.test(v)) return null;
  return v;
}
