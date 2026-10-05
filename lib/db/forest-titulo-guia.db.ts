import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { planearTitulo, type PlanTitulo } from "@/lib/forestal/titulo-de-guia";
import { ForestContratoDB } from "./forest-contrato.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";

/**
 * TituloGuiaDB — declarar el título habilitante de una guía ya asentada
 * (Brandon 05-10, modal «Sin título declarado» de Trozas).
 *
 * La regla vive en `planearTitulo` (pura, con test): sólo sobre vacío, el mes
 * cerrado manda, lo anulado no se toca. Acá va lo que no puede ser puro:
 *   · el permiso elegido tiene que ser de ESTE negocio (`contratoId` es una FK
 *     global — mismo hallazgo de ADR-442 que `contratoDelTenant`);
 *   · el UPDATE repite la condición «vacío» en el WHERE: si otra pantalla lo
 *     llenó entre la lectura y la escritura, queda el suyo (igual que el
 *     `COALESCE` de los D1/D2 de planta);
 *   · auditoría por ingreso y caché del libro invalidada.
 */

/** El mismo prefijo que `WoodEntriesDB`: la lista de ingresos y el patio se releen. */
const CACHE_WOOD_ENTRIES = "wood-entries";

export interface PedidoTituloGuia {
  gtfNumber: string;
  /** Un permiso de la lista (`ForestContrato`): da el código y la resolución. */
  contratoId?: string | null;
  /** O el código escrito a mano (si es de un permiso cargado, se vincula solo). */
  originCode?: string | null;
  originSourceNumber?: string | null;
  /** De dónde salió el dato, para el rastro («la ficha SERFOR (registro 1-19-0313629)»). */
  origen?: string | null;
}

export interface ResultadoTituloGuia {
  originCode: string;
  actualizados: { id: string; especie: string | null }[];
  omitidos: { id: string; especie: string | null; motivo: string }[];
}

export class TituloGuiaDB {
  static async declarar(tenantId: string, pedido: PedidoTituloGuia, usuario = "unknown"): Promise<ResultadoTituloGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = pedido.gtfNumber.trim();
    if (!gtf) throw new CtpInvariantError("Falta la guía.", "VALIDACION");

    /* El permiso: de la lista (y de ESTE negocio) o deducido del código escrito. */
    let originCode = (pedido.originCode ?? "").trim();
    let originSourceNumber = (pedido.originSourceNumber ?? "").trim() || null;
    let contratoId: string | null = null;
    if (pedido.contratoId) {
      const c = await ForestContratoDB.get(tenantId, pedido.contratoId);
      if (!c) {
        throw new CtpInvariantError("Ese permiso no está en tu lista de permisos. Elígelo de nuevo.", "VALIDACION");
      }
      contratoId = c.id;
      originCode = c.codigo;
      originSourceNumber = originSourceNumber ?? (c.resolucionNumero?.trim() || null);
    } else if (originCode) {
      contratoId = await ForestContratoDB.idPorCodigo(tenantId, originCode);
    }
    if (!originCode) throw new CtpInvariantError("Elige un permiso o escribe el código del título.", "VALIDACION");

    const [ingresos, cierres] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf },
        select: {
          id: true, speciesCommonName: true, status: true, deletedAt: true, entryDate: true,
          originCode: true, originSourceNumber: true, contratoId: true,
        },
        orderBy: { id: "asc" },
      }),
      ForestCtpCierreDB.list(tenantId),
    ]);
    if (ingresos.length === 0) throw new CtpInvariantError(`No hay ingresos con la guía ${gtf}.`, "VALIDACION");

    const planes = planearTitulo(
      ingresos.map((i) => ({
        id: i.id,
        especie: i.speciesCommonName,
        status: i.status,
        anulado: i.deletedAt != null,
        originCode: i.originCode,
        originSourceNumber: i.originSourceNumber,
        contratoId: i.contratoId,
        periodoCerrado: closedPeriodOf(cierres, i.entryDate)?.label ?? null,
      })),
      { originCode, originSourceNumber, contratoId },
    );

    const aEscribir = planes.filter((p): p is PlanTitulo & { escribir: NonNullable<PlanTitulo["escribir"]> } => p.escribir != null);
    const escritos = new Set<string>();
    if (aEscribir.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const p of aEscribir) {
          /* Cada campo sólo si SIGUE vacío al escribir (la condición va en el SET
             y en el WHERE): lo que otra pantalla llenó en el medio no se pisa. */
          const n = await tx.$executeRaw`
            UPDATE "WoodEntry" SET
              "originCode" = CASE WHEN COALESCE(TRIM("originCode"), '') = '' THEN ${p.escribir.originCode ?? null}::text ELSE "originCode" END,
              "originSourceNumber" = CASE WHEN COALESCE(TRIM("originSourceNumber"), '') = '' AND ${p.escribir.originSourceNumber ?? null}::text IS NOT NULL
                THEN ${p.escribir.originSourceNumber ?? null}::text ELSE "originSourceNumber" END,
              "contratoId" = COALESCE("contratoId", ${p.escribir.contratoId ?? null}::text),
              "updatedAt" = NOW()
            WHERE "tenantId" = ${tenantId} AND "id" = ${p.id} AND "deletedAt" IS NULL
              AND (COALESCE(TRIM("originCode"), '') = ''
                OR (${p.escribir.originCode ?? null}::text IS NULL AND UPPER(TRIM("originCode")) = UPPER(${originCode}::text)))
          `;
          if (n > 0) escritos.add(p.id);
        }
      });
    }

    const actualizados = aEscribir.filter((p) => escritos.has(p.id)).map((p) => ({ id: p.id, especie: p.especie }));
    const omitidos = planes
      .filter((p) => !escritos.has(p.id))
      .map((p) => ({ id: p.id, especie: p.especie, motivo: p.motivo ?? "otra pantalla lo completó antes" }));

    for (const a of actualizados) {
      auditCtp({
        tenantId,
        action: "ctp_ingreso_titulo_declarado",
        entity: "WoodEntry",
        entityId: a.id,
        detail:
          `Declaró el título ${originCode}${originSourceNumber ? ` (Res. ${originSourceNumber})` : ""} ` +
          `en el ingreso de ${a.especie ?? "—"} de la guía ${gtf}, que no lo traía` +
          `${contratoId ? " · vinculado al permiso de la lista" : ""}` +
          `${pedido.origen?.trim() ? ` · tomado de ${pedido.origen.trim()}` : ""}.`,
        user: usuario,
      });
    }
    if (actualizados.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_WOOD_ENTRIES}:${tenantId}`);
      } catch (err) {
        logger.error("[titulo-guia] invalidar caché failed", { error: String(err) });
      }
    }
    return { originCode, actualizados, omitidos };
  }
}
