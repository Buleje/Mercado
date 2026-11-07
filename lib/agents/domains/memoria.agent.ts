import "server-only";

/**
 * lib/agents/domains/memoria.agent.ts — lo que el asistente aprende del negocio
 * (Buleje IA, ADR-528).
 *
 * «Recuerda que el N12 es el camión blanco», «al grifo de la esquina le decimos
 * Santa Rosa», «¿qué sabes del Flaco?». Lo guardado vuelve solo en cada mensaje
 * que comparte palabras (`contextoDelNegocio`), así que el próximo «tanqueé el
 * camión blanco» ya sabe que es el N12.
 *
 * Recordar NO pide confirmación: no mueve plata ni compromete a nadie, y se
 * corrige diciéndolo de nuevo (mismo título = actualiza). Olvidar SÍ: borrar lo
 * que el negocio enseñó no se deshace.
 *
 * Enseñar y olvidar: SOLO dueño o admin (security ADR-528). Lo guardado entra
 * al asistente de TODO el negocio y `chat:write` lo tienen manager, cajero y
 * almacenero: un cajero no puede reescribir «el N12» que enseñó el dueño ni
 * meterle datos al asistente del resto. Como solo escriben admin/owner, pisar
 * una memoria con el mismo título nunca la pisa alguien de menos rango.
 */

import { logger } from "@/lib/logger";
import {
  AsistenteMemoriaDB,
  TopeMemoriasError,
  esTipoMemoria,
} from "@/lib/db/asistente-memoria.db";
import type { MemoriaItem } from "@/lib/ia-proveedores/tipos";
import { texto, esEnsayo } from "./plata/comun";
import type { AgentTask, AgentContext, AgentResult, DomainAgent } from "../types";

const TOPE_TITULO = 120;
const TOPE_TEXTO = 1000;

const ROLES_ENSENAN = new Set(["admin", "owner"]);
const SOLO_DUENO = "Solo el dueño o el administrador pueden enseñarme datos del negocio.";

/** `null` = puede; si no, el error para el modelo. Sin rol (tarea interna) = no. */
function soloDuenoOAdmin(ctx: AgentContext): AgentResult | null {
  return ctx.actorRole && ROLES_ENSENAN.has(ctx.actorRole) ? null : { success: false, error: SOLO_DUENO };
}

/** De dónde vino, por el actor del contexto («whatsapp:…», «telegram», «mcp:…»). */
function fuenteDe(ctx: AgentContext): string {
  const a = (ctx.actorId ?? "").toLowerCase();
  for (const f of ["telegram", "whatsapp", "mcp", "n8n"]) if (a.startsWith(f)) return f;
  return "app";
}

/** Lo que vuelve al modelo: corto (cada token viaja en la siguiente vuelta). */
const breve = (m: MemoriaItem) => ({ id: m.id, tipo: m.tipo, titulo: m.titulo, texto: m.texto });

async function recordar(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const sinPermiso = soloDuenoOAdmin(ctx);
  if (sinPermiso) return sinPermiso;
  const p = task.payload;
  const titulo = texto(p.titulo).slice(0, TOPE_TITULO);
  const contenido = texto(p.texto).slice(0, TOPE_TEXTO);
  if (!titulo || !contenido) {
    return {
      success: false,
      error: "Falta qué recordar: `titulo` (de qué se trata, ej. «Camión blanco») y `texto` (lo que hay que saber).",
    };
  }
  const tipoCrudo = texto(p.tipo).toLowerCase();
  const tipo = esTipoMemoria(tipoCrudo) ? tipoCrudo : "dato";
  const entidadTipo = texto(p.entidadTipo) || null;
  const entidadId = texto(p.entidadId) || null;

  if (esEnsayo(task)) {
    return { success: true, data: { resumen: `Recordar «${titulo}»: ${contenido}` } };
  }

  try {
    const { item, actualizada } = await AsistenteMemoriaDB.recordar(task.tenantId, {
      tipo,
      titulo,
      texto: contenido,
      entidadTipo,
      entidadId,
      fuente: fuenteDe(ctx),
      creadoPor: ctx.actorUsuario ?? ctx.actorId ?? "",
    });
    return {
      success: true,
      data: {
        id: item.id,
        actualizada,
        confirmacion: actualizada ? `Actualicé lo que sabía de «${item.titulo}».` : `Lo recordaré: «${item.titulo}».`,
      },
    };
  } catch (err) {
    if (err instanceof TopeMemoriasError) return { success: false, error: err.message };
    logger.error("[memoria] recordar falló", { tenantId: task.tenantId, error: String(err) });
    return { success: false, error: "No pude guardar ese dato ahora." };
  }
}

async function buscar(task: AgentTask): Promise<AgentResult> {
  const q = texto(task.payload.q);
  const items = q
    ? await AsistenteMemoriaDB.buscar(task.tenantId, q, 10)
    : (await AsistenteMemoriaDB.listar(task.tenantId)).slice(0, 10);
  return {
    success: true,
    data: {
      total: items.length,
      memorias: items.map(breve),
      resumen: items.length === 0 ? "No tengo nada guardado sobre eso." : `${items.length} cosa(s) que recuerdo.`,
    },
  };
}

async function olvidar(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const sinPermiso = soloDuenoOAdmin(ctx);
  if (sinPermiso) return sinPermiso;
  const id = texto(task.payload.id);
  if (!id) {
    return { success: false, error: "Falta el id de la memoria. Búscala con memoria_buscar y usa el id que devuelve." };
  }
  const m = await AsistenteMemoriaDB.obtener(task.tenantId, id);
  if (!m) return { success: false, error: `No existe una memoria con id "${id}" en este negocio.` };

  if (esEnsayo(task)) {
    return { success: true, data: { resumen: `Olvidar «${m.titulo}»: ${m.texto}` } };
  }
  const ok = await AsistenteMemoriaDB.olvidar(task.tenantId, id);
  if (!ok) return { success: false, error: "No se pudo olvidar esa memoria." };
  return { success: true, data: { confirmacion: `Olvidé «${m.titulo}».` } };
}

export const memoriaAgent: DomainAgent = {
  domain: "memoria",
  actions: ["recordar", "buscar", "olvidar"],
  description: "Lo que el negocio le enseña al asistente: apodos, alias de máquinas y personas, preferencias y datos sueltos.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    switch (task.action) {
      case "recordar":
        return recordar(task, ctx);
      case "buscar":
        return buscar(task);
      case "olvidar":
        return olvidar(task, ctx);
      default:
        return { success: false, error: `Acción desconocida de memoria: ${task.action}` };
    }
  },
};
