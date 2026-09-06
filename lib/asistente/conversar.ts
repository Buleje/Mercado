import "server-only";

/**
 * lib/asistente/conversar.ts
 *
 * El asistente que anota y además entiende de qué le hablás.
 *
 * Reemplaza al anotador de una sola frase (`lib/plata/anotar`) que sólo sabía
 * escribir y arrancaba de cero en cada mensaje. Los cuatro cambios que lo
 * separan de aquello, en orden de cuánto se notan:
 *
 *   1. **Memoria** (`./memoria`). Sin ella, «el N12» después de un «¿cuál de
 *      los dos?» era una frase suelta. Era el 90 % del «no entiende».
 *   2. **Contexto** (`./contexto`). Sabe qué máquinas, personas y cuentas
 *      existen ANTES de buscar: entiende a la primera y no inventa.
 *   3. **Herramientas por intención** (`lib/agents/tool-routing`, el mismo del
 *      panel). Deja de ser un anotador ciego: también contesta «¿cuánto gasté
 *      este mes?», «¿quién me debe?», «¿cómo viene la caja?».
 *   4. **Varias operaciones por mensaje.** Un audio que dicta tres cosas deja
 *      tres tarjetas, no una. Antes devolvía en la primera y perdía el resto.
 */

import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { resolveToolCall, isToolApprovalRequired } from "@/lib/agents/tool-definitions";
import { toolsParaMensaje } from "@/lib/agents/tool-routing";
import { stashPendingApproval } from "@/lib/agents/pending-approvals";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";
import type { Role } from "@/lib/auth/role-permissions";
import { recordar, anotarTurno, type MensajeTurno } from "./memoria";
import { contextoDelNegocio } from "./contexto";

/** Tres vueltas: buscar → escribir → rematar. Una cuarta ya es un loop. */
const MAX_RONDAS = 3;

/** Cuántas herramientas se ejecutan por vuelta. */
const MAX_POR_RONDA = 5;

const SISTEMA = (hoy: string, contexto: string) => `Sos el asistente de Buleje, una empresa familiar de
Pucallpa, Perú: bodega, aserradero y maquinaria. Trabajás para el dueño, que te
habla por chat o te manda audios desde la calle, el patio o el camión.

Hoy es ${hoy}.

QUÉ HAY EN ESTE NEGOCIO — con sus ids, para que los uses directo:
${contexto}

Esa lista es tu memoria del negocio. Si lo que te nombran está ahí, **usá el id
de la lista y anotá en el mismo paso**: no hace falta buscar lo que ya tenés
delante. «El N12», «el de la placa A4B», «Juan», «el BCP» son formas normales de
nombrar — no pidas el nombre completo.
Buscá con las herramientas SÓLO si lo que te nombran no está en esa lista.
No repitas la lista en tus respuestas.

CÓMO SOS
- Hablás como un peruano de confianza: corto, claro, sin vueltas ni saludos largos.
- Nunca decís «como asistente de IA». Sos el que lleva las cuentas, y punto.
- Máximo 3 líneas por respuesta, salvo que te pidan un detalle.
- Los montos siempre en soles, con la forma «S/ 675.00».

LO QUE HACÉS
1. ANOTÁS lo que pasó: gastos, ingresos, adelantos, cobros, compras a
   proveedores, movimientos entre cuentas, fletes. Es tu trabajo principal.
2. CONTESTÁS sobre el negocio con las herramientas de lectura que tengas a mano.
3. Si no tenés la herramienta para algo, decilo en una línea y ofrecé la pantalla
   donde se hace. No inventes que lo hiciste.

CÓMO ANOTÁS
1. Si el id está en la lista de arriba, usalo y andá derecho al paso 3.
2. Si no está, buscalo (máquina, persona, deuda, proveedor, cuenta, lote, producto).
   JAMÁS inventes un id: si no está en la lista ni lo devolvió la búsqueda, no
   existe. La búsqueda te da su veredicto en "mensaje": si trae "recomendado",
   usá ESE id y seguí. Que aparezcan otras filas parecidas NO es una duda.
3. Llamá a la herramienta que anota. El usuario ve un resumen y confirma; recién
   ahí se escribe. Vos no confirmás por él ni digas que ya quedó anotado.

CUÁNDO PREGUNTAR, Y CUÁNDO NO
- Preguntá sólo si falta un dato que NO podés deducir: el monto, o cuál de dos
  cosas que se parecen tanto que no las podés distinguir.
- NO preguntes «¿cuál?» si el usuario ya te lo dijo, aunque lo haya dicho corto.
  «El N12» es una respuesta completa si en la lista hay un Camión N12.
- NO pidas confirmación por chat («¿lo anoto?»): para eso está la tarjeta.
  Llamá a la herramienta y el sistema le muestra el resumen con los botones.

REGLAS QUE NO SE NEGOCIAN
- Cuando hay cantidad y precio por unidad, pasá LOS DOS y no multipliques vos:
  el sistema lo hace y muestra la operación para que se pueda auditar.
- Si falta un dato imprescindible (el monto, de quién, de qué máquina), hacé UNA
  pregunta concreta y corta. No inventes el dato que falta ni lo pongas en cero.
- Si te dicen VARIAS cosas en un mensaje («cargué petróleo y pagué el peaje»),
  llamá a TODAS las herramientas en la MISMA respuesta: una por operación, todas
  juntas. No las hagas de a una ni te quedes con la primera.
- Si te contestan algo corto («el N12», «sí», «300»), estás en medio de una
  conversación: mirá lo que venían hablando antes de preguntar de nuevo.
- Si una herramienta devuelve un error, contalo tal cual: están escritos para que
  los entienda el dueño («supera el límite de crédito de Juan»).
- Si ya anotaste algo hace un momento y te lo repiten igual, avisá antes de
  duplicarlo.`;

