/**
 * ForestLothChequeoDB — lo que el chequeo avanzado del Libro TH lee y las
 * otras lecturas no traen (26-10, Cumplimiento › Chequeo):
 *
 *   · `guias`          — todas las GTF con su plan y su transporte (columnas
 *                        o, si están vacías, el `gtfDatos.vehiculo` del formato).
 *   · `censoDeArboles` — los árboles del censo con el código de alguna tala,
 *                        con o sin UTM.
 *   · `planesConCenso` — qué planes tienen censo cargado (sin censo no se juzga).
 *   · `avisadosPorCorreo` / `guardarAvisadosPorCorreo` — lo que el correo del
 *                        chequeo ya avisó (PlatformSetting
 *                        `loth-chequeo-avisados:<tenantId>`, sin schema).
 *
 * Las lecturas del chequeo ni escriben ni invalidan; el registro del correo se
 * escribe bajo el candado de `PlatformSettingsDB.actualizar`. `tenantId`
 * primero, sin fallback.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import type { ArbolCensoChequeo, GuiaChequeo } from "@/lib/forestal/loth-chequeo-tipos";
import { claveAvisadosChequeo, leerRegistroAvisados, type RegistroAvisados } from "@/lib/forestal/loth-chequeo-correo";

/** Techo de lectura: un libro real anda en cientos (el mismo orden que el aviso de plazos). */
const LIMITE = 20_000;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** El vehículo del formato de la guía (`gtfDatosSchema.vehiculo`), si lo trae. */
function vehiculoDe(gtfDatos: unknown): { placa: string | null; conductor: string | null; licencia: string | null } {
  const v = gtfDatos && typeof gtfDatos === "object" ? (gtfDatos as { vehiculo?: unknown }).vehiculo : null;
  if (!v || typeof v !== "object") return { placa: null, conductor: null, licencia: null };
  const o = v as Record<string, unknown>;
  /* Por río la guía lleva la matrícula de la embarcación en `placa` (o su nombre). */
  return { placa: texto(o.placa) ?? texto(o.embarcacion), conductor: texto(o.conductor), licencia: texto(o.licencia) };
}

const claveFecha = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const ForestLothChequeoDB = {
  async guias(tenantId: string): Promise<GuiaChequeo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, gtfNumber: true, gtfDate: true, tipo: true, status: true, planId: true,
        placaVehiculo: true, conductor: true, conductorLicencia: true, gtfDatos: true,
      },
      take: LIMITE,
    });
    return filas.map((g) => {
      const v = vehiculoDe(g.gtfDatos);
      return {
        id: g.id,
        gtfNumber: g.gtfNumber,
        fecha: claveFecha(g.gtfDate),
        tipo: g.tipo,
        status: g.status,
        planId: g.planId,
        placa: texto(g.placaVehiculo) ?? v.placa,
        conductor: texto(g.conductor) ?? v.conductor,
        licencia: texto(g.conductorLicencia) ?? v.licencia,
      };
    });
  },

  /** Los árboles del censo de esos planes con alguno de esos códigos (los talados). */
  async censoDeArboles(tenantId: string, planIds: readonly string[], treeCodes: readonly string[]): Promise<ArbolCensoChequeo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigos = [...new Set(treeCodes.map((c) => c.trim()).filter(Boolean))];
    if (planIds.length === 0 || codigos.length === 0) return [];
    const filas = await prisma.forestCensusTree.findMany({
      where: { tenantId, planId: { in: [...planIds] }, treeCode: { in: codigos }, deletedAt: null },
      select: { planId: true, treeCode: true, utmX: true, utmY: true },
      take: LIMITE,
    });
    return filas.map((a) => ({ planId: a.planId, treeCode: a.treeCode, conCoordenadas: a.utmX != null && a.utmY != null }));
  },

  /** Los planes (de esos) que tienen al menos un árbol en el censo. */
  async planesConCenso(tenantId: string, planIds: readonly string[]): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    if (planIds.length === 0) return new Set();
    /* `groupBy` agrupa en la base: `distinct` de Prisma trae todo el censo y deduplica en memoria. */
    const filas = await prisma.forestCensusTree.groupBy({
      by: ["planId"],
      where: { tenantId, planId: { in: [...planIds] }, deletedAt: null },
    });
    return new Set(filas.map((f) => f.planId));
  },

  /** Lo que el correo del chequeo ya avisó a este negocio (leído de la base, sin caché). */
  async avisadosPorCorreo(tenantId: string): Promise<RegistroAvisados> {
    if (!tenantId) throw new Error("tenantId is required");
    return leerRegistroAvisados(await PlatformSettingsDB.getFresco<unknown>(claveAvisadosChequeo(tenantId)));
  },

  /**
   * Lee-modifica-escribe el registro bajo candado: `cambio` recibe lo guardado
   * y devuelve lo nuevo, o `null` para no escribir. `true` = se escribió.
   */
  async guardarAvisadosPorCorreo(tenantId: string, cambio: (actual: RegistroAvisados) => RegistroAvisados | null): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, boolean>(claveAvisadosChequeo(tenantId), (actual) => {
      const valor = cambio(leerRegistroAvisados(actual));
      return valor ? { valor, resultado: true } : { resultado: false };
    });
  },
};
