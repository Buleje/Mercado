import "server-only";

/**
 * app/api/integrations/n8n/anotar/route.ts
 *
 * La puerta de entrada desde n8n: un texto entra, un asiento sale.
 *
 * Es lo que permite dictarle a Buleje desde afuera del panel — un audio de
 * WhatsApp que n8n transcribe, un mensaje de Telegram, un correo. n8n manda el
 * texto, recibe el resumen de lo que se va a anotar, se lo hace confirmar a la
 * persona, y confirma.
 *
 * ── Cómo se llama ────────────────────────────────────────────────────────────
 *   POST /api/integrations/n8n/anotar
 *   Authorization: Bearer bul_n8n_1_xxxxxxxx      (Automatizaciones → token)
 *   X-Buleje-Tenant: main                          (el slug del negocio)
 *
 *   { "texto": "compré 25 galones de petróleo para el camión N12 a 27 el galón" }
 *     → { estado: "pendiente", aprobacionId, resumen }   ← preguntar y confirmar
 *
 *   { "aprobacionId": "…", "decision": "aprobar" }
 *     → { estado: "registrado", resumen }
 *
 *   { "texto": "…", "confirmar": true }
 *     → escribe de una (para flujos que YA preguntaron del otro lado)
 *
 * ⚠️ La confirmación en dos pasos vive en memoria del servidor y expira a los
 * 10 minutos (`lib/agents/pending-approvals`). Un flujo que le pregunta a la
 * persona por WhatsApp entra cómodo; uno que espera una respuesta de mañana,
 * no — ese tiene que mandar `confirmar: true` con su propia confirmación.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { TenantsDB } from "@/lib/db/tenants.db";
import { getN8nConfig, tokenValido } from "@/lib/n8n/flows";
import { conversar } from "@/lib/asistente/conversar";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { getPendingApproval, removePendingApproval } from "@/lib/agents/pending-approvals";

const BodySchema = z.union([
  z.object({
    texto: z.string().min(1).max(2000),
    confirmar: z.boolean().optional(),
    canal: z.string().max(40).optional(),
    de: z.string().max(120).optional(),
  }),
  z.object({
    aprobacionId: z.string().min(1).max(64),
    decision: z.enum(["aprobar", "rechazar"]),
  }),
]);

/**
 * El rol con el que corre lo que entra por acá.
 *
 * La credencial la emite y la pega el dueño en su n8n, y sólo él puede verla
 * (`settings:write`). Por eso las operaciones corren como `admin`: quien tiene
 * el token ya tiene, en los hechos, el panel entero.
 */
const ROL = "admin" as const;

