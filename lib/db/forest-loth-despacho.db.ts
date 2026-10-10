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
  medidasDeLinea,
  type TrozadoCandidato,
} from "@/lib/forestal/loth-despacho-medidas";
import type { TrozadoDelDespacho } from "@/lib/forestal/loth-constants";

/**
 * Códigos por consulta (`IN` de Postgres). Lo que pase se pide de a tandas
 * ACÁ, no en cada llamador: los indicadores (`m3Despachado`) y el Excel llevan
 * el libro entero y lo que pasaba del tope salía sin medidas, sumando 0.
 */
export const TANDA_CODIGOS = 2000;

/** Lo que la lista pública de una guía (`/verificar/guia/<id>`) muestra: origen y medidas, nunca personas ni plata. */
export interface GuiaPublicaLoth {
  gtfNumber: string;
  /** `YYYY-MM-DD` del primer despacho de la guía. */
  fecha: string | null;
  /** Todas sus líneas están anuladas. */
  anulada: boolean;
  plan: {
    planType: string | null;
    planNumber: string | null;
    titularName: string;
    tituloHabilitante: string | null;
    resolucionNumber: string | null;
    region: string | null;
    arffs: string | null;
  } | null;
  trozas: {
    codigo: string;
    especie: string | null;
    cientifico: string | null;
    cites: boolean;
    d1: number | null;
    d2: number | null;
    largo: number | null;
    m3: number | null;
  }[];
  /** m³ de las trozas con medida (4 decimales); las sin medida no suman. */
  totalM3: number;
  sinMedida: number;
}

const num = (v: string | null): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const dec = (v: { toString(): string } | null): string | null => (v == null ? null : String(v));

export class ForestLothDespachoDB {
  /**
   * Las líneas de trozado (vivas, vigentes o anuladas) de esos códigos, de
   * cualquier permiso: la elección por permiso se hace después, en puro.
   */
  static async trozadosDeCodigos(tenantId: string, codigos: readonly string[]): Promise<TrozadoCandidato[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const codes = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (codes.length === 0) return [];
    let todos: TrozadoCandidato[] = [];
    for (let i = 0; i < codes.length; i += TANDA_CODIGOS) {
      todos = todos.concat(await ForestLothDespachoDB.trozadosDeTanda(tenantId, codes.slice(i, i + TANDA_CODIGOS)));
    }
    return todos;
  }

  private static async trozadosDeTanda(tenantId: string, codes: string[]): Promise<TrozadoCandidato[]> {
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

  /**
   * La guía del Libro TH a la que pertenece una línea de despacho (el QR de la
   * hoja de despacho lleva el id de una de sus líneas, no el N°: el N° se
   * repite entre talonarios y lleva guiones). Sus trozas vigentes con las
   * medidas de SU trozado (misma elección que la vista «Por guía»). Sólo
   * origen legal: sin DNI, teléfonos, placa ni plata.
   */
  static async guiaPublica(tenantId: string, lineaId: string): Promise<GuiaPublicaLoth | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const ancla = await prisma.forestLothEntry.findFirst({
      where: { tenantId, id: lineaId, section: "despacho_troza", deletedAt: null },
      select: { planId: true, gtfNumber: true },
    });
    const gtfNumber = ancla?.gtfNumber?.trim();
    if (!ancla || !gtfNumber) return null;
    const lineas = await prisma.forestLothEntry.findMany({
      where: { tenantId, section: "despacho_troza", deletedAt: null, gtfNumber, planId: ancla.planId },
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      select: {
        section: true, status: true, entryDate: true, planId: true, trozaCode: true, treeCode: true,
        speciesCommon: true, speciesScientific: true, cites: true,
        diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true,
      },
    });
    if (lineas.length === 0) return null;
    const vigentes = lineas.filter((l) => l.status === "registrado");
    const [conMedidas, plan] = await Promise.all([
      ForestLothDespachoDB.conTrozado(tenantId, vigentes),
      ancla.planId
        ? prisma.forestPlan.findFirst({
            where: { tenantId, id: ancla.planId, deletedAt: null },
            select: { planType: true, planNumber: true, titularName: true, tituloHabilitante: true, resolucionNumber: true, region: true, arffs: true },
          })
        : null,
    ]);
    const trozas = conMedidas.map((l) => {
      const md = medidasDeLinea({
        speciesCommon: l.speciesCommon,
        speciesScientific: l.speciesScientific,
        cites: l.cites,
        treeCode: l.treeCode,
        diamMayorM: dec(l.diamMayorM),
        diamMenorM: dec(l.diamMenorM),
        lengthM: dec(l.lengthM),
        volumeM3: dec(l.volumeM3),
        trozado: l.trozado ?? null,
      });
      return {
        codigo: l.trozaCode?.trim() || "—",
        especie: md.especie,
        cientifico: md.cientifico,
        cites: md.cites,
        d1: num(md.d1),
        d2: num(md.d2),
        largo: num(md.largo),
        m3: num(md.m3),
      };
    });
    const total = trozas.reduce((a, t) => a + (t.m3 ?? 0), 0);
    return {
      gtfNumber,
      fecha: (vigentes[0] ?? lineas[0])?.entryDate.toISOString().slice(0, 10) ?? null,
      anulada: vigentes.length === 0,
      plan,
      trozas,
      totalM3: Math.round(total * 10000) / 10000,
      sinMedida: trozas.filter((t) => t.m3 == null).length,
    };
  }
}
