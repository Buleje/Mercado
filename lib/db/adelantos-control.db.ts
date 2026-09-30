import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { detalleDelControl, instanteDeVencimiento, problemaDeVencimiento } from "@/lib/adelantos/control-edicion";

/**
 * Poner vencimiento o atar a un permiso un adelanto YA DADO (2026-09-30).
 *
 * Aparte de `adelantos.db.ts` (2 000 líneas) porque es un acto chico y propio:
 * no mueve plata, no toca la caja ni el saldo. Sí cambia qué se le reclama a
 * quién (la fecha) y en qué balance de permiso cuenta (el contrato): por eso va
 * con lock, rastro y sólo sobre adelantos ABIERTOS.
 *
 * LOCKS. Sólo la fila del `Adelanto` en `FOR UPDATE` (nivel 4 del orden global
 * de `lib/adelantos/movimiento-caja.ts`); no toma ni la persona, ni la caja. Una
 * entrega o una anulación simultánea espera, y esto relee el estado después:
 * no se le pone fecha a uno que se acaba de anular.
 */

/** No se puede: el adelanto no está abierto, el permiso no es de este negocio, o la fecha no vale. */
export class AdelantoNoControlableError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 422,
    readonly code: "no_abierto" | "contrato_ajeno" | "vencimiento_invalido",
  ) {
    super(message);
    this.name = "AdelantoNoControlableError";
  }
}

export interface ControlInput {
  /** Día de Lima «YYYY-MM-DD»; `null` = quitar la fecha; ausente = no tocarla. */
  fechaVencimiento?: string | null;
  /** Id del permiso de ESTE negocio; `null` = desatar; ausente = no tocarlo. */
  contratoId?: string | null;
  usuario: string;
}

export interface ControlHecho {
  /** Lo que quedó (instante ISO / id), para que la pantalla lo confirme. */
  fechaVencimiento: string | null;
  contratoId: string | null;
  /** `false` = ya estaba así: no se escribió nada ni hay renglón en la auditoría. */
  cambio: boolean;
}

const ESTADO_TEXTO: Record<string, string> = {
  LIQUIDADO: "ya se liquidó",
  EXCEDIDO: "ya se pagó de más",
  CANCELADO: "está anulado",
};

