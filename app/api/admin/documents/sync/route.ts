import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import { carpetasEnConflicto, listarAgentes, olvidarAgente, saludAgente } from "@/lib/sync/estado-agentes";
import { logger } from "@/lib/logger";

/**
 * /api/admin/documents/sync — el panel de la sincronización de escritorio (ADR-307).
 *
 * GET     — equipos que están sincronizando, su salud y las claves activas.
 * POST    — crea la clave del agente (se muestra UNA vez).
 * DELETE  — `?keyId=` revoca una clave · `?equipoId=` olvida un equipo.
 *
 * Por qué existe: generar la clave era `node scripts/sync-crear-clave.mjs` en una
 * terminal, y saber si el agente estaba vivo no se podía. Un dueño de bodega no
 * abre una terminal.
 *
 * Las claves las crea/revoca ACÁ y no en `/api/api-keys` porque ese endpoint exige
 * plan Business; el sync de escritorio no es una integración de terceros, es el
 * mismo dueño trabajando en su carpeta.
 */

const Crear = z.object({
  nombre: z.string().trim().min(1).max(60).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "documents:sync:estado");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [agentes, claves] = await Promise.all([
      listarAgentes(auth.tenantId),
      listApiKeys(auth.tenantId),
    ]);
    const ahora = new Date();
    return NextResponse.json({
      equipos: agentes.map((a) => ({ ...a, salud: saludAgente(a, ahora) })),
      // Dos agentes sobre la misma carpeta se pisan: se avisa, no se bloquea
      // (puede ser una carpeta compartida en red y el dueño sabe lo que hace).
      carpetasDuplicadas: carpetasEnConflicto(agentes, ahora),
      // `listApiKeys` ya filtra por activas: todas las que llegan valen.
      claves: claves.map((k) => ({
        id: k.id,
        nombre: k.name,
        prefijo: k.keyPrefix,
        creada: k.createdAt,
        ultimoUso: k.lastUsedAt,
      })),
    });
  } catch (e) {
    logger.error("[documents/sync] GET error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "documents:sync:clave");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // Una clave del agente da acceso de escritura al drive entero: solo dueño/admin.
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = Crear.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const { rawKey, keyPrefix, id } = await createApiKey(
      auth.tenantId,
      parsed.data.nombre ?? "Sync de escritorio",
    );
    logger.info("[documents/sync] clave creada", { tenantId: auth.tenantId, id, actor: auth.username });
    // `clave` viaja UNA vez y no se guarda en claro: si se pierde, se crea otra.
    return NextResponse.json({ id, prefijo: keyPrefix, clave: rawKey }, { status: 201 });
  } catch (e) {
    logger.error("[documents/sync] POST error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:sync:revocar");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const keyId = url.searchParams.get("keyId");
  const equipoId = url.searchParams.get("equipoId");

  try {
    if (keyId) {
      const ok = await revokeApiKey(keyId, auth.tenantId);
      if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
      logger.info("[documents/sync] clave revocada", { tenantId: auth.tenantId, keyId, actor: auth.username });
      return NextResponse.json({ ok: true });
    }
    if (equipoId) {
      const ok = await olvidarAgente(auth.tenantId, equipoId);
      if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "missing_param" }, { status: 400 });
  } catch (e) {
    logger.error("[documents/sync] DELETE error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
