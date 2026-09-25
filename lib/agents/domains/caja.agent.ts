/**
 * lib/agents/domains/caja.agent.ts
 *
 * «¿Cómo viene la caja?» — la pregunta de las 8 de la noche.
 *
 * Responde con la caja abierta: cuánto se abrió, qué entró y salió, y cuánto
 * DEBERÍA haber. Ese "debería" es un derivado, no un conteo: lo que hay de
 * verdad sale de contar la plata, y se declara como tal para que nadie cierre
 * una caja creyendo que el sistema ya la contó.
 *
 * Solo lectura. Abrir, cerrar y arquear se hacen en Caja, donde queda el
 * responsable y el conteo por denominación.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { CashRegistersDB } from "@/lib/db/sales.db";

const soles = (n: number) => Math.round(n * 100) / 100;

async function estado(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  log.info("Leyendo la caja abierta");

  const caja = await CashRegistersDB.getOpen(task.tenantId);
  if (!caja) {
    return {
      success: true,
      data: {
        abierta: false,
        mensaje: "No hay ninguna caja abierta ahora mismo.",
      },
    };
  }

  const movs = caja.movements ?? [];
  const entradas = movs.filter((m) => m.type === "ingreso");
  const salidas = movs.filter((m) => m.type === "egreso");
  const sumar = (xs: { amount: number }[]) => soles(xs.reduce((a, m) => a + Number(m.amount ?? 0), 0));

  const totalEntradas = sumar(entradas);
  const totalSalidas = sumar(salidas);
  const apertura = soles(Number(caja.openingAmount ?? 0));

  // Por método de pago: lo que entró en efectivo es lo único que se puede
  // contar en el cajón. Yape y tarjeta se cruzan contra su propio reporte.
  const porMetodo: Record<string, number> = {};
  for (const m of entradas) {
    const metodo = String(m.method ?? "efectivo");
    porMetodo[metodo] = soles((porMetodo[metodo] ?? 0) + Number(m.amount ?? 0));
  }

  return {
    success: true,
    data: {
      abierta: true,
      abiertaDesde: caja.openedAt ? String(caja.openedAt).slice(0, 16).replace("T", " ") : null,
      montoApertura: apertura,
      entradas: { total: totalEntradas, movimientos: entradas.length, porMetodo },
      salidas: { total: totalSalidas, movimientos: salidas.length },
      /**
       * Lo que el sistema calcula. NO es lo que hay: eso sale de contar.
       * Nombrarlo "esperado" y no "saldo" es la diferencia entre un arqueo y
       * una cifra que nadie verificó.
       */
      efectivoEsperado: soles(apertura + (porMetodo.efectivo ?? 0) - totalSalidas),
      aclaracion:
        "«efectivoEsperado» es lo que debería haber en el cajón según el sistema. Lo que hay de verdad se sabe contando: el arqueo se hace en la pestaña Caja.",
    },
  };
}

export const cajaAgent: DomainAgent = {
  domain: "caja",
  actions: ["estado"],
  description:
    "Estado de la caja abierta: apertura, entradas por método de pago, salidas y efectivo esperado. Solo lectura.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    if (task.action === "estado") return estado(task, ctx);
    return { success: false, error: `Acción desconocida de caja: ${task.action}` };
  },
};
