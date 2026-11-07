import "server-only";

/**
 * lib/mcp-servidor/herramientas.ts — Buleje IA (ADR-528), carril 4.
 *
 * El catálogo de agentes (`ALL_AGENT_TOOLS`) visto como herramientas MCP, y su
 * ejecución con el usuario y el rol de la conexión. Mismo camino que el chat
 * (`lib/asistente/conversar.ts`): `resolveToolCall` → `orchestrator.executeSync`
 * con el RBAC del orquestador; nada de rutas ni Prisma propios.
 *
 * Tres clases de herramienta:
 *  - lectura: permiso `read` y sin `requiresApproval`. Las únicas que ve una
 *    conexión con `permiteEscribir=false`.
 *  - escritura con OK (`requiresApproval`): corre el ensayo (`__validar`) y deja
 *    un pendiente; `confirmar_operacion { aprobacionId }` la ejecuta.
 *  - escritura directa (permiso `write`/`delete` sin `requiresApproval`, p. ej.
 *    recordar algo): se ejecuta como en el chat y se audita.
 */

import {
  ALL_AGENT_TOOLS,
  ensureAgentsRegistered,
  orchestrator,
  resolveToolCall,
  type ToolDefinition,
} from "@/lib/agents";
import { AGENT_ACTION_PERMISSIONS } from "@/lib/agents/permissions";
import {
  getPendingApproval,
  payloadsDelEnsayo,
  removePendingApproval,
  stashPendingApproval,
} from "@/lib/agents/pending-approvals";
import { checkPermission, type Role } from "@/lib/auth/role-permissions";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import type { ConexionAutenticada } from "@/lib/db/asistente-conexiones.db";

export const HERRAMIENTA_CONFIRMAR = "confirmar_operacion";
export const HERRAMIENTA_CANCELAR = "cancelar_operacion";

/** Lo que vuelve al modelo como texto: una lista de 5.000 productos no cabe en su ventana. */
const TOPE_TEXTO = 60_000;

export type ClaseHerramienta = "lectura" | "escritura_con_ok" | "escritura_directa";

export interface HerramientaMcp {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint: boolean };
}