export async function POST(req: NextRequest) {
  // Estricto: es una puerta pública con credencial, no una pantalla del panel.
  const rl = await applyRateLimit(req, "STRICT", "n8n-anotar");
  if (rl) return rl;

  // ── Credencial ───────────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const slug = (req.headers.get("x-buleje-tenant") ?? "").trim();

  if (!token || !slug) {
    return NextResponse.json(
      { error: "Falta la credencial. Mandá 'Authorization: Bearer <token>' y 'X-Buleje-Tenant: <slug>'." },
      { status: 401 },
    );
  }

  const tenantId = await resolveTenantSlugToId(slug);
  const tenant = await TenantsDB.getBasicById(tenantId);
  if (!tenant) {
    // Mismo mensaje que un token malo: decir "ese negocio no existe" convierte
    // este endpoint en un enumerador de tenants.
    return NextResponse.json({ error: "Credencial inválida" }, { status: 401 });
  }

  const { tokenVersion } = await getN8nConfig(tenantId);
  if (!tokenValido(tenantId, tokenVersion, token)) {
    logger.warn("[n8n/anotar] credencial rechazada", { slug });
    return NextResponse.json({ error: "Credencial inválida" }, { status: 401 });
  }

  // ── Cuerpo ───────────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        detalle: "Mandá { texto } para anotar, o { aprobacionId, decision } para confirmar.",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  // ── Confirmar / rechazar algo que quedó pendiente ────────────────────────
  if ("aprobacionId" in parsed.data) {
    const pendiente = getPendingApproval(parsed.data.aprobacionId);
    // El tenant se compara SIEMPRE: sin esto, el token de un negocio podría
    // confirmar la operación pendiente de otro.
    if (!pendiente || pendiente.tenantId !== tenantId) {
      return NextResponse.json(
        { estado: "expirada", mensaje: "Esa operación ya no está pendiente (se confirmó, se rechazó o pasaron los 10 minutos)." },
        { status: 404 },
      );
    }
    if (parsed.data.decision === "rechazar") {
      removePendingApproval(parsed.data.aprobacionId);
      return NextResponse.json({ estado: "rechazada", mensaje: "Listo, no se anotó nada." });
    }

    await ensureAgentsRegistered();
    const res = await orchestrator.executeSync({
      domain: pendiente.domain as Parameters<typeof orchestrator.executeSync>[0]["domain"],
      action: pendiente.action,
      payload: pendiente.payload,
      tenantId,
      actorRole: ROL,
    });
    removePendingApproval(parsed.data.aprobacionId);
    if (!res.success) {
      return NextResponse.json({ estado: "error", mensaje: res.error ?? "No se pudo registrar." }, { status: 422 });
    }
    const datos = (res.data ?? {}) as Record<string, unknown>;
    logger.info("[n8n/anotar] operación confirmada desde n8n", { tenantId, tool: pendiente.toolName });
    return NextResponse.json({
      estado: "registrado",
      resumen: String(datos.confirmacion ?? "Operación registrada."),
      detalle: datos,
    });
  }

  // ── Anotar ───────────────────────────────────────────────────────────────
  const r = await conversar({
    tenantId,
    /**
     * La sesión es quien manda, no el negocio: dos personas escribiendo por el
     * mismo flujo de n8n no pueden pisarse la conversación. Sin `de`, cada
     * llamada es independiente — que es lo correcto para un flujo automático.
     */
    sesionId: `n8n:${parsed.data.de ?? crypto.randomUUID()}`,
    texto: parsed.data.texto,
    actorRole: ROL,
    solicitante: parsed.data.de ? `n8n:${parsed.data.de}` : "n8n",
    confirmarAutomatico: parsed.data.confirmar === true,
    canal: parsed.data.canal,
  });

  /**
   * El contrato de este endpoint no cambia: n8n ya tiene flujos armados contra
   * `{estado, aprobacionId, resumen}` y romperlos sería romper automatizaciones
   * que ya andan. Lo nuevo —varias operaciones en un mensaje— se expone en
   * `pendientes`, que los flujos viejos simplemente ignoran.
   */
  const primera = r.pendientes[0];
  const registrada = r.registradas[0];
  const cuerpo = primera
    ? {
        estado: "pendiente" as const,
        aprobacionId: primera.id,
        resumen: primera.resumen,
        tool: primera.tool,
        ...(r.pendientes.length > 1 && { pendientes: r.pendientes }),
      }
    : registrada
      ? {
          estado: "registrado" as const,
          resumen: registrada.resumen,
          ...(r.registradas.length > 1 && { registradas: r.registradas }),
        }
      : { estado: "pregunta" as const, mensaje: r.texto ?? "No entendí qué operación anotar." };

  // El estado va también en el cuerpo para que un flujo de n8n pueda ramificar
  // sin mirar el código HTTP (el nodo IF de n8n lee el JSON, no el status).
  return NextResponse.json(cuerpo, { status: 200 });
}

/** Para que n8n pueda probar la credencial sin anotar nada. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const slug = (req.headers.get("x-buleje-tenant") ?? "").trim();
  if (!token || !slug) return NextResponse.json({ ok: false, error: "Falta la credencial" }, { status: 401 });

  const tenantId = await resolveTenantSlugToId(slug);
  const tenant = await TenantsDB.getBasicById(tenantId);
  if (!tenant) return NextResponse.json({ ok: false, error: "Credencial inválida" }, { status: 401 });
  const { tokenVersion } = await getN8nConfig(tenantId);
  if (!tokenValido(tenantId, tokenVersion, token)) {
    return NextResponse.json({ ok: false, error: "Credencial inválida" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, negocio: tenant.name });
}
