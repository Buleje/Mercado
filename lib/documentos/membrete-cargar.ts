/**
 * lib/documentos/membrete-cargar.ts — trae el membrete del negocio con el logo
 * ya listo para jsPDF. Sólo en el navegador: se llama al bajar un papel.
 *
 * El logo se sube en Ajustes › Negocio › Logo (`Settings.logoUrl`; si falta, el
 * del registro, `Tenant.logoUrl`). Puede ser webp (el de Blas lo es) y jsPDF no
 * lo lee: `logoParaPdf` lo pasa por un canvas a PNG con el lado mayor ≤ 600 px.
 * Si no carga a tiempo, pesa de más o es privado sin permiso, el papel sale con
 * el monograma: nunca se queda esperando ni falla por el logo.
 */

import { leerMembrete, logoParaPdf } from "@/lib/admin/membrete-cliente";
import type { LogoPdf } from "@/lib/admin/membrete";
import { logger } from "@/lib/logger";
import type { MembreteDocumento } from "./membrete-pdf";

/** Tope del logo ya convertido (data URL): 1,5 MB, para que un PNG enorme no infle cada recibo. */
export const TOPE_LOGO_BYTES = 1_500_000;
const ESPERA_LOGO_MS = 4_000;

/** El logo para el papel, o `null` (→ monograma) si no hay, tarda, pesa de más o no se pudo leer. */
/**
 * El logo para el papel, o `null` (→ monograma) si no hay, tarda, pesa de más o
 * no se pudo leer. Prueba las URLs en orden: primero el PNG que sirve el panel
 * (mismo sitio, sin CORS), después el original.
 */
export async function logoDelDocumento(...urls: (string | null | undefined)[]): Promise<LogoPdf | null> {
  const lista = [...new Set(urls.filter((u): u is string => !!u))];
  if (!lista.length) return null;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<null>((res) => {
    reloj = setTimeout(() => res(null), ESPERA_LOGO_MS);
  });
  const enOrden = async () => {
    for (const u of lista) {
      const l = await logoParaPdf(u);
      if (l && l.dataUrl.length <= TOPE_LOGO_BYTES) return l;
    }
    return null;
  };
  const logo = await Promise.race([enOrden(), tarde]).finally(() => clearTimeout(reloj));
  if (!logo) logger.warn("[documentos] el logo no cargó para el PDF: sale el monograma", { url: lista[0].slice(0, 80) });
  return logo;
}

/** Nombre, datos y logo del negocio de la sesión, listos para `datosDelMembrete`. */
export async function membreteDelDocumento(): Promise<MembreteDocumento> {
  const m: MembreteDocumento = await leerMembrete();
  return { ...m, logo: await logoDelDocumento(m.logoPngUrl, m.logoUrl) };
}