export interface ResultadoHerramienta {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Quién llama, ya autenticado, con el rol RE-LEÍDO del usuario del panel. */
export interface ActorMcp {
  conexion: ConexionAutenticada;
  rol: Role;
}

type Dominio = Parameters<typeof orchestrator.executeSync>[0]["domain"];

/** `null` = la herramienta no tiene permiso mapeado: el orquestador la negaría igual. */
export function claseDe(tool: ToolDefinition): ClaseHerramienta | null {
  const mapping = resolveToolCall(tool.function.name);
  if (!mapping) return null;
  const perm = AGENT_ACTION_PERMISSIONS[mapping.domain]?.[mapping.action];
  if (!perm) return null;
  if (tool.requiresApproval) return "escritura_con_ok";
  return perm.action === "read" ? "lectura" : "escritura_directa";
}

function puedeElRol(rol: Role, tool: ToolDefinition): boolean {
  const mapping = resolveToolCall(tool.function.name);
  const perm = mapping ? AGENT_ACTION_PERMISSIONS[mapping.domain]?.[mapping.action] : undefined;
  return perm ? checkPermission(rol, perm.resource, perm.action) : false;
}

/** El quién de la auditoría y del pendiente: la conexión, no solo el usuario. */
export function solicitanteDe(conexion: ConexionAutenticada): string {
  return `mcp:${conexion.id}`;
}

const HERRAMIENTAS_DE_CONFIRMACION: HerramientaMcp[] = [
  {
    name: HERRAMIENTA_CONFIRMAR,
    title: "Confirmar una operación propuesta",
    description:
      "Ejecuta una operación que otra herramienta dejó propuesta (devolvió `pendiente: true` y un `aprobacionId`). " +
      "Llámala SOLO después de mostrarle el resumen a la persona y de que ella diga claramente que sí. " +
      "Nunca la llames por tu cuenta. Las propuestas vencen a los 10 minutos.",
    inputSchema: {
      type: "object",
      properties: { aprobacionId: { type: "string", description: "El aprobacionId que devolvió la propuesta." } },
      required: ["aprobacionId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: HERRAMIENTA_CANCELAR,
    title: "Cancelar una operación propuesta",
    description: "Descarta una operación propuesta sin ejecutarla (cuando la persona dice que no o que estaba mal).",
    inputSchema: {
      type: "object",
      properties: { aprobacionId: { type: "string", description: "El aprobacionId que devolvió la propuesta." } },
      required: ["aprobacionId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function aMcp(tool: ToolDefinition, clase: ClaseHerramienta): HerramientaMcp {
  const nota =
    clase === "escritura_con_ok"
      ? "\n\nNo anota todavía: deja la operación propuesta. Muéstrale el `resumen` a la persona y, solo si dice que sí, llama a `confirmar_operacion` con el `aprobacionId`."
      : "";
  return {
    name: tool.function.name,
    description: tool.function.description + nota,
    inputSchema: { ...tool.function.parameters },
    annotations: {
      readOnlyHint: clase === "lectura",
      destructiveHint: clase !== "lectura",
      openWorldHint: false,
    },
  };
}

/**
 * Lo que ve la app de afuera: solo lo que el rol actual puede hacer, y sin
 * escrituras si la conexión es de consulta.
 */
export function listarHerramientas(actor: ActorMcp): HerramientaMcp[] {
  const lista: HerramientaMcp[] = [];
  for (const tool of ALL_AGENT_TOOLS) {
    const clase = claseDe(tool);
    if (!clase) continue;
    if (clase !== "lectura" && !actor.conexion.permiteEscribir) continue;
    if (!puedeElRol(actor.rol, tool)) continue;
    lista.push(aMcp(tool, clase));
  }
  if (actor.conexion.permiteEscribir) lista.push(...HERRAMIENTAS_DE_CONFIRMACION);
  return lista;
}

function texto(datos: unknown, isError = false): ResultadoHerramienta {
  let t = typeof datos === "string" ? datos : JSON.stringify(datos ?? null);
  if (t.length > TOPE_TEXTO) t = `${t.slice(0, TOPE_TEXTO)}… [recortado: pide menos filas o filtra]`;
  const r: ResultadoHerramienta = { content: [{ type: "text", text: t }] };
  if (typeof datos === "object" && datos !== null && !Array.isArray(datos) && t.length <= TOPE_TEXTO) {
    r.structuredContent = datos as Record<string, unknown>;
  }
  if (isError) r.isError = true;
  return r;
}

function fallo(mensaje: string): ResultadoHerramienta {
  return texto({ error: mensaje }, true);
}

/** El orquestador niega con «FORBIDDEN: role …»: dicho así, el modelo lo reintenta. */
function errorLegible(error: string | undefined): string {
  if (!error) return "error desconocido";
  if (/^FORBIDDEN/.test(error)) {
    return "No autorizado: el usuario de esta conexión no tiene permiso para esto (en el panel tampoco).";
  }
  return error;
}

/**
 * Las claves internas (`__validar`, …) las pone el servidor, nunca la app de
 * afuera: un `__validar: false` mandado por el modelo no puede saltarse el ensayo.
 */
function argumentosLimpios(args: Record<string, unknown>): Record<string, unknown> {
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (!k.startsWith("__")) limpio[k] = v;
  return limpio;
}

function auditar(actor: ActorMcp, accion: string, detalle: string): void {
  const { conexion } = actor;
  logActivity(accion, "asistente_conexion", detalle, conexion.id, conexion.usuario, undefined, conexion.tenantId).catch(
    (err) => logger.error("[mcp] auditar la escritura falló", { error: String(err) }),
  );
}

export type ResultadoLlamada = { desconocida: true } | { desconocida: false; resultado: ResultadoHerramienta };

/**
 * Ejecuta una herramienta. `desconocida` = el nombre no existe para esta
 * conexión (JSON-RPC -32602); todo lo demás vuelve como resultado, con
 * `isError` si falló (así el modelo lo lee y corrige).
 */
export async function llamarHerramienta(
  actor: ActorMcp,
  nombre: string,
  argsCrudos: Record<string, unknown>,
): Promise<ResultadoLlamada> {
  const { conexion, rol } = actor;
  const args = argumentosLimpios(argsCrudos);

  if (nombre === HERRAMIENTA_CONFIRMAR || nombre === HERRAMIENTA_CANCELAR) {
    if (!conexion.permiteEscribir) return { desconocida: true };
    return { desconocida: false, resultado: await resolverPendiente(actor, nombre === HERRAMIENTA_CONFIRMAR, args) };
  }

  const tool = ALL_AGENT_TOOLS.find((t) => t.function.name === nombre);
  const mapping = tool ? resolveToolCall(nombre) : undefined;
  const clase = tool ? claseDe(tool) : null;
  if (!tool || !mapping || !clase) return { desconocida: true };

  if (clase !== "lectura" && !conexion.permiteEscribir) {
    return {
      desconocida: false,
      resultado: fallo("Esta conexión es solo para consultar. Para anotar, el dueño tiene que activar «puede anotar» en Buleje IA › Conectar apps."),
    };
  }

  await ensureAgentsRegistered();
  const base = {
    domain: mapping.domain as Dominio,
    action: mapping.action,
    tenantId: conexion.tenantId,
    actorRole: rol,
    actorId: conexion.usuario,
    actorUsuario: conexion.usuario,
  };

  if (clase === "lectura") {
    const r = await orchestrator.executeSync({ ...base, payload: args });
    return { desconocida: false, resultado: r.success ? texto(r.data) : fallo(errorLegible(r.error)) };
  }

  if (clase === "escritura_con_ok") {
    const ensayo = await orchestrator.executeSync({ ...base, payload: { ...args, __validar: true } });
    if (!ensayo.success) return { desconocida: false, resultado: fallo(errorLegible(ensayo.error)) };
    const resumen = (ensayo.data as { resumen?: string } | undefined)?.resumen ?? "Operación lista para confirmar.";
    const { payload, mostrar } = payloadsDelEnsayo(args, ensayo.data);
    const aprobacionId = stashPendingApproval({
      tenantId: conexion.tenantId,
      toolName: nombre,
      domain: mapping.domain,
      action: mapping.action,
      payload,
      mostrar,
      requestedBy: solicitanteDe(conexion),
    });
    return {
      desconocida: false,
      resultado: texto({
        pendiente: true,
        aprobacionId,
        resumen,
        ...(mostrar ? { detalle: mostrar } : {}),
        venceEnMinutos: 10,
        instrucciones:
          "Todavía NO se anotó. Muéstrale este resumen a la persona; solo si dice que sí, llama a confirmar_operacion con este aprobacionId. Si dice que no, cancelar_operacion.",
      }),
    };
  }

  // escritura directa
  const r = await orchestrator.executeSync({ ...base, payload: args });
  auditar(actor, "mcp_escritura", `${nombre}: ${r.success ? "hecho" : `falló (${errorLegible(r.error).slice(0, 120)})`}`);
  return { desconocida: false, resultado: r.success ? texto(r.data) : fallo(errorLegible(r.error)) };
}

/**
 * Confirmar o cancelar. Misma regla de negocio que `POST /api/ai-assistant/approvals`
 * (el tenant del pendiente = el de la conexión) y una más estricta: solo la
 * conexión que lo propuso lo resuelve. Otro negocio, otra conexión o vencido
 * responden lo mismo («no existe»): no se confirma que el id exista.
 *
 * El pendiente se saca del store ANTES del primer `await`: dos confirmaciones
 * a la vez no ejecutan dos veces.
 */
async function resolverPendiente(
  actor: ActorMcp,
  confirmar: boolean,
  args: Record<string, unknown>,
): Promise<ResultadoHerramienta> {
  const { conexion, rol } = actor;
  const aprobacionId = typeof args.aprobacionId === "string" ? args.aprobacionId.trim() : "";
  if (!aprobacionId) return fallo("Falta el aprobacionId de la operación propuesta.");

  const pendiente = getPendingApproval(aprobacionId);
  if (!pendiente || pendiente.tenantId !== conexion.tenantId || pendiente.requestedBy !== solicitanteDe(conexion)) {
    if (pendiente && pendiente.tenantId !== conexion.tenantId) {
      logger.warn("[mcp] confirmar de otro negocio bloqueado", {
        conexionId: conexion.id,
        tenantConexion: conexion.tenantId,
        tenantPendiente: pendiente.tenantId,
      });
    }
    return fallo("Esa operación ya no está pendiente (se confirmó, se canceló o pasaron los 10 minutos). Vuelve a proponerla.");
  }
  removePendingApproval(aprobacionId);

  if (!confirmar) {
    auditar(actor, "mcp_cancelar", `${pendiente.toolName}: cancelada`);
    return texto({ cancelada: true, mensaje: "Listo, no se anotó nada." });
  }

  await ensureAgentsRegistered();
  const r = await orchestrator.executeSync({
    domain: pendiente.domain as Dominio,
    action: pendiente.action,
    payload: pendiente.payload,
    tenantId: conexion.tenantId,
    // Como en approvals: autoriza el rol de quien confirma, re-leído en esta llamada.
    actorRole: rol,
    actorId: conexion.usuario,
    actorUsuario: conexion.usuario,
  });
  const datos = (r.data ?? {}) as Record<string, unknown>;
  auditar(
    actor,
    "mcp_confirmar",
    `${pendiente.toolName}: ${r.success ? String(datos.confirmacion ?? "hecho").slice(0, 200) : `falló (${errorLegible(r.error).slice(0, 120)})`}`,
  );
  return r.success ? texto({ hecho: true, ...datos }) : fallo(errorLegible(r.error));
}