export interface Pendiente {
  id: string;
  resumen: string;
  tool: string;
}

export interface RespuestaAsistente {
  /** Lo que el asistente dice. `null` si sólo dejó operaciones para confirmar. */
  texto: string | null;
  /** Operaciones esperando el Confirmar del usuario. */
  pendientes: Pendiente[];
  /** Operaciones ya escritas (sólo con `confirmarAutomatico`). */
  registradas: Array<{ resumen: string; pantalla?: string }>;
}

export interface Turno {
  tenantId: string;
  /** Identifica la conversación: `telegram:<chatId>`, `n8n:<quien>`. */
  sesionId: string;
  texto: string;
  actorRole: Role;
  solicitante: string;
  canal?: string;
  /**
   * `true` = escribir sin pedir confirmación.
   *
   * Para flujos que YA le preguntaron a la persona del otro lado. Por defecto
   * `false`: la operación queda pendiente y el canal muestra el resumen.
   */
  confirmarAutomatico?: boolean;
}

export async function conversar(turno: Turno): Promise<RespuestaAsistente> {
  const { tenantId, sesionId, texto, actorRole, solicitante, canal, confirmarAutomatico = false } = turno;

  if (!texto.trim()) return { texto: "No me llegó nada. ¿Qué anoto?", pendientes: [], registradas: [] };
  if (texto.length > 2000) {
    return { texto: "Ese mensaje es larguísimo. Contámelo en partes, una operación por vez.", pendientes: [], registradas: [] };
  }

  await ensureAgentsRegistered();

  const hoy = new Date().toLocaleDateString("es-PE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const contexto = await contextoDelNegocio(tenantId);

  /**
   * El `system` se rearma cada turno con la fecha y el contexto frescos; el
   * historial guarda sólo el ida y vuelta. Guardar el system en la memoria
   * congelaría el «hoy» del primer mensaje de la conversación.
   */
  const historial = recordar(sesionId, tenantId);
  const mensajes: MensajeTurno[] = [
    { role: "system", content: SISTEMA(hoy, contexto) },
    ...historial,
    { role: "user", content: texto },
  ];

  /**
   * Las herramientas salen del ruteo por intención, igual que en el panel: el
   * catálogo entero no entra en el límite por minuto de la cuenta.
   *
   * Se mira el mensaje NUEVO junto al anterior del usuario: si el bot preguntó
   * «¿cuál camión?» y la respuesta es «el N12», esa frase sola no menciona
   * ningún dominio y se quedaría sin las herramientas de plata justo cuando
   * hacen falta.
   */
  const ultimoDelUsuario = [...historial].reverse().find((m) => m.role === "user")?.content ?? "";
  const herramientas = toolsParaMensaje(`${ultimoDelUsuario} ${texto}`);

  const pendientes: Pendiente[] = [];
  const registradas: Array<{ resumen: string; pantalla?: string }> = [];
  let ultimoTexto: string | null = null;

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const res = await callLLM("balanced", {
      messages: mensajes,
      temperature: 0.2,
      maxTokens: 900,
      stream: false,
      tools: herramientas,
      toolChoice: "auto",
      label: "asistente-conversar",
    });

    if (!res.ok) {
      logger.error("[asistente] el modelo no respondió", { tenantId, canal, error: String(res.error) });
      const porMinuto = /tokens per minute|TPM/i.test(String(res.error));
      return {
        texto: porMinuto
          ? "Me quedé sin cupo por un minuto. Mandámelo de nuevo en un ratito y lo anoto."
          : "No pude procesarlo ahora. Probá de nuevo en un momento.",
        pendientes,
        registradas,
      };
    }

    if (res.content?.trim()) ultimoTexto = res.content.trim();

    if (!res.toolCalls || res.toolCalls.length === 0) break;

    mensajes.push({ role: "assistant", content: res.content ?? "", tool_calls: res.toolCalls });

    let huboLectura = false;

    for (const llamada of res.toolCalls.slice(0, MAX_POR_RONDA)) {
      const nombre = llamada.function?.name ?? "";
      const mapping = resolveToolCall(nombre);
      if (!mapping) {
        mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify({ error: `Herramienta "${nombre}" desconocida` }) });
        continue;
      }

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(llamada.function.arguments || "{}"); } catch { args = {}; }

      // ── Escritura ────────────────────────────────────────────────────────
      if (isToolApprovalRequired(nombre)) {
        const ensayo = await orchestrator.executeSync({
          domain: mapping.domain,
          action: mapping.action,
          payload: { ...args, __validar: true },
          tenantId,
          actorRole,
        });
        if (!ensayo.success) {
          // El error vuelve al modelo, que puede corregir en la vuelta siguiente
          // (buscar bien la máquina, preguntar por el monto que no cuadra).
          mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify({ error: ensayo.error }) });
          continue;
        }
        const resumen = (ensayo.data as { resumen?: string } | undefined)?.resumen ?? "Operación lista para confirmar.";

        if (!confirmarAutomatico) {
          const id = stashPendingApproval({
            tenantId, toolName: nombre, domain: mapping.domain, action: mapping.action,
            payload: args, requestedBy: solicitante,
          });
          pendientes.push({ id, resumen, tool: nombre });
          /**
           * El modelo tiene que saber que ya la propuso, o en la vuelta
           * siguiente la propone de nuevo y quedan dos tarjetas para la misma
           * operación.
           */
          mensajes.push({
            role: "tool",
            tool_call_id: llamada.id,
            content: JSON.stringify({ propuesta: true, resumen, mensaje: "Ya le mostré esta operación al usuario para que la confirme. No la vuelvas a proponer." }),
          });
          continue;
        }

        const escritura = await orchestrator.executeSync({
          domain: mapping.domain, action: mapping.action, payload: args, tenantId, actorRole,
        });
        const datos = (escritura.data ?? {}) as Record<string, unknown>;
        if (escritura.success) {
          registradas.push({
            resumen: String(datos.confirmacion ?? resumen),
            pantalla: (datos.dondeVerlo as { pantalla?: string } | undefined)?.pantalla,
          });
        }
        mensajes.push({
          role: "tool",
          tool_call_id: llamada.id,
          content: JSON.stringify(escritura.success ? datos : { error: escritura.error }),
        });
        continue;
      }

      // ── Lectura ──────────────────────────────────────────────────────────
      huboLectura = true;
      const lectura = await orchestrator.executeSync({
        domain: mapping.domain, action: mapping.action, payload: args, tenantId, actorRole,
      });
      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: JSON.stringify(lectura.success ? lectura.data : { error: lectura.error }),
      });
    }

    /**
     * Cuándo dejar de dar vueltas.
     *
     * Cortar apenas hay UNA operación propuesta perdía la segunda: «cargué
     * petróleo y pagué la luz» dejaba una sola tarjeta. Pero seguir siempre es
     * pagar una llamada de más —~2.400 tokens de esquema— en el caso normal,
     * que es una sola operación.
     *
     * El corte mira si el mensaje del usuario ENUMERA: cuando dice «y también»,
     * «además», «aparte», hay motivo para darle otra vuelta al modelo. Si no,
     * con una propuesta alcanza.
     */
    const enumera = /\b(y (tambien|también|ademas|además|aparte|de paso)|tambien|también|ademas|además|aparte|,\s*y\b)/i.test(texto);
    const yaPropuso = pendientes.length > 0 || registradas.length > 0;
    if (!huboLectura && yaPropuso && !(enumera && pendientes.length + registradas.length < 2)) break;
  }

  anotarTurno(sesionId, tenantId, mensajes.slice(1));

  logger.info("[asistente] turno resuelto", {
    tenantId, canal, pendientes: pendientes.length, registradas: registradas.length,
  });

  return { texto: ultimoTexto, pendientes, registradas };
}
