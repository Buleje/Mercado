/**
 * ForestLothDespachoDB — la lectura que le faltaba al Despacho de trozas del
 * Libro TH: las medidas de cada troza despachada salen de SU línea de trozado
 * (mismo permiso), no de la línea de despacho, que no las guarda (08-10).
 *
 * Sólo lee. La elección de la línea de trozado y la suma son puras
 * (`lib/forestal/loth-despacho-medidas`), las mismas que usa la tabla.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  codigosDespachados,
  conTrozado,
  m3DeDespachos,
  type TrozadoCandidato,
} from "@/lib/forestal/loth-despacho-medidas";
import type { TrozadoDelDespacho } from "@/lib/forestal/loth-constants";

/** Tope de códigos por consulta: una página del libro trae a lo más 500 líneas. */
const TOPE_CODIGOS = 2000;

export class ForestLothDespachoDB {
  /**
   * Las líneas de trozado (vivas, vigentes o anuladas) de esos códigos, de
   * cualquier permiso: la elección por permiso se hace después, en puro.
   */
  static async trozadosDeCodigos(tenantId: string, codigos: readonly string[]): Promise<TrozadoCandidato[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const codes = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))].slice(0, TOPE_CODIGOS);
    if (codes.length === 0) return [];
    return prisma.forestLothEntry.findMany({
      where: { tenantId, section: "trozado", deletedAt: null, trozaCode: { in: codes } },
      select: {
        id: true,
        planId: true,
        trozaCode: true,
        lineNo: true,
        status: true,
        createdAt: true,
        treeCode: true,
        speciesCommon: true,
        speciesScientific: true,
        cites: true,
        diamMayorM: true,
        diamMenorM: true,
        lengthM: true,
        volumeM3: true,
      },
    });
  }

  /** Cada línea de despacho de la lista con su `trozado`; las demás, tal cual. */
  static async conTrozado<T extends { section: string; planId: string | null; trozaCode: string | null }>(
    tenantId: string,
    entries: readonly T[],
  ): Promise<(T & { trozado?: TrozadoDelDespacho | null })[]> {
    const codigos = codigosDespachados(entries);
    if (codigos.length === 0) return [...entries];
    const candidatos = await ForestLothDespachoDB.trozadosDeCodigos(tenantId, codigos);
    return conTrozado(entries, candidatos);
  }

  /**
   * m³ despachado según el trozado de cada troza, para los indicadores
   * (`?stats=1`). `where` es el MISMO de `ForestLothDB.stats` (tenant, vivas,
   * registradas, carátula y permiso): cuenta lo mismo que cuenta la sección.
   */
  static async m3Despachado(tenantId: string, where: Prisma.ForestLothEntryWhereInput): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const despachos = await prisma.forestLothEntry.findMany({
      where: { AND: [where, { tenantId, section: "despacho_troza" }] },
      select: { planId: true, trozaCode: true },
    });
    if (despachos.length === 0) return 0;
    const candidatos = await ForestLothDespachoDB.trozadosDeCodigos(
      tenantId,
      despachos.map((d) => d.trozaCode ?? ""),
    );
    return m3DeDespachos(despachos, candidatos);
  }
}
