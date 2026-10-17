/**
 * lib/db/cash-registers-movements.db.ts
 *
 * Audit project-wide 2026-05-19 — elimina acceso prisma.* directo en
 * app/api/cash-registers/movements/route.ts.
 *
 * Encapsula:
 *   - Verificación ownership de caja (findFirst con tenantId)
 *   - Búsqueda de caja abierta del tenant
 *   - Creación de movimiento manual (cashMovement.create)
 *   - Listado de movimientos de una caja (findMany)
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ConflictError } from "@/lib/api-error";
import { invalidate } from "@/lib/cache";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import {
  efectoEnElEsperado,
  medioCorregible,
  nombreDelMedio,
  whereDePagoDeLiquidacion,
  type MedioDeCaja,
  type PagoDeLiquidacion,
} from "@/lib/caja/cambiar-medio";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";

/**
 * La caja se cerró mientras llegaba el movimiento (F4): no se anota en una caja
 * cerrada. 409 por `toErrorPayload`; el POS lo registra y sigue.
 */
export class CajaNoAbiertaError extends ConflictError {
  constructor() {
    super("La caja ya está cerrada: el movimiento no se anotó. Abre una caja y vuelve a intentarlo.");
    this.name = "CajaNoAbiertaError";
  }
}

/**
 * El medio de un movimiento no se pudo cambiar (409): la caja ya se cerró (su
 * arqueo quedó fijado), el movimiento no es un ingreso/egreso, ya estaba en ese
 * medio, u otro cambio llegó primero. `motivo` va en `details` para la pantalla.
 */
export class MedioNoCambiadoError extends ConflictError {
  constructor(
    message: string,
    readonly motivo: "caja_cerrada" | "tipo" | "sin_cambio" | "liquidacion" | "carrera",
  ) {
    super(message, { motivo });
    this.name = "MedioNoCambiadoError";
  }
}

/** Lo que devuelve `cambiarMedio`: el movimiento ya corregido y el esperado antes/después. */
export interface CambioDeMedio {
  movimiento: DbCashMovementRecord;
  metodoAnterior: string;
  /** Efectivo esperado de la caja antes del cambio (derivado del de después). */
  esperadoAntes: number;
  /** Efectivo esperado de la caja con el cambio, sumado en la base bajo el lock. */
  esperadoDespues: number;
}

export type DbCashMovementRecord = {
  id: string;
  cashRegisterId: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  createdAt: Date;
};

function mapMovement(r: {
  id: string;
  cashRegisterId: string;
  type: string;
  amount: unknown;
  method: string;
  description: string | null;
  createdAt: Date;
}): DbCashMovementRecord {
  return {
    id: r.id,
    cashRegisterId: r.cashRegisterId,
    type: r.type,
    amount: Number(r.amount),
    method: r.method,
    description: r.description ?? "",
    createdAt: r.createdAt,
  };
}

