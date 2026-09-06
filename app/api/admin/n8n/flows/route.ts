import "server-only";

/**
 * app/api/admin/n8n/flows/route.ts
 *
 * Los flujos de n8n del negocio, y la credencial que n8n usa para entrar.
 *
 *   GET    → flujos + token entrante + si la red local está habilitada
 *   POST   → alta de un flujo, o `{ accion: "rotar-token" }`, o `{ accion: "probar", id }`
 *   DELETE → baja de un flujo
 *
 * Vive en `Settings.featureFlagsJson`, igual que los webhooks del tenant: es
 * configuración del negocio, no schema.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";
import {
  getN8nConfig,
  saveN8nConfig,
  tokenEntrante,
  dispararFlujo,
  anotarDisparo,
  type N8nFlow,
} from "@/lib/n8n/flows";

const AltaSchema = z.object({
  accion: z.literal("crear").optional(),
  nombre: z.string().min(2, "Ponele un nombre").max(80),
  descripcion: z.string().min(5, "Contá para qué sirve — es lo único que lee el asistente para elegirlo").max(300),
  url: z.string().url("La URL del webhook no es válida").max(500),
  activo: z.boolean().default(true),
});

const AccionSchema = z.object({
  accion: z.enum(["rotar-token", "probar", "activar"]),
  id: z.string().max(64).optional(),
  activo: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { flujos, tokenVersion } = await getN8nConfig(auth.tenantId);
    let token: string | null = null;
    try {
      token = tokenEntrante(auth.tenantId, tokenVersion);
    } catch {
      // Sin AUTH_SECRET no hay token que emitir; la pantalla lo dice en vez de
      // mostrar una credencial vacía que "parece" válida.
      token = null;
    }
    return NextResponse.json({
      flujos,
      token,
      tokenVersion,
      urlEntrante: "/api/integrations/n8n/anotar",
      redLocalHabilitada: process.env.NODE_ENV !== "production" && process.env.N8N_ALLOW_LOCAL === "1",
    });
  } catch (err) {
    logger.error("[n8n] no se pudo leer la config", { err: String(err) });
    return NextResponse.json({ error: "No se pudo leer la configuración" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "MODERATE", "n8n-flows");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // ── Acciones sobre lo que ya existe ────────────────────────────────────
  const accion = AccionSchema.safeParse(body);
  if (accion.success) {
    const { flujos, tokenVersion } = await getN8nConfig(auth.tenantId);

    if (accion.data.accion === "rotar-token") {
      const nueva = tokenVersion + 1;
      await saveN8nConfig(auth.tenantId, { tokenVersion: nueva });
      enqueueActivityLog({
        action: "Rotar", resource: "n8n-token", resourceId: String(nueva),
        userId: auth.username, tenantId: auth.tenantId,
        details: { description: "Token de entrada de n8n rotado" },
        timestamp: new Date().toISOString(),
      }).catch((err) => logger.warn("[n8n] activity log falló", { err: String(err) }));
      return NextResponse.json({ token: tokenEntrante(auth.tenantId, nueva), tokenVersion: nueva });
    }

    const flujo = flujos.find((f) => f.id === accion.data.id);
    if (!flujo) return NextResponse.json({ error: "Ese flujo no existe" }, { status: 404 });

    if (accion.data.accion === "activar") {
      const actualizados = flujos.map((f) =>
        f.id === flujo.id ? { ...f, activo: accion.data.activo ?? !f.activo } : f,
      );
      await saveN8nConfig(auth.tenantId, { flujos: actualizados });
      return NextResponse.json({ flujos: actualizados });
    }

    // Probar: manda un ping real. Sin esto, "guardé la URL" y "la URL funciona"
    // son la misma pantalla, y la diferencia recién aparece cuando hace falta.
    const res = await dispararFlujo(auth.tenantId, flujo, {
      prueba: true,
      mensaje: "Ping de prueba desde Buleje",
    });
    await anotarDisparo(auth.tenantId, flujo.id, res).catch((err) =>
      logger.warn("[n8n] no se pudo anotar la prueba", { err: String(err) }),
    );
    return NextResponse.json({ resultado: res });
  }

  // ── Alta ───────────────────────────────────────────────────────────────
  const parsed = AltaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  const { flujos } = await getN8nConfig(auth.tenantId);
  if (flujos.length >= 20) {
    return NextResponse.json({ error: "Ya hay 20 flujos. Borrá alguno antes de agregar otro." }, { status: 400 });
  }
  const nuevo: N8nFlow = {
    id: crypto.randomUUID(),
    nombre: parsed.data.nombre.trim(),
    descripcion: parsed.data.descripcion.trim(),
    url: parsed.data.url.trim(),
    activo: parsed.data.activo,
    createdAt: new Date().toISOString(),
    ultimoDisparo: null,
  };
  await saveN8nConfig(auth.tenantId, { flujos: [...flujos, nuevo] });

  enqueueActivityLog({
    action: "Crear", resource: "n8n-flow", resourceId: nuevo.id,
    userId: auth.username, tenantId: auth.tenantId,
    details: { description: `Flujo n8n creado: ${nuevo.nombre}` },
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn("[n8n] activity log falló", { err: String(err) }));

  return NextResponse.json({ flujo: nuevo }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const id = typeof body === "object" && body !== null ? String((body as { id?: unknown }).id ?? "") : "";
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const { flujos } = await getN8nConfig(auth.tenantId);
  const quedan = flujos.filter((f) => f.id !== id);
  if (quedan.length === flujos.length) {
    return NextResponse.json({ error: "Ese flujo no existe" }, { status: 404 });
  }
  await saveN8nConfig(auth.tenantId, { flujos: quedan });

  enqueueActivityLog({
    action: "Eliminar", resource: "n8n-flow", resourceId: id,
    userId: auth.username, tenantId: auth.tenantId,
    details: { description: `Flujo n8n eliminado: ${id}` },
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn("[n8n] activity log falló", { err: String(err) }));

  return NextResponse.json({ ok: true });
}