export const AdelantosControlDB = {
  /** `null` = no existe en este negocio (la ruta responde 404). */
  async controlar(tenantId: string, id: string, input: ControlInput): Promise<ControlHecho | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const tocaFecha = input.fechaVencimiento !== undefined;
    const tocaContrato = input.contratoId !== undefined;

    const nuevaFecha = tocaFecha && input.fechaVencimiento ? instanteDeVencimiento(input.fechaVencimiento) : null;
    if (tocaFecha && input.fechaVencimiento && !nuevaFecha) {
      throw new AdelantoNoControlableError("Esa fecha no existe. Elígela del calendario.", 400, "vencimiento_invalido");
    }

    const hecho = await prisma.$transaction(async (tx) => {
      const bloqueado = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Adelanto" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      if (bloqueado.length === 0) return null;
      /* Releído DESPUÉS del lock: ve la anulación o la entrega que acaba de confirmar otro. */
      const actual = await tx.adelanto.findFirst({
        where: { id, tenantId },
        select: {
          status: true,
          codigoOperacion: true,
          fechaAdelanto: true,
          fechaVencimiento: true,
          contratoId: true,
          contrato: { select: { codigo: true } },
        },
      });
      if (!actual) return null;
      if (actual.status !== "ABIERTO") {
        throw new AdelantoNoControlableError(
          `Este adelanto ${ESTADO_TEXTO[actual.status] ?? "no está abierto"}: ya no se le pone fecha ni permiso.`,
          409,
          "no_abierto",
        );
      }
      if (tocaFecha && input.fechaVencimiento) {
        const problema = problemaDeVencimiento(input.fechaVencimiento, actual.fechaAdelanto);
        if (problema) throw new AdelantoNoControlableError(problema, 400, "vencimiento_invalido");
      }

      /* El permiso, con `tenantId` en el WHERE: `contratoId` es una FK global y
         un id de otro negocio mandado a mano entraría. A diferencia del alta
         (`contratoPropio`, que lo deja pasar sin permiso), acá se RECHAZA: el
         pedido es justamente atarlo, y guardarlo «sin permiso» diciendo 200
         mentiría. */
      let contrato: { id: string; codigo: string } | null = actual.contratoId
        ? { id: actual.contratoId, codigo: actual.contrato?.codigo ?? actual.contratoId }
        : null;
      if (tocaContrato) {
        const pedido = input.contratoId?.trim() || null;
        if (!pedido) {
          contrato = null;
        } else if (pedido !== actual.contratoId) {
          const c = await tx.forestContrato.findFirst({
            where: { id: pedido, tenantId, deletedAt: null },
            select: { id: true, codigo: true },
          });
          if (!c) {
            throw new AdelantoNoControlableError(
              "Ese permiso no existe en este negocio o se dio de baja. Elígelo de la lista.",
              422,
              "contrato_ajeno",
            );
          }
          contrato = c;
        }
      }

      const despuesFecha = tocaFecha ? nuevaFecha : actual.fechaVencimiento;
      const detalle = detalleDelControl(
        actual.codigoOperacion ?? id,
        { fechaVencimiento: actual.fechaVencimiento, contrato: actual.contratoId ? (actual.contrato?.codigo ?? actual.contratoId) : null },
        { fechaVencimiento: despuesFecha, contrato: contrato?.codigo ?? null },
      );
      const contratoFinal = contrato?.id ?? null;
      const cambioContrato = contratoFinal !== (actual.contratoId ?? null);
      if (!detalle && !cambioContrato) {
        return { fechaVencimiento: actual.fechaVencimiento?.toISOString() ?? null, contratoId: actual.contratoId ?? null, cambio: false, cambioContrato: false };
      }

      /* `status` en el WHERE además del lock: si algo lo cerró igual, 0 filas y no se escribe. */
      const { count } = await tx.adelanto.updateMany({
        where: { id, tenantId, status: "ABIERTO" },
        data: {
          ...(tocaFecha ? { fechaVencimiento: nuevaFecha } : {}),
          ...(tocaContrato ? { contratoId: contratoFinal } : {}),
        },
      });
      if (count === 0) throw new AdelantoNoControlableError("Este adelanto ya no está abierto.", 409, "no_abierto");

      /* El rastro en la MISMA transacción (como `corregirDireccion`): sin
         renglón, no hay cambio. */
      await tx.activityLog.create({
        data: {
          tenantId,
          action: "Controlar adelanto",
          entity: "adelanto",
          entityId: id,
          user: input.usuario || "—",
          detail: detalle || `${actual.codigoOperacion ?? id}: permiso cambiado.`,
        },
      });
      return {
        fechaVencimiento: despuesFecha ? new Date(despuesFecha).toISOString() : null,
        contratoId: contratoFinal,
        cambio: true,
        cambioContrato,
      };
    });

    if (!hecho) return null;
    if (hecho.cambio) {
      /* El resumen y el aviso «sin control» se leen sin caché de servidor (la
         pantalla pide `no-store`). Lo cacheado que depende de esto: el balance
         de cada permiso (cuenta sus adelantos) y el resultado del negocio. */
      invalidar(`${claveCacheResultado(tenantId)}:`);
      if (hecho.cambioContrato) invalidar(`forest-contrato:${tenantId}`);
    }
    return { fechaVencimiento: hecho.fechaVencimiento, contratoId: hecho.contratoId, cambio: hecho.cambio };
  },
};

function invalidar(prefijo: string): void {
  try {
    invalidateByPrefix(prefijo);
  } catch (err) {
    logger.warn("[adelantos-control.db] no se pudo invalidar la caché", { error: String(err), prefijo });
  }
}
