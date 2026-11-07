import "server-only";

/**
 * lib/db/ia-conversaciones.db.ts — historial del chat de la app «Buleje IA» (ADR-528).
 *
 * Usa `AIConversation` (channel "app") + `AIMessage.extra`. Toda lectura y
 * escritura lleva `tenantId` Y `user` en el WHERE: una conversación es de quien
 * la empezó, no de todo el negocio (el IDOR se cierra en la consulta).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ConversacionResumen, MensajeApp, ModeloUsado, PapelDevuelto, PendienteApp } from "@/lib/ia-proveedores/tipos";

export const CANAL_APP = "app";
/** Los mensajes que se traen al abrir una conversación. */
const MAX_MENSAJES = 300;

/** Lo que se guarda en `AIMessage.extra`. */
export interface ExtraMensaje {
  adjuntos?: Array<{ documentoId: string; nombre: string }>;
  pendientes?: PendienteApp[];
  registradas?: Array<{ resumen: string; pantalla?: string }>;
  papeles?: PapelDevuelto[];
  modelo?: ModeloUsado;
}

export interface MensajeNuevo {
  role: "user" | "assistant";
  content: string;
  extra?: ExtraMensaje;
}

interface FilaMensaje {
  id: string;
  role: string;
  content: string;
  extra: unknown;
  createdAt: Date;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = <T>(v: unknown): T[] | undefined => (Array.isArray(v) && v.length > 0 ? (v as T[]) : undefined);

/** URL con la que el panel baja un documento con la sesión. */
export const urlDeDocumento = (documentoId: string): string => `/api/admin/documents/${documentoId}/raw`;

/** `AIMessage` → `MensajeApp`. Tolera `extra` ausente o con basura (mensajes viejos). */
export function mensajeAppDesdeFila(f: FilaMensaje): MensajeApp {
  const extra = esObjeto(f.extra) ? f.extra : {};
  const adjuntos = lista<{ documentoId?: unknown; nombre?: unknown }>(extra.adjuntos)
    ?.filter((a) => typeof a?.documentoId === "string")
    .map((a) => ({
      documentoId: String(a.documentoId),
      nombre: typeof a.nombre === "string" ? a.nombre : "foto",
      url: urlDeDocumento(String(a.documentoId)),
    }));
  const m: MensajeApp = {
    id: f.id,
    rol: f.role === "user" ? "user" : "assistant",
    texto: f.content,
    creadoEl: f.createdAt.toISOString(),
  };
  if (adjuntos?.length) m.adjuntos = adjuntos;
  const pendientes = lista<PendienteApp>(extra.pendientes);
  if (pendientes) m.pendientes = pendientes;
  const registradas = lista<{ resumen: string; pantalla?: string }>(extra.registradas);
  if (registradas) m.registradas = registradas;
  const papeles = lista<PapelDevuelto>(extra.papeles);
  if (papeles) m.papeles = papeles;
  if (esObjeto(extra.modelo)) m.modelo = extra.modelo as unknown as ModeloUsado;
  return m;
}

/** Título = primeras palabras del primer mensaje. */
export function tituloDesdeTexto(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "Conversación nueva";
  if (limpio.length <= 48) return limpio;
  const corte = limpio.slice(0, 48);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 20 ? corte.slice(0, espacio) : corte).trim()}…`;
}

const de = (tenantId: string, user: string, id?: string) => ({
  ...(id ? { id } : {}),
  tenantId,
  user,
  channel: CANAL_APP,
});

export class IaConversacionesDB {
  /** Las conversaciones de la persona, la más reciente primero. */
  static async listar(tenantId: string, user: string, limite = 60): Promise<ConversacionResumen[]> {
    const filas = await prisma.aIConversation.findMany({
      where: de(tenantId, user),
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
      },
    });
    return filas.map((f) => ({
      id: f.id,
      titulo: f.title || "Conversación nueva",
      actualizadoEl: f.updatedAt.toISOString(),
      ultimo: (f.messages[0]?.content ?? "").replace(/\s+/g, " ").slice(0, 80),
    }));
  }

  /** Una conversación con sus mensajes; `null` si no existe o es de otra persona/negocio. */
  static async obtener(
    tenantId: string,
    user: string,
    id: string,
  ): Promise<{ id: string; titulo: string; mensajes: MensajeApp[] } | null> {
    const c = await prisma.aIConversation.findFirst({
      where: de(tenantId, user, id),
      select: {
        id: true,
        title: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: MAX_MENSAJES,
          select: { id: true, role: true, content: true, extra: true, createdAt: true },
        },
      },
    });
    if (!c) return null;
    return { id: c.id, titulo: c.title || "Conversación nueva", mensajes: c.messages.map(mensajeAppDesdeFila) };
  }

  /** ¿La conversación es de esta persona en este negocio? */
  static async existe(tenantId: string, user: string, id: string): Promise<boolean> {
    return (await prisma.aIConversation.count({ where: de(tenantId, user, id) })) > 0;
  }

  static async crear(tenantId: string, user: string, titulo: string, id?: string): Promise<{ id: string }> {
    const c = await prisma.aIConversation.create({
      data: { ...(id ? { id } : {}), tenantId, user, channel: CANAL_APP, title: titulo.slice(0, 120) },
      select: { id: true },
    });
    return c;
  }

  /**
   * Agrega mensajes a una conversación PROPIA y la sube al tope de la lista.
   * `null` si la conversación no es de esta persona (no escribe nada).
   */
  static async agregarMensajes(
    tenantId: string,
    user: string,
    conversacionId: string,
    mensajes: MensajeNuevo[],
  ): Promise<MensajeApp[] | null> {
    if (!(await this.existe(tenantId, user, conversacionId))) return null;
    const base = Date.now();
    const filas = await prisma.$transaction(async (tx) => {
      const creadas = [];
      // createdAt escalonado 1 ms: el orden del par pregunta/respuesta no depende del reloj de la base.
      for (const [i, m] of mensajes.entries()) {
        creadas.push(
          await tx.aIMessage.create({
            data: {
              conversationId: conversacionId,
              role: m.role,
              content: m.content.slice(0, 10_000),
              createdAt: new Date(base + i),
              ...(m.extra ? { extra: m.extra as unknown as Prisma.InputJsonValue } : {}),
            },
            select: { id: true, role: true, content: true, extra: true, createdAt: true },
          }),
        );
      }
      await tx.aIConversation.updateMany({
        where: de(tenantId, user, conversacionId),
        data: { updatedAt: new Date() },
      });
      return creadas;
    });
    return filas.map(mensajeAppDesdeFila);
  }

  /** Saca una tarjeta «por confirmar» ya resuelta de los mensajes guardados (para que no reaparezca). */
  static async quitarPendiente(tenantId: string, user: string, conversacionId: string, aprobacionId: string): Promise<void> {
    if (!(await this.existe(tenantId, user, conversacionId))) return;
    const recientes = await prisma.aIMessage.findMany({
      where: { conversationId: conversacionId, role: "assistant" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, extra: true },
    });
    for (const f of recientes) {
      if (!esObjeto(f.extra)) continue;
      const pend = lista<PendienteApp>(f.extra.pendientes);
      if (!pend?.some((p) => p.id === aprobacionId)) continue;
      const resto = pend.filter((p) => p.id !== aprobacionId);
      const nuevo: Record<string, unknown> = { ...f.extra, pendientes: resto };
      if (resto.length === 0) delete nuevo.pendientes;
      // Una fila por id (no updateMany): el mensaje no tiene tenantId propio y
      // `f` salió de una conversación que `existe()` ya comprobó que es de este
      // negocio y este usuario.
      await prisma.aIMessage.update({
        where: { id: f.id },
        data: { extra: nuevo as Prisma.InputJsonValue },
      });
    }
  }

  /** `false` si no es suya (nada cambió). */
  static async renombrar(tenantId: string, user: string, id: string, titulo: string): Promise<boolean> {
    const r = await prisma.aIConversation.updateMany({
      where: de(tenantId, user, id),
      data: { title: titulo.slice(0, 120) },
    });
    return r.count > 0;
  }

  /** `false` si no es suya. Los mensajes caen por `onDelete: Cascade`. */
  static async borrar(tenantId: string, user: string, id: string): Promise<boolean> {
    const r = await prisma.aIConversation.deleteMany({ where: de(tenantId, user, id) });
    return r.count > 0;
  }
}
