import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { AsistenteMemoriaDB, TopeMemoriasError } from "@/lib/db/asistente-memoria.db";
import { TIPOS_MEMORIA } from "@/lib/ia-proveedores/tipos";

/**
 * /api/admin/ia/memoria — lo que el asistente recuerda del negocio (ADR-528),
 * para la pantalla «Memoria» de la app: ver, buscar y agregar a mano.
 * Escribir: solo dueño y admin (es lo que el asistente le dice a todos los
 * demás). `requireAdmin` deja pasar a `manager` siempre, así que POST/PATCH/
 * DELETE se cortan otra vez con `soloAdminODueno`; mirar (GET) queda para gerencia.
 */

const ROLES = ["admin", "owner"] as const;

const Alta = z.object({
  tipo: z.enum(TIPOS_MEMORIA),
  titulo: z.string().trim().min(1).max(120),
  texto: z.string().trim().min(1).max(1000),
});

/** GET ?q= → `{ items: MemoriaItem[] }`. Sin q = todas (las más usadas primero). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  try {
    const items = q ? await AsistenteMemoriaDB.buscar(auth.tenantId, q, 50) : await AsistenteMemoriaDB.listar(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    logger.error("[ia/memoria] listar falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "internal_error", message: "No se pudo leer la memoria ahora." }, { status: 500 });
  }
}

/** POST `{ tipo, titulo, texto }` → `{ item, actualizada }`. Mismo título = actualiza. */
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "ia:memoria:alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloAdminODueno(auth.role, "enseñarle datos del negocio al asistente");
  if (soloDueno) return soloDueno;

  const parsed = Alta.safeParse(await req.json().catch((err) => {
    logger.warn("[ia/memoria] cuerpo no es JSON", { error: String(err) });
    return null;
  }));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Falta el título o lo que hay que recordar." },
      { status: 400 },
    );
  }
  try {
    const r = await AsistenteMemoriaDB.recordar(auth.tenantId, {
      ...parsed.data,
      fuente: "app",
      creadoPor: auth.username,
    });
    logAudit({
      req,
      action: r.actualizada ? "UPDATE" : "CREATE",
      entity: "Agent",
      entityId: r.item.id,
      detail: `Memoria del asistente «${r.item.titulo}»`,
      user: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(r, { status: r.actualizada ? 200 : 201 });
  } catch (err) {
    if (err instanceof TopeMemoriasError) {
      return NextResponse.json({ error: "tope", message: err.message }, { status: 409 });
    }
    logger.error("[ia/memoria] alta falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "internal_error", message: "No se pudo guardar ahora." }, { status: 500 });
  }
}
