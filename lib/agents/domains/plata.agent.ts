/**
 * lib/agents/domains/plata.agent.ts
 *
 * «Anotame la compra de combustible del camión N12» — el dominio que convierte
 * una frase en un asiento real.
 *
 * Es el PRIMER dominio del asistente cuyo objeto es escribir plata. Por eso
 * cada acción de escritura respeta el contrato que dejó `inventory.ajustar-stock`
 * (memoria `asistente-ia-eje-central`):
 *
 *   1. `requiresApproval: true` en `tool-definitions` → el chat pinta la tarjeta
 *      [Confirmar]/[Cancelar]. Un monto mal oído no entra a la contabilidad.
 *   2. Modo ensayo (`payload.__validar === true`): valida TODO y devuelve un
 *      `resumen` legible SIN tocar la base. Si el ensayo falla no hay tarjeta,
 *      hay un error que manda al modelo a buscar primero.
 *   3. La escritura va por la MISMA DB class que usa la pantalla equivalente,
 *      para que el registro quede idéntico al que haría una persona a mano.
 *   4. Siempre hay una búsqueda de lectura previa que con más de una
 *      coincidencia parecida responde «preguntá cuál antes de anotar nada».
 *
 * ⚠️ DÓNDE ATERRIZA CADA GASTO (no es lo mismo y la respuesta lo dice):
 *
 *   | Lo que se dicta                    | Dónde se guarda      | Dónde se ve        |
 *   |------------------------------------|----------------------|--------------------|
 *   | «combustible para el camión N12»   | AssetExpense         | Mi Plata › Activos |
 *   | «pagué la luz», «flete», «sueldo»  | Expense              | Mi Plata › Gastos  |
 *
 * Son dos libros distintos y ninguna pantalla los suma: es exactamente lo que
 * hacen hoy los formularios de Activos y de Gastos. Escribir en los dos sería
 * contar la misma plata dos veces. El `resumen` de la tarjeta dice en cuál cae,
 * porque «lo anoté» sin decir dónde manda a buscarlo al lugar equivocado.
 *
 * El detalle vive en `./plata/`: `comun` (formato y validación), `busquedas`
 * (las lecturas que evitan ids inventados) y `escrituras` (lo que mueve plata).
 * Se partió cuando el archivo pasó las 900 líneas.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import {
  buscarMaquina, buscarPersona, buscarDeuda, buscarProveedor, buscarCuenta, buscarLote,
} from "./plata/busquedas";
import {
  registrarGasto, registrarIngreso, registrarAdelanto, cobrarFiado, liquidarAdelanto,
  registrarCompra, moverTesoreria, registrarFlete,
} from "./plata/escrituras";

export const plataAgent: DomainAgent = {
  domain: "plata",
  actions: [
    "buscar-maquina",
    "buscar-persona",
    "buscar-deuda",
    "buscar-proveedor",
    "buscar-cuenta",
    "buscar-lote",
    "registrar-gasto",
    "registrar-ingreso",
    "registrar-adelanto",
    "cobrar-fiado",
    "liquidar-adelanto",
    "registrar-compra",
    "mover-tesoreria",
    "registrar-flete",
  ],
  description:
    "Anota operaciones de plata dictadas en lenguaje natural: gastos (del negocio o de una máquina), ingresos, adelantos, cobros de fiado, liquidaciones, órdenes de compra a proveedores, movimientos de tesorería y fletes forestales. Las escrituras pasan por confirmación humana.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    try {
      switch (task.action) {
        case "buscar-maquina":     return await buscarMaquina(task, ctx);
        case "buscar-persona":     return await buscarPersona(task, ctx);
        case "buscar-deuda":       return await buscarDeuda(task, ctx);
        case "buscar-proveedor":   return await buscarProveedor(task, ctx);
        case "buscar-cuenta":      return await buscarCuenta(task, ctx);
        case "buscar-lote":        return await buscarLote(task, ctx);
        case "registrar-gasto":    return await registrarGasto(task, ctx);
        case "registrar-ingreso":  return await registrarIngreso(task, ctx);
        case "registrar-adelanto": return await registrarAdelanto(task, ctx);
        case "cobrar-fiado":       return await cobrarFiado(task, ctx);
        case "liquidar-adelanto":  return await liquidarAdelanto(task, ctx);
        case "registrar-compra":   return await registrarCompra(task, ctx);
        case "mover-tesoreria":    return await moverTesoreria(task, ctx);
        case "registrar-flete":    return await registrarFlete(task, ctx);
        default:
          return { success: false, error: `Acción desconocida de plata: ${task.action}` };
      }
    } catch (err) {
      /**
       * Los errores de las DB classes son mensajes de negocio pensados para que
       * los lea una persona («Supera el límite de crédito de Juan…»). Se pasan
       * tal cual al modelo: reemplazarlos por «error interno» le saca al usuario
       * lo único que le dice qué hacer.
       */
      const mensaje = err instanceof Error ? err.message : String(err);
      scopedLogger(ctx).error("Plata agent falló", { action: task.action, error: mensaje });
      return { success: false, error: mensaje };
    }
  },
};
