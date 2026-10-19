import "server-only";
import { SettingsDB } from "@/lib/db/settings.db";
import { leerMargenesRebajas, type MargenesRebajas } from "./margenes-rebajas";
import { chequearPiso, textoBajoPiso, type AvisoBajoPiso } from "./piso";

/**
 * El piso sobre el costo y el margen mínimo que el negocio puso en Ajustes
 * (`featureFlagsJson.margenesRebajas`); sin nada guardado, 5 % y 15 %.
 * (Liviano a propósito: las rutas de precio no cargan la lectura de rebajas.)
 */
export async function leerMargenesDelNegocio(tenantId: string): Promise<MargenesRebajas> {
  return leerMargenesRebajas(await SettingsDB.getFeatureFlags(tenantId));
}

/** Un precio que se va a guardar: lo de hoy y lo nuevo, leídos por la RUTA (nunca del cliente). */
export interface CambioDePrecio {
  productId: number;
  nombre: string;
  precioActual: number;
  precioNuevo: number;
  /** El costo que queda tras guardar; null = sin costo (pasa). */
  costo: number | null;
}

/**
 * Los cambios que bajan el precio por debajo del piso del negocio. Sólo lee
 * Ajustes si alguno BAJA con costo conocido: una edición que no toca el precio
 * (nombre, stock, imagen) no paga la lectura.
 */
export async function revisarPisoDePrecios(
  tenantId: string,
  cambios: CambioDePrecio[],
): Promise<{ pisoSobreCosto: number; avisos: AvisoBajoPiso[] }> {
  const candidatos = cambios.filter((c) => c.costo != null && c.costo > 0 && c.precioNuevo < c.precioActual);
  if (candidatos.length === 0) return { pisoSobreCosto: 0, avisos: [] };
  const { pisoSobreCosto } = await leerMargenesDelNegocio(tenantId);
  const avisos: AvisoBajoPiso[] = [];
  for (const c of candidatos) {
    const r = chequearPiso({ precioActual: c.precioActual, precioNuevo: c.precioNuevo, costo: c.costo, pisoSobreCosto });
    if (r.ok) continue;
    avisos.push({
      productId: c.productId,
      nombre: c.nombre,
      precioActual: c.precioActual,
      precioNuevo: c.precioNuevo,
      costo: c.costo as number,
      piso: r.piso,
      mensaje: textoBajoPiso(c.nombre, r.piso, pisoSobreCosto),
    });
  }
  return { pisoSobreCosto, avisos };
}