export const CashRegistersMovementsDB = {
  /**
   * Verifica que la caja existe, pertenece al tenant y está abierta.
   * Retorna el id de la caja si es válida; null si no existe o no es del tenant.
   */
  async findOpenRegisterById(
    cashRegisterId: string,
    tenantId: string,
  ): Promise<{ id: string } | null> {
    return prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId, status: "abierta" },
      select: { id: true },
    });
  },

  /**
   * Busca la caja abierta actual del tenant.
   * Retorna null si no hay ninguna abierta.
   */
  async findCurrentOpenRegister(tenantId: string): Promise<{ id: string } | null> {
    return prisma.cashRegister.findFirst({
      where: { tenantId, status: "abierta" },
      select: { id: true },
    });
  },

  /**
   * Verifica ownership de caja (sin requerir que esté abierta).
   * Usado para el guard de seguridad cross-tenant en GET.
   */
  async verifyOwnership(cashRegisterId: string, tenantId: string): Promise<boolean> {
    const reg = await prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId },
      select: { id: true },
    });
    return !!reg;
  },

  /**
   * Crea un movimiento manual (ingreso o egreso) en una caja.
   *
   * Con la caja tomada en `FOR SHARE` (F4): la ruta ya verificó que estaba
   * abierta, pero entre esa lectura y el INSERT un cierre podía confirmarse, y el
   * movimiento caía en la caja cerrada. Ahora, si la cerraron, `CajaNoAbiertaError`.
   */
  async createMovement(
    tenantId: string,
    data: {
      cashRegisterId: string;
      type: "ingreso" | "egreso";
      amount: number;
      method: string;
      description: string;
    },
  ): Promise<DbCashMovementRecord> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.$transaction(async (tx) => {
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, data.cashRegisterId);
      if (caja?.status !== "abierta") throw new CajaNoAbiertaError();
      return tx.cashMovement.create({ data });
    });
    invalidarVentasOverview(tenantId);
    return mapMovement(row);
  },

  /*
   * ── El lock de la caja (F4, 3ª pasada de seguridad de ADR-448) ─────────────
   *
   * Antes nada bloqueaba la fila de la caja: el cierre leía los movimientos sin
   * lock, y un movimiento que se confirmaba en ese instante quedaba fuera del
   * esperado (o entraba en una caja ya cerrada). Arqueo descuadrado por el monto
   * exacto. Medido contra la base real: esperado 0 con un ingreso de 150 en
   * curso (`__tests__/caja-cierre-carrera-db.test.ts`).
   *
   * Dos fuerzas de lock, a propósito:
   *   · quien ANOTA toma `FOR SHARE` — choca con el cierre (`FOR UPDATE`) pero no
   *     con otro que anota: dos adelantos a la vez no se esperan entre sí, y las
   *     ventas del POS (cuyo INSERT sólo toma `FOR KEY SHARE` por la FK) tampoco;
   *   · el CIERRE toma `FOR UPDATE` — espera a todo el que está anotando (incluso
   *     a un INSERT suelto, por la FK) y hace esperar a todo el que llega.
   *
   * ORDEN GLOBAL: la caja es SIEMPRE el último lock de una transacción, y el
   * cierre no toma ningún otro. Ver `lib/adelantos/movimiento-caja.ts`.
   */

  /**
   * La caja abierta del tenant, BLOQUEADA para anotar (`FOR SHARE`) dentro de la
   * transacción de quien llama. Si un cierre la tiene tomada, espera; cuando el
   * cierre confirma, Postgres re-evalúa el `status` sobre la fila nueva y la
   * caja ya no califica: devuelve `null` (el movimiento no entra en una caja
   * cerrada). El orden por apertura es para que dos abiertas (no debería haber)
   * den siempre la misma.
   */
  async bloquearCajaAbiertaEnTx(tx: Prisma.TransactionClient, tenantId: string): Promise<{ id: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CashRegister"
       WHERE "tenantId" = ${tenantId} AND "status" = 'abierta'
       ORDER BY "openedAt" DESC, "id" DESC
       LIMIT 1
       FOR SHARE
    `;
    return filas[0] ?? null;
  },

  /**
   * UNA caja por id, bloqueada para anotar (`FOR SHARE`): el mismo lock que
   * `bloquearCajaAbiertaEnTx`, para los escritores que ya saben en qué caja
   * anotan (venta del POS, movimiento manual, arqueo, asistente). Devuelve el
   * `status` RELEÍDO bajo el lock: si un cierre la tenía, es el de después del
   * cierre, y quien llama no anota en una caja cerrada.
   *
   * `tenantId` obligatorio y en el WHERE: una caja de otro negocio da `null`,
   * igual que una que no existe.
   */
  async bloquearCajaParaAnotarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cashRegisterId: string,
  ): Promise<{ status: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS status FROM "CashRegister" WHERE "id" = ${cashRegisterId} AND "tenantId" = ${tenantId} FOR SHARE
    `;
    return filas[0] ?? null;
  },

  /**
   * La caja a cerrar, BLOQUEADA en exclusiva (`FOR UPDATE`). Lo primero que hace
   * el cierre: después de esto, lo que lee de movimientos es lo que hay — nadie
   * puede estar anotando a medias ni anotar hasta que confirme. `false` si la caja
   * no existe en este negocio.
   */
  async bloquearCajaParaCerrarEnTx(tx: Prisma.TransactionClient, tenantId: string, cashRegisterId: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CashRegister" WHERE "id" = ${cashRegisterId} AND "tenantId" = ${tenantId} FOR UPDATE
    `;
    return filas.length > 0;
  },

  /**
   * `createMovement` dentro de la transacción de quien llama (ver arriba).
   *
   * `tenantId` (1er parámetro, como todo método) sólo sirve para invalidar el
   * Tablero de Ventas. Se invalida acá, dentro de la tx, porque es el único
   * punto común de adelantos y liquidaciones (`moverCajaEnTx`); el commit llega
   * unos ms después, así que un GET del tablero justo en medio podría re-cachear
   * el saldo viejo hasta 2 min (ventana chica, acotada por el TTL).
   */
  async createMovementEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    data: { cashRegisterId: string; type: "ingreso" | "egreso"; amount: number; method: string; description: string },
  ): Promise<DbCashMovementRecord> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await tx.cashMovement.create({ data });
    invalidarVentasOverview(tenantId);
    return mapMovement(row);
  },

  /**
   * Qué movimientos de estos son el PAGO de una liquidación (mismo criterio que
   * el 409 `liquidacion` de `cambiarMedio`: `whereDePagoDeLiquidacion`). La
   * pantalla de caja lo usa para no ofrecer «Cambiar medio» donde el servidor lo
   * va a rechazar.
   */
  async liquidacionesDeMovimientos(tenantId: string, movimientoIds: readonly string[]): Promise<PagoDeLiquidacion[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (movimientoIds.length === 0) return [];
    return prisma.liquidacionCuenta.findMany({
      where: whereDePagoDeLiquidacion(tenantId, movimientoIds),
      select: { codigo: true, cajaMovimientoId: true },
    });
  },

  /**
   * Corrige el MEDIO de un ingreso/egreso ya anotado en una caja ABIERTA (un
   * adelanto anotado como efectivo que se pagó por transferencia). No toca el
   * monto, el tipo ni la descripción.
   *
   * Lock: la caja en `FOR SHARE` como primera sentencia, igual que quien anota
   * (`createMovement`, `moverCajaEnTx`). Choca con el cierre (`FOR UPDATE`): si
   * un cierre está en curso, esto espera y relee el `status`; cerrada → 409 (el
   * arqueo de una caja cerrada ya quedó fijado y no se reescribe). Si esto llega
   * primero, el cierre espera y cuenta el medio corregido. Después del lock sólo
   * se toca la fila del movimiento, que nadie más bloquea (los demás caminos
   * sólo INSERTan o leen movimientos): no puede cerrar un ciclo.
   *
   * Carrera entre dos correcciones: el UPDATE lleva el medio LEÍDO en el WHERE;
   * si otro lo cambió primero, 0 filas → 409 «carrera», no se pisa.
   *
   * `null` si la caja o el movimiento no existen en ESTE negocio (el `tenantId`
   * va en el WHERE por la relación: `CashMovement` no tiene columna propia).
   */
  async cambiarMedio(
    tenantId: string,
    data: { cashRegisterId: string; movementId: string; metodo: MedioDeCaja },
  ): Promise<CambioDeMedio | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const { cashRegisterId, movementId, metodo } = data;
    const resultado = await prisma.$transaction(async (tx) => {
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, cashRegisterId);
      if (!caja) return null;
      if (caja.status !== "abierta") {
        throw new MedioNoCambiadoError(
          "La caja ya está cerrada: su arqueo quedó fijado y el medio no se puede cambiar.",
          "caja_cerrada",
        );
      }

      const mov = await tx.cashMovement.findFirst({
        where: { id: movementId, cashRegisterId, cashRegister: { tenantId } },
        select: { id: true, cashRegisterId: true, type: true, amount: true, method: true, description: true, createdAt: true },
      });
      if (!mov) return null;
      if (!medioCorregible(mov.type)) {
        throw new MedioNoCambiadoError("Sólo se puede cambiar el medio de un ingreso o un egreso.", "tipo");
      }
      const anterior = mov.method;
      if (nombreDelMedio(anterior) === nombreDelMedio(metodo)) {
        throw new MedioNoCambiadoError(`Ya está anotado en ${nombreDelMedio(metodo)}: no hay nada que cambiar.`, "sin_cambio");
      }
      /* El pago de una liquidación lleva su medio también en `LiquidacionCuenta.metodoPago`
         y en el acta congelada (el PDF firmado): cambiarlo sólo acá los despega. Se
         corrige anulando y rehaciendo la liquidación. Lectura simple, sin lock: el
         vínculo se escribe en la misma transacción que crea el movimiento. La
         reversión de una anulación (`cajaReversionId`) no guarda el medio en otro
         lado: ésa sí se puede corregir. Un adelanto tampoco lo guarda aparte. */
      const liq = await tx.liquidacionCuenta.findFirst({
        where: whereDePagoDeLiquidacion(tenantId, movementId),
        select: { codigo: true },
      });
      if (liq) {
        throw new MedioNoCambiadoError(
          `Es el pago de la liquidación ${liq.codigo}: su medio también está en el acta. Corrígelo anulando y rehaciendo la liquidación.`,
          "liquidacion",
        );
      }

      const upd = await tx.cashMovement.updateMany({
        where: { id: movementId, cashRegisterId, method: anterior, cashRegister: { tenantId } },
        data: { method: metodo },
      });
      if (upd.count === 0) {
        throw new MedioNoCambiadoError("Otro cambio llegó primero: recarga la caja y vuelve a intentarlo.", "carrera");
      }

      /* El esperado DESPUÉS, sumado en la base con TODOS los movimientos (el
         listado de cajas corta en 100) y LA cuenta del arqueo. El de antes se
         deriva con la misma función: no hace falta otra suma. */
      const [reg, grupos] = await Promise.all([
        tx.cashRegister.findFirst({ where: { id: cashRegisterId, tenantId }, select: { openingAmount: true } }),
        tx.cashMovement.groupBy({
          by: ["type", "method"],
          where: { cashRegisterId, cashRegister: { tenantId } },
          _sum: { amount: true },
        }),
      ]);
      const despues = saldoEsperadoDeCaja(
        Number(reg?.openingAmount ?? 0),
        grupos.map((g) => ({ type: g.type, method: g.method, amount: Number(g._sum.amount ?? 0) })),
      ).esperado;
      const efecto = efectoEnElEsperado({ type: mov.type, method: anterior, amount: Number(mov.amount) }, metodo);
      return {
        movimiento: mapMovement({ ...mov, method: metodo }),
        metodoAnterior: anterior,
        esperadoAntes: Math.round((despues - efecto) * 100) / 100,
        esperadoDespues: despues,
      } satisfies CambioDeMedio;
    });
    /* El banner del panel cachea 60 s la cuenta de la caja abierta (AlertsDB). */
    if (resultado) {
      invalidate(`admin:alerts-summary:${tenantId}`);
      invalidarVentasOverview(tenantId);
    }
    return resultado;
  },

  /**
   * Lista movimientos de una caja, orden descendente, max 100.
   */
  async listByCashRegister(
    cashRegisterId: string,
  ): Promise<DbCashMovementRecord[]> {
    const rows = await prisma.cashMovement.findMany({
      where: { cashRegisterId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(mapMovement);
  },
};
