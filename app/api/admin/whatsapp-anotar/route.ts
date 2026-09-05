import "server-only";

/**
 * app/api/admin/whatsapp-anotar/route.ts
 *
 * La consola del bot que ANOTA por WhatsApp, desde el panel.
 *
 *   GET    → si el número del negocio está configurado, los teléfonos
 *            habilitados para anotar y el código de vinculación vivo (si hay)
 *   POST   → `{ accion: "codigo" }` emite un código de 15 minutos
 *   DELETE → `{ telefono }` corta el vínculo de un teléfono
 *
 * ── Por qué no vive en `/api/admin/whatsapp/*` ───────────────────────────────
 * Esas rutas son la bandeja de atención a CLIENTES (conversaciones, plantillas,
 * envíos). Esto es lo contrario: quién del lado del negocio puede escribir en
 * los libros. Mezclarlas haría que un permiso pensado para que un cajero
 * conteste clientes habilitara también a dar de alta quién anota plata.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { WhatsAppDuenosDB, normalizarTelefono } from "@/lib/db/whatsapp-duenos.db";
import { crearCodigo, codigoVivoDe } from "@/lib/asistente/vinculacion";

const AccionSchema = z.discriminatedUnion("accion", [z.object({ accion: z.literal("codigo") })]);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const [numero, duenos] = await Promise.all([
    WhatsAppDuenosDB.numeroDelNegocio(auth.tenantId),
    WhatsAppDuenosDB.listar(auth.tenantId),
  ]);

  return NextResponse.json({
    ...numero,
    duenos,
    codigo: codigoVivoDe(auth.tenantId, "whatsapp"),
    /**
     * La frase exacta que hay que mandar. Se devuelve armada para que nadie la
     * tipee de memoria: el patrón que la reconoce es angosto a propósito.
     */
    comoVincular: "vincular CÓDIGO",
  });
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "MODERATE", "whatsapp-anotar-admin");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = AccionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { activo } = await WhatsAppDuenosDB.numeroDelNegocio(auth.tenantId);
  if (!activo) {
    return NextResponse.json(
      {
        error:
          "Este negocio todavía no tiene número de WhatsApp conectado. Configuralo en Ajustes › WhatsApp antes de vincular un teléfono.",
      },
      { status: 400 },
    );
  }

  const { codigo, expiraEn } = crearCodigo(auth.tenantId, auth.username, "whatsapp");
  enqueueActivityLog({
    action: "Crear", resource: "whatsapp-anotar-codigo", resourceId: auth.tenantId,
    userId: auth.username, tenantId: auth.tenantId,
    details: { description: "Código de vinculación de WhatsApp emitido" },
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn("[whatsapp/dueño] activity log falló", { err: String(err) }));

  return NextResponse.json({ codigo, quedanSegundos: Math.round(expiraEn / 1000) });
}

export async function DELETE(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const telefono = normalizarTelefono(String((body as { telefono?: unknown } | null)?.telefono ?? ""));
  if (!telefono) {
    return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });
  }

  const duenos = await WhatsAppDuenosDB.desvincular(auth.tenantId, telefono);
  enqueueActivityLog({
    action: "Eliminar", resource: "whatsapp-anotar-dueno", resourceId: telefono,
    userId: auth.username, tenantId: auth.tenantId,
    details: { description: "Teléfono de WhatsApp desvinculado del bot que anota" },
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn("[whatsapp/dueño] activity log falló", { err: String(err) }));

  return NextResponse.json({ duenos });
}
