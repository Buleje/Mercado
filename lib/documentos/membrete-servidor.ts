import "server-only";
import { MembreteDB } from "@/lib/db/membrete.db";
import { logger } from "@/lib/logger";
import type { MembreteDocumento } from "@/lib/documentos/membrete-pdf";
import type { LogoServidor } from "@/lib/documentos/membrete-pdflib";

/**
 * El membrete del negocio + su logo en PNG para un PDF que se arma en el
 * servidor (pdf-lib). Nunca falla por el logo: sin logo, sale el monograma.
 */
export async function membreteParaPdf(tenantId: string): Promise<{ membrete: MembreteDocumento; logo: LogoServidor | null }> {
  const [membrete, png] = await Promise.all([
    MembreteDB.del(tenantId),
    MembreteDB.logoPng(tenantId).catch((err) => {
      logger.warn("[documentos] el logo no se pudo preparar: sale el monograma", { error: String(err) });
      return null;
    }),
  ]);
  return { membrete, logo: png ? { bytes: png.bytes, ancho: png.ancho, alto: png.alto } : null };
}
