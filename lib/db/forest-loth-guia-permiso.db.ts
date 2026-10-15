/**
 * ForestLothGuiaPermisoDB — asignarle el permiso a UNA guía que salió sin él
 * (15-10, Brandon: «las trozas a mano no se vinculan todavía a un permiso; ya
 * cuando se guarda, en la tabla podré designar el permiso»).
 *
 * Una guía sin `planId` (y sus líneas) cuenta en el saldo de TODOS los permisos
 * (ADR-459). Asignarle uno ata, en UNA transacción: la guía, sus líneas de
 * Despacho (`lineasDeLaGuia`, la misma regla que anular) y los trozados sin
 * plan NI árbol de sus trozas. La tala no se toca: las trozas con árbol y sin
 * plan (y su tala) las ata «Atar líneas sin permiso», que sigue a la fuente. Como `atarSinPlan`, NO re-evalúa T6/T7: lo atado ya está asentado.
 *
 * Lo impreso (`gtfDatos`) no se reescribe: la guía emitida dice lo que dijo.
 * Sí se guarda el título del plan en `tituloHabilitante` (columna «Permiso»,
 * Documentos del permiso). Mes cerrado → no se toca nada y se dice cuál.
 *
 * tenantId 1er parámetro · auditoría `loth_linea_atar_plan` · caché invalidada.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { ForestLothDB, LOTH_TX_OPTS, LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { closedPeriodOf } from "@/lib/forestal/loth-cierre-types";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { auditLoth } from "@/lib/forestal/loth-audit";

export interface PermisoAsignado {
  gtfId: string;
  planId: string;
  despachos: number;
  trozados: number;
}

export class ForestLothGuiaPermisoDB {
  static async asignar(tenantId: string, gtfId: string, planId: string, actor: string): Promise<PermisoAsignado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!actor?.trim()) throw new Error("actor is required");
    const [gtf, plan] = await Promise.all([
      prisma.forestGtf.findFirst({
        where: { tenantId, id: gtfId, deletedAt: null },
        select: { id: true, gtfNumber: true, items: true, planId: true, titularName: true, status: true, tipo: true, tituloHabilitante: true, parcelaCorta: true },
      }),
      prisma.forestPlan.findFirst({
        where: { tenantId, id: planId, deletedAt: null },
        select: { id: true, planNumber: true, planType: true, tituloHabilitante: true, parcelaCorta: true },
      }),
    ]);
    if (!gtf) return null;
    if (!plan) {
      throw new LothInvariantError("Ese plan de manejo no existe en este negocio o está dado de baja: elige otro permiso.", "PLAN_NO_EXISTE", { planId });
    }
    if (gtf.status === "anulada") {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} está anulada: ya no se le asigna permiso.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    if (gtf.planId) {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} ya tiene permiso. Sólo se asigna a las guías que salieron sin él.`, "GUIA_PERMISO_NO_APLICA", { gtfId, planId: gtf.planId });
    }
    if (gtf.tipo !== "trozas") {
      throw new LothInvariantError("Sólo se asigna permiso a guías de trozas.", "GUIA_PERMISO_NO_APLICA", { gtfId });
    }

    const codigos = piezasDeItems(gtf.items).map((p) => p.codigo).filter(Boolean);
    const [despachos, trozados, cierres] = await Promise.all([
      ForestLothDB.lineasDeLaGuia(tenantId, gtf),
      codigos.length === 0
        ? Promise.resolve([])
        : prisma.forestLothEntry.findMany({
            /* Sólo las SIN árbol: una del libro con árbol se ata con su tala
               («Atar líneas sin permiso»); atarla acá la dejaría con plan y a
               su tala sin él (revisión 15-10). */
            where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, planId: null, treeCode: null, trozaCode: { in: codigos } },
            select: { id: true, entryDate: true },
          }),
      ForestLothCierreDB.list(tenantId),
    ]);
    const cerrados = [...new Set([...despachos, ...trozados].map((l) => closedPeriodOf(cierres, l.entryDate)?.label).filter((x): x is string => !!x))];
    if (cerrados.length > 0) {
      throw new LothInvariantError(
        `Esta guía tiene líneas en un mes cerrado (${cerrados.join(", ")}): el acta no se toca. Reabre el mes si necesitas asignarle el permiso.`,
        "PERIODO_CERRADO",
        { periodos: cerrados },
      );
    }

    const r = await prisma.$transaction(async (tx) => {
      /* La condición va en el WHERE: si otra persona la ató o la anuló entre la lectura y acá, no se pisa. */
      const g = await tx.forestGtf.updateMany({
        where: { tenantId, id: gtf.id, planId: null, deletedAt: null, status: { not: "anulada" } },
        data: {
          planId: plan.id,
          tituloHabilitante: plan.tituloHabilitante?.trim() || gtf.tituloHabilitante,
          parcelaCorta: gtf.parcelaCorta ?? plan.parcelaCorta,
        },
      });
      if (g.count === 0) {
        throw new LothInvariantError(`La GTF ${gtf.gtfNumber} cambió mientras tanto (ya tiene permiso o se anuló). Recarga la lista.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
      }
      const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
      const d = await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: ids(despachos) }, planId: null, deletedAt: null },
        data: { planId: plan.id },
      });
      const t = await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: ids(trozados) }, planId: null, deletedAt: null },
        data: { planId: plan.id },
      });
      return { despachos: d.count, trozados: t.count };
    }, LOTH_TX_OPTS);

    auditLoth({
      tenantId,
      action: "loth_linea_atar_plan",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Asignó el permiso ${plan.tituloHabilitante ?? plan.planNumber ?? plan.id} a la GTF ${gtf.gtfNumber} (antes: sin permiso): la guía, ${r.despachos} línea(s) de despacho y ${r.trozados} de trozado.`,
      user: actor,
    });
    try {
      /* Los prefijos de `ForestLothDB` y `ForestGtfDB`: saldos, secciones y la lista de guías. */
      invalidateByPrefix(`forest-loth:${tenantId}`);
      invalidateByPrefix(`forest-gtf:${tenantId}`);
    } catch { /* cache best-effort */ }
    return { gtfId: gtf.id, planId: plan.id, ...r };
  }
}
