/**
 * lib/agents/domains/cobranzas.agent.ts
 *
 * Lo que te deben: fiados de clientes y adelantos del personal.
 *
 * Son dos deudas distintas y no se suman en un solo número a propósito. El
 * fiado es plata de una venta que el cliente todavía no pagó; el adelanto es
 * plata que YA saliste a pagar y se descuenta del sueldo. Meterlas en el mismo
 * total daría una cifra que no significa nada.
 *
 * Solo lectura: cobrar mueve caja y deja recibo, y eso se hace en su pantalla.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { FiadosDB } from "@/lib/db/fiados.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";

const soles = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/** Días desde una fecha — lo que convierte "debe 200" en "debe 200 hace 3 meses". */
function diasDesde(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

async function fiados(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  log.info("Resumiendo fiados abiertos");

  // ACTIVO y VENCIDO son los que siguen debiendo; PAGADO y CANCELADO no.
  const lista = (await FiadosDB.list(task.tenantId)).filter(
    (f) => f.status === "ACTIVO" || f.status === "VENCIDO",
  );
  const deudores = lista
    .map((f) => ({
      cliente: f.customerName || f.customerId,
      telefono: f.customerId,
      saldo: soles(num(f.saldo)),
      total: soles(num(f.total)),
      estado: f.status,
      vence: f.fechaVence ? String(f.fechaVence).slice(0, 10) : null,
      desde: f.createdAt ? String(f.createdAt).slice(0, 10) : null,
      dias: diasDesde(f.createdAt),
    }))
    .filter((d) => d.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  const total = soles(deudores.reduce((a, d) => a + d.saldo, 0));
  // Lo viejo es lo que no se cobra solo: se destaca aparte para que la
  // respuesta no sea un total sin acción posible.
  const viejos = deudores.filter((d) => (d.dias ?? 0) > 30);

  return {
    success: true,
    data: {
      totalPorCobrar: total,
      deudores: deudores.length,
      masDe30Dias: { cantidad: viejos.length, monto: soles(viejos.reduce((a, d) => a + d.saldo, 0)) },
      detalle: deudores.slice(0, 12),
    },
  };
}

async function adelantos(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  log.info("Resumiendo adelantos vigentes");

  const lista = await AdelantosDB.list(task.tenantId);
  // CANCELADO no es deuda: es un adelanto que se anuló. Sumarlo infla el saldo
  // (fue un bug real del módulo, no repetirlo acá).
  const vivos = lista.filter((a) => String(a.status ?? "").toUpperCase() !== "CANCELADO");

  const detalle = vivos
    .map((a) => ({
      persona: a.beneficiario?.nombre ?? a.beneficiarioId,
      codigo: a.codigoOperacion ?? null,
      monto: soles(num(a.montoAdelantado)),
      saldo: soles(num(a.saldoPendiente)),
      estado: a.status,
      fecha: a.fechaAdelanto ? String(a.fechaAdelanto).slice(0, 10) : null,
      vence: a.fechaVencimiento ? String(a.fechaVencimiento).slice(0, 10) : null,
    }))
    .filter((a) => a.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  return {
    success: true,
    data: {
      totalPendiente: soles(detalle.reduce((a, d) => a + d.saldo, 0)),
      personas: detalle.length,
      detalle: detalle.slice(0, 12),
      nota: "Los adelantos CANCELADOS no cuentan como deuda.",
    },
  };
}

export const cobranzasAgent: DomainAgent = {
  domain: "cobranzas",
  actions: ["fiados", "adelantos"],
  description:
    "Lo que te deben: fiados de clientes (con antigüedad) y adelantos de sueldo pendientes de descontar. Solo lectura.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    switch (task.action) {
      case "fiados":
        return fiados(task, ctx);
      case "adelantos":
        return adelantos(task, ctx);
      default:
        return { success: false, error: `Acción desconocida de cobranzas: ${task.action}` };
    }
  },
};
