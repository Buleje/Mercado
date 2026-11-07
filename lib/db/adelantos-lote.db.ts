import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { detalleDelControl, instanteDeVencimiento } from "@/lib/adelantos/control-edicion";
import { limaDateKey } from "@/lib/utils";
import { repartirLote, type MotivoOmitido } from "@/lib/adelantos/fecha-cobro-lote";

/**
 * Fecha de cobro en lote (Cobranza). Aparte de `adelantos.db.ts`: un acto chico
 * que no mueve plata ni caja, solo cambia qué se le reclama a quién y cuándo.
 *
 * Sin `FOR UPDATE` por fila (son hasta 200): el `updateMany` lleva `tenantId` y
 * `status: ABIERTO` en el WHERE, así que lo anulado entre la lectura y la
 * escritura no se toca ni de ajeno ni de cerrado.
 */
export interface FechaEnLoteHecha {
  actualizados: number;
  omitidos: Array<{ id: string; motivo: MotivoOmitido | "no_existe" }>;
}

export const AdelantosLoteDB = {
  async ponerFechaDeCobro(tenantId: string, ids: readonly string[], dia: string, usuario: string): Promise<FechaEnLoteHecha> {
    if (!tenantId) throw new Error("tenantId is required");
    const instante = instanteDeVencimiento(dia);
    if (!instante) throw new Error("fecha inválida");
    const unicos = [...new Set(ids)];

    const hecho = await prisma.$transaction(async (tx) => {
      /* `tenantId` en el WHERE: un id de otro negocio simplemente no aparece. Sólo DADO (ADR-448): lo recibido no se cobra, así que sale como «no se encontró». */
      const filas = await tx.adelanto.findMany({
        where: { id: { in: unicos }, tenantId, direccion: "DADO" },
        select: { id: true, status: true, direccion: true, modalidad: true, fechaAdelanto: true, fechaVencimiento: true, codigoOperacion: true },
      });
      const { aplicar, omitidos: o } = repartirLote(filas, dia);
      const omitidos: FechaEnLoteHecha["omitidos"] = [...o];
      const hallados = new Set(filas.map((f) => f.id));
      for (const id of unicos) if (!hallados.has(id)) omitidos.push({ id, motivo: "no_existe" });

      /* Los que ya tenían ESE día no se escriben ni dejan renglón. */
      const previa = new Map(filas.map((f) => [f.id, f] as const));
      const cambian = aplicar.filter((id) => limaDateKey(previa.get(id)?.fechaVencimiento ?? "") !== dia);

      let actualizados = 0;
      if (cambian.length > 0) {
        await tx.adelanto.updateMany({
          where: { id: { in: cambian }, tenantId, status: "ABIERTO", direccion: "DADO", modalidad: { not: "ENTREGAS_PACTADAS" } },
          data: { fechaVencimiento: instante },
        });
        /* Lo que de verdad cambió (algo pudo cerrarse entre la lectura y la escritura). */
        const tocados = await tx.adelanto.findMany({
          where: { id: { in: cambian }, tenantId, direccion: "DADO", fechaVencimiento: instante },
          select: { id: true },
        });
        actualizados = tocados.length;
        if (actualizados > 0) {
          /* Un renglón por adelanto, antes → después, igual que `adelantos-control.db`: así un lote mal puesto se deshace. */
          await tx.activityLog.createMany({
            data: tocados.map(({ id }) => {
              const antes = previa.get(id);
              const codigo = antes?.codigoOperacion ?? id;
              return {
                tenantId,
                action: "Fecha de cobro en lote",
                entity: "adelanto",
                entityId: id,
                user: usuario || "—",
                detail: detalleDelControl(
                  codigo,
                  { fechaVencimiento: antes?.fechaVencimiento ?? null, contrato: null },
                  { fechaVencimiento: instante, contrato: null },
                ),
              };
            }),
          });
        }
      }
      return { actualizados, omitidos };
    });

    if (hecho.actualizados > 0) {
      try {
        invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
      } catch (err) {
        logger.warn("[adelantos-lote.db] no se pudo invalidar la caché", { error: String(err), tenantId });
      }
    }
    return hecho;
  },
};
