/**
 * lib/agents/domains/n8n.agent.ts
 *
 * «Mandale esto al contador» — el asistente dispara flujos que el dueño ya armó
 * en n8n, sin salir del chat.
 *
 * El agente NO sabe automatizar nada: sabe qué flujos hay (nombre + para qué
 * sirve, escritos por el dueño) y sabe pegarles. Toda la lógica vive en n8n,
 * que es donde se puede ver, editar y depurar.
 *
 * El matching es por PALABRAS de 4+ letras contra nombre y descripción, no por
 * substring: es la misma regla que `ui.agent`, y está por la misma razón — un
 * destino inventado que calza por dos letras dispara el flujo equivocado, y un
 * flujo equivocado manda datos del negocio a donde no va.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { getN8nConfig, dispararFlujo, anotarDisparo, type N8nFlow } from "@/lib/n8n/flows";

function palabras(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
}

/** Cuántas palabras del pedido aparecen en el nombre/descripción del flujo. */
function puntuar(flujo: N8nFlow, pedido: string): number {
  const suyas = new Set([...palabras(flujo.nombre), ...palabras(flujo.descripcion)]);
  const pedidas = palabras(pedido);
  if (pedidas.length === 0) return 0;
  // El nombre pesa más que la descripción: es lo que el dueño eligió llamarle.
  const enNombre = new Set(palabras(flujo.nombre));
  return pedidas.reduce((s, w) => s + (enNombre.has(w) ? 2 : suyas.has(w) ? 1 : 0), 0);
}

async function listarFlujos(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const { flujos } = await getN8nConfig(task.tenantId);
  const activos = flujos.filter((f) => f.activo);
  scopedLogger(ctx).info("Listando flujos n8n", { total: flujos.length, activos: activos.length });

  return {
    success: true,
    data: {
      cantidad: activos.length,
      flujos: activos.map((f) => ({
        flujoId: f.id,
        nombre: f.nombre,
        paraQue: f.descripcion,
        ultimoDisparo: f.ultimoDisparo ?? null,
      })),
      ...(activos.length === 0 && {
        mensaje:
          "No hay flujos de n8n configurados. Se agregan en Asistente IA › Automatizaciones, " +
          "pegando la URL del webhook del flujo.",
      }),
    },
  };
}

async function dispararFlujoAccion(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const { flujos } = await getN8nConfig(task.tenantId);
  const activos = flujos.filter((f) => f.activo);

  if (activos.length === 0) {
    return {
      success: false,
      error:
        "No hay ningún flujo de n8n configurado todavía. Se agregan en Asistente IA › Automatizaciones.",
    };
  }

  const pedido = String(task.payload.flujo ?? task.payload.nombre ?? "").trim();
  const idExacto = String(task.payload.flujoId ?? "").trim();

  let elegido: N8nFlow | undefined;
  if (idExacto) {
    elegido = activos.find((f) => f.id === idExacto);
    if (!elegido) {
      return { success: false, error: `No existe un flujo activo con id "${idExacto}". Listalos con n8n_listar_flujos.` };
    }
  } else {
    if (!pedido) {
      return { success: false, error: "Decime qué flujo disparar. Listalos primero con n8n_listar_flujos." };
    }
    const rank = activos
      .map((f) => ({ f, score: puntuar(f, pedido) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (rank.length === 0) {
      return {
        success: false,
        error:
          `Ningún flujo coincide con "${pedido}". Los que hay: ${activos.map((f) => f.nombre).join(", ")}.`,
      };
    }
    /**
     * Empate = preguntar.
     *
     * Disparar un flujo manda datos afuera: elegir entre dos que puntúan igual
     * es acertar la mitad de las veces, y la mitad equivocada no se deshace.
     */
    if (rank.length > 1 && rank[0].score === rank[1].score) {
      return {
        success: false,
        error:
          `"${pedido}" calza igual con ${rank.slice(0, 3).map((r) => `"${r.f.nombre}"`).join(" y ")}. ` +
          "Preguntá cuál antes de disparar nada.",
      };
    }
    elegido = rank[0].f;
  }

  const datos =
    task.payload.datos && typeof task.payload.datos === "object"
      ? (task.payload.datos as Record<string, unknown>)
      : { mensaje: String(task.payload.mensaje ?? pedido) };

  // Ensayo: el route lo corre antes de ofrecer la confirmación. Nada sale a la
  // red hasta que alguien apretó Confirmar.
  if (task.payload.__validar === true) {
    return {
      success: true,
      data: {
        resumen:
          `Disparar el flujo "${elegido.nombre}" en n8n (${elegido.descripcion}). ` +
          `Se le manda: ${JSON.stringify(datos).slice(0, 220)}`,
        flujo: elegido.nombre,
        datos,
      },
    };
  }

  log.info("Disparando flujo n8n", { flujo: elegido.nombre });
  const res = await dispararFlujo(task.tenantId, elegido, datos);
  anotarDisparo(task.tenantId, elegido.id, res).catch((err) =>
    log.error("[n8n] no se pudo anotar el disparo", { error: String(err) }),
  );

  if (!res.ok) {
    return { success: false, error: `El flujo "${elegido.nombre}" falló: ${res.error ?? `HTTP ${res.status}`}` };
  }
  return {
    success: true,
    data: {
      disparado: true,
      flujo: elegido.nombre,
      status: res.status,
      respuesta: res.respuesta ?? null,
      confirmacion: `Listo: se disparó "${elegido.nombre}" en n8n.`,
    },
  };
}

export const n8nAgent: DomainAgent = {
  domain: "n8n",
  actions: ["listar-flujos", "disparar-flujo"],
  description:
    "Puente con n8n: lista los flujos de automatización que configuró el dueño y los dispara por su webhook. Disparar pasa por confirmación humana.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    try {
      switch (task.action) {
        case "listar-flujos":  return await listarFlujos(task, ctx);
        case "disparar-flujo": return await dispararFlujoAccion(task, ctx);
        default:
          return { success: false, error: `Acción desconocida de n8n: ${task.action}` };
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      scopedLogger(ctx).error("n8n agent falló", { action: task.action, error: mensaje });
      return { success: false, error: mensaje };
    }
  },
};
