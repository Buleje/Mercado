/**
 * lib/agents/domains/documentos.agent.ts
 *
 * El drive del negocio, desde el chat.
 *
 * La pregunta real no es "listame los documentos": es «¿dónde está la factura
 * del proveedor de marzo?». Por eso la única acción de búsqueda pasa el texto a
 * `DocumentsDB.list({ q })`, que ya busca en el nombre, el nombre original, las
 * etiquetas y el **texto OCR** del archivo — la misma búsqueda del módulo, sin
 * tildes.
 *
 * Solo lectura: subir, mover o borrar archivos se hace en el drive, donde se ve
 * qué se está tocando.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { DocumentsDB } from "@/lib/db/documents.db";

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Bytes a algo que se lee: "2.4 MB". */
function tamano(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function buscar(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const q = texto(task.payload.texto);
  if (!q) return { success: false, error: "Decime qué documento buscar (nombre, proveedor, número…)." };
  log.info("Buscando documentos", { q });

  const docs = await DocumentsDB.list(task.tenantId, { q });
  return {
    success: true,
    data: {
      total: docs.length,
      documentos: docs.slice(0, 12).map((d) => ({
        id: d.id,
        nombre: d.name,
        categoria: d.category,
        tamano: tamano(d.size),
        subido: d.uploadedAt ? String(d.uploadedAt).slice(0, 10) : null,
        // El vencimiento importa: un contrato o un seguro vencido es el motivo
        // más común para ir a buscar el papel.
        vence: d.expiresAt ? String(d.expiresAt).slice(0, 10) : null,
        etiquetas: d.tags ?? [],
      })),
      ...(docs.length === 0 && {
        mensaje: `Ningún documento coincide con "${q}". La búsqueda mira nombre, etiquetas y el texto reconocido dentro del archivo.`,
      }),
    },
  };
}

/**
 * Los papeles que se vencen. Es la consulta que nadie hace a tiempo: un
 * contrato, un seguro o un certificado vencido se descubre cuando hace falta.
 */
async function porVencer(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const dias = Number(task.payload.dias) > 0 ? Number(task.payload.dias) : 30;
  log.info("Documentos por vencer", { dias });

  const docs = await DocumentsDB.listExpiring(task.tenantId, dias);
  const hoy = Date.now();
  // `listExpiring` incluye los YA vencidos (todo lo que vence antes del corte).
  // Mezclarlos es perder la única distinción que importa: un contrato vencido
  // hace dos años no es "algo por renovar", es un problema abierto.
  const conEstado = docs.map((d) => {
    const iso = d.expiresAt ? String(d.expiresAt).slice(0, 10) : null;
    const restantes = iso ? Math.floor((new Date(`${iso}T23:59:59`).getTime() - hoy) / 86_400_000) : null;
    return {
      nombre: d.name,
      categoria: d.category,
      vence: iso,
      dias: restantes,
      estado: restantes == null ? "sin fecha" : restantes < 0 ? "VENCIDO" : "por vencer",
    };
  });
  const vencidos = conEstado.filter((d) => d.estado === "VENCIDO");
  const porVencer = conEstado.filter((d) => d.estado === "por vencer");

  return {
    success: true,
    data: {
      ventanaDias: dias,
      vencidos: { cantidad: vencidos.length, documentos: vencidos.slice(0, 10) },
      porVencer: { cantidad: porVencer.length, documentos: porVencer.slice(0, 10) },
    },
  };
}

export const documentosAgent: DomainAgent = {
  domain: "documentos",
  actions: ["buscar", "por-vencer"],
  description:
    "Drive del negocio: busca documentos por nombre, etiqueta o texto dentro del archivo, y lista los que están por vencer. Solo lectura.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    switch (task.action) {
      case "buscar":
        return buscar(task, ctx);
      case "por-vencer":
        return porVencer(task, ctx);
      default:
        return { success: false, error: `Acción desconocida de documentos: ${task.action}` };
    }
  },
};
