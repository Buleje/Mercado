import "server-only";
import { prisma } from "@/lib/prisma";
import { ROLES_PAPEL_SENSIBLE } from "@/lib/documentos/enlaces-entidad";

/**
 * CandadoDocumentosDB — atar papeles del Drive a una ficha, trámite o alquiler
 * (ADR-524, S4/R5/R6 de la ronda de seguridad).
 *
 * Al ENLAZAR un documento que ya estaba en el Drive (el contrato de un
 * alquiler, el comprobante de un pago, el DNI de una ficha, el papel de un
 * requisito) le pasa lo mismo que a uno subido con vínculo:
 *   1. lleva el tag de máquina de la entidad (`tramiteadm:…`, `alquiler:…`,
 *      `parte:…`), sin repetirlo;
 *   2. si NO tenía roles, queda con el candado de dueños. Si ya tenía roles se
 *      respetan: nunca se abre ni se pisa un candado puesto a mano.
 *
 * Las dos condiciones van en el WHERE (`NOT has` / `isEmpty`): dos enlaces a la
 * vez no duplican el tag ni pisan un rol que se puso entre medio.
 * `tenantId` 1.º y en cada WHERE: un id de otro negocio no se toca.
 * El Drive no cachea documentos en `lib/cache` (no hay nada que invalidar).
 */
export const CandadoDocumentosDB = {
  async atar(
    tenantId: string,
    documentIds: readonly (string | null | undefined)[],
    tag: string | null,
  ): Promise<{ conTag: number; conCandado: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(documentIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return { conTag: 0, conCandado: 0 };
    const conTag = tag
      ? await prisma.document.updateMany({
          where: { tenantId, id: { in: ids }, deletedAt: null, NOT: { tags: { has: tag } } },
          data: { tags: { push: tag } },
        })
      : { count: 0 };
    const conCandado = await prisma.document.updateMany({
      where: { tenantId, id: { in: ids }, deletedAt: null, allowedRoles: { isEmpty: true } },
      data: { allowedRoles: [...ROLES_PAPEL_SENSIBLE] },
    });
    return { conTag: conTag.count, conCandado: conCandado.count };
  },
};
