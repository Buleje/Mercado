import "server-only";

/**
 * lib/db/por-pagar.db.ts — lo que el negocio debe (F10 «Lo que debo»).
 *
 * La lista hermana de `por-cobrar.db.ts`. Sólo LEE: trae las filas de cada
 * fuente y el armado —qué es deuda, el desglose, el neto, el orden— vive en
 * `lib/finance/por-pagar.ts`, puro y probado sin base.
 *
 * Fuentes (el criterio de cada una es el de su módulo, no una copia):
 *  - Adelantos RECIBIDOS con saldo y DADOS excedidos (`quienDebe` = le-debes).
 *  - Cuentas por pagar con saldo (`netoPorPagar`: pagadas fuera).
 *  - Préstamos RECIBIDOS con cuotas sin pagar (el espejo de `WHERE_PRESTAMO`
 *    de «Por cobrar», que se queda sólo con los DADOS).
 *  - La cuenta forestal de cada parte con saldo a su favor, con el aserrío
 *    recibido desglosado adentro (nunca sumado aparte: es la misma cuenta).
 *
 * La unión de personas (adelantos ↔ cuenta forestal) es la de «Cuenta por
 * persona» (`unificarCuentas`), con los mismos lectores que su ruta
 * (`app/api/adelantos/cuentas`): así el neto que se ve acá es el mismo que se
 * liquida allá.
 */

import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { diaUtc } from "@/lib/db/por-cobrar.db";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import { armarPorPagar, type PorPagarDetalle } from "@/lib/finance/por-pagar";

/**
 * El tope de `ForestCuentaDB.listar` (su propio `take`). Si la respuesta llega
 * justo a este número puede haber movimientos sin traer: se avisa con
 * `truncado` en vez de mostrar una deuda que puede quedar corta en silencio.
 */
const LIMITE_MOVIMIENTOS_FORESTAL = 2000;

const PRESTAMO_VIVO = ["ACTIVO", "VENCIDO"] as const;

export const PorPagarDB = {
  /**
   * Todo lo que el negocio debe, una fila por acreedor. `hoy` (`YYYY-MM-DD` de
   * Lima) decide qué está vencido: llega por parámetro para que el test y la
   * ruta vean el mismo día.
   */
  async getDetalle(tenantId: string, hoy: string = limaDateKey()): Promise<PorPagarDetalle> {
    if (!tenantId) throw new Error("tenantId is required");

    const [adelantos, grupos, beneficiarios, partes, movimientos, payables, prestamos] = await Promise.all([
      /* Candidatos a deuda tuya: lo recibido con saldo y lo dado que te
         devolvieron de más. Cancelados y liquidados no llegan (sólo ABIERTO
         y EXCEDIDO); `quienDebe` vuelve a decidir en el armado. */
      prisma.adelanto.findMany({
        where: {
          tenantId,
          status: { in: ["ABIERTO", "EXCEDIDO"] },
          OR: [
            { direccion: "RECIBIDO", saldoPendiente: { gt: 0 } },
            { direccion: "DADO", saldoPendiente: { lt: 0 } },
          ],
        },
        select: {
          id: true,
          beneficiarioId: true,
          codigoOperacion: true,
          reciboManual: true,
          direccion: true,
          conceptoRecibido: true,
          status: true,
          moneda: true,
          saldoPendiente: true,
          fechaAdelanto: true,
          fechaVencimiento: true,
          beneficiario: { select: { nombre: true } },
        },
      }),
      /* Las dos direcciones agregadas en la base: de acá sale lo que la persona
         te debe por el otro lado (y el neto). */
      AdelantosDB.saldosPorPersona(tenantId, { direccion: "todas" }),
      prisma.adelantoBeneficiario.findMany({
        where: { tenantId },
        select: { id: true, nombre: true, documento: true, telefono: true, forestPartyId: true },
      }),
      /* Con inactivos: una parte dada de baja con cuenta viva sigue debiendo. */
      ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }),
      ForestCuentaDB.listar(tenantId),
      prisma.payable.findMany({
        where: { tenantId, status: { not: "pagado" } },
        select: {
          id: true,
          supplierId: true,
          supplierName: true,
          description: true,
          amount: true,
          paidAmount: true,
          status: true,
          dueDate: true,
          createdAt: true,
          supplier: { select: { name: true } },
        },
      }),
      prisma.prestamo.findMany({
        where: {
          tenantId,
          direccion: "RECIBIDO",
          status: { in: [...PRESTAMO_VIVO] },
          cuotas: { some: { pagadoEn: null } },
        },
        select: {
          id: true,
          entidadNombre: true,
          moneda: true,
          fechaDesembolso: true,
          createdAt: true,
          customer: { select: { name: true } },
          cuotas: { where: { pagadoEn: null }, select: { monto: true, fechaVence: true } },
        },
      }),
    ]);

    const personas = unificarCuentas({
      beneficiarios: beneficiarios.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        documento: b.documento ?? null,
        telefono: b.telefono ?? null,
        forestPartyId: b.forestPartyId ?? null,
      })),
      adelantos: grupos.map((g) => ({
        beneficiarioId: g.beneficiarioId,
        status: g.status,
        saldoPendiente: g.saldoPendiente,
        moneda: g.moneda,
        cantidad: g.cantidad,
        direccion: g.direccion,
      })),
      partes: partes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero ?? null, telefono: p.telefono ?? null })),
      movimientos,
    });

    return armarPorPagar({
      hoy,
      personas,
      grupos: grupos.map((g) => ({
        beneficiarioId: g.beneficiarioId,
        status: g.status,
        moneda: g.moneda,
        direccion: g.direccion,
        saldoPendiente: g.saldoPendiente,
      })),
      adelantos: adelantos.map((a) => ({
        id: a.id,
        beneficiarioId: a.beneficiarioId,
        beneficiarioNombre: a.beneficiario?.nombre ?? null,
        codigoOperacion: a.codigoOperacion,
        reciboManual: a.reciboManual,
        direccion: a.direccion,
        conceptoRecibido: a.conceptoRecibido,
        status: a.status,
        moneda: a.moneda,
        saldoPendiente: toNumOrZero(a.saldoPendiente),
        fechaAdelanto: diaUtc(a.fechaAdelanto),
        fechaVencimiento: diaUtc(a.fechaVencimiento),
      })),
      cuentasPorPagar: payables.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        /* El nombre guardado en la cuenta puede venir vacío (el POST lo deja
           en ""): el del proveedor es el respaldo. */
        supplierName: p.supplierName?.trim() || p.supplier?.name || null,
        description: p.description,
        amount: toNumOrZero(p.amount),
        paidAmount: toNumOrZero(p.paidAmount),
        status: p.status,
        vence: diaUtc(p.dueDate),
        /* `createdAt` es un instante: el día es el de Lima. */
        desde: limaDateKey(p.createdAt) || null,
      })),
      prestamos: prestamos.map((p) => ({
        id: p.id,
        nombre: p.entidadNombre?.trim() || p.customer?.name?.trim() || null,
        moneda: p.moneda,
        cuotas: p.cuotas.map((c) => ({ monto: toNumOrZero(c.monto), vence: diaUtc(c.fechaVence) })),
        desde: diaUtc(p.fechaDesembolso) ?? (limaDateKey(p.createdAt) || null),
      })),
      truncado: movimientos.length >= LIMITE_MOVIMIENTOS_FORESTAL,
    });
  },
};
