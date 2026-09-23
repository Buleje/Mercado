/**
 * La libreta de «Producir sin lote» y los precios de venta recordados (ADR-429).
 *
 * ## Vaciar la libreta al registrar
 *
 * Lo cubicado vive en el `localStorage` del espacio `-ctp-produccion` (lo
 * escribe `CubicadorMadera`) y antes seguía ahí DESPUÉS de registrar: reabrir el
 * modal mostraba las mismas piezas listas para declararlas —y cobrarlas— otra
 * vez. Medido en el ADR: es el camino del doble cobro. Registrar ahora la vacía.
 *
 * La clave se arma igual que en `CubicadorMadera` (`buleje-cubicacion-{slug}{espacio}`,
 * el slug al medio): si divergen, el vaciado borra una clave que nadie lee y
 * el doble cobro vuelve callado. El test de la pantalla lo cubre.
 *
 * ## Precio de venta recordado
 *
 * Madera propia: el precio por especie que se usó la última vez se ofrece como
 * sugerido (ADR-418 rechazó un catálogo de precios de venta). Se ofrece, no se
 * escribe solo: un precio que nadie tipeó no puede terminar valorizando nada.
 */
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { logger } from "@/lib/logger";

/** El espacio propio del cubicador de «Producir sin lote» — otra libreta, la misma pantalla. */
export const ESPACIO_PRODUCCION = "-ctp-produccion";

const slug = (): string => {
  try {
    return localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    return "main";
  }
};

/** La misma clave que `CubicadorMadera` usa para las filas de este espacio. */
export const claveLibretaProduccion = (): string =>
  `buleje-cubicacion-${slug()}${ESPACIO_PRODUCCION}`;

/**
 * Borra las filas cubicadas y sus apartados (que apuntan a ids de esas filas).
 * Las preferencias del espacio —columnas, orden, dueños, nombres de apartado—
 * quedan: son de quien cubica, no de la jornada que se acaba de declarar.
 */
export function vaciarLibretaProduccion(): void {
  if (typeof window === "undefined") return;
  const clave = claveLibretaProduccion();
  try {
    localStorage.removeItem(clave);
    localStorage.removeItem(`${clave}-apartados`);
  } catch (err) {
    /* Si esto falla la producción YA quedó registrada; lo que queda en riesgo
       es declararla dos veces al reabrir, así que se deja rastro. */
    logger.warn("[declarar-produccion] no se pudo vaciar la libreta", { error: String(err) });
  }
}

const clavePrecios = (): string => `buleje-precio-venta-pt-${slug()}`;

/** Último precio de venta usado, S/ por PT, por clave de especie. */
export function preciosDeVentaRecordados(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(clavePrecios());
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Guarda los precios que SÍ se usaron; los que quedaron sin precio no pisan el anterior. */
export function recordarPreciosDeVenta(
  precios: readonly { especie: string; precioPt: number | null }[],
): void {
  if (typeof window === "undefined") return;
  const previos = preciosDeVentaRecordados();
  for (const p of precios) {
    const k = claveEspecie(p.especie);
    if (k && p.precioPt != null && p.precioPt > 0) previos[k] = p.precioPt;
  }
  try {
    localStorage.setItem(clavePrecios(), JSON.stringify(previos));
  } catch (err) {
    logger.warn("[declarar-produccion] no se pudo recordar el precio de venta", {
      error: String(err),
    });
  }
}
