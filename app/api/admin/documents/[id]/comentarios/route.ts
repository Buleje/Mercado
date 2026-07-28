import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";

type Ctx = { params: Promise<{ id: string }> };

export interface Comentario {
  id: string;
  autor: string;
  texto: string;
  creadoEn: string;
  /** Quién lo dio por resuelto, si alguien lo hizo. */
  resueltoPor?: string | null;
  resueltoEn?: string | null;
}

const Nuevo = z.object({ texto: z.string().min(1).max(2000) });
const Resolver = z.object({ comentarioId: z.string().min(1).max(64), resuelto: z.boolean() });

function comentariosDe(doc: { ocrMetadata: Record<string, unknown> | null }): Comentario[] {
  const raw = (doc.ocrMetadata as { comentarios?: unknown } | null)?.comentarios;
  return Array.isArray(raw) ? (raw as Comentario[]) : [];
}

/** GET → los comentarios del documento, del más nuevo al más viejo. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:comentarios:list");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ comentarios: comentariosDe(doc) });
  } catch (e) {
    logger.error("[documents.comentarios.get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST → deja un comentario sobre el documento.
 *
 * Revisar un contrato entre dos personas terminaba en WhatsApp ("fijate la
 * cláusula 4"), lejos del archivo y sin quedar registrado. Acá la observación
 * vive junto al documento y la ve quien lo abra.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:comentarios:crear");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const parsed = Nuevo.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const comentario: Comentario = {
      id: randomBytes(8).toString("hex"),
      autor: auth.username,
      texto: parsed.data.texto.trim(),
      creadoEn: new Date().toISOString(),
      resueltoPor: null,
      resueltoEn: null,
    };
    const comentarios = [comentario, ...comentariosDe(doc)].slice(0, 200);

    await DocumentsDB.update(auth.tenantId, id, {
      ocrMetadata: { ...(doc.ocrMetadata ?? {}), comentarios },
    });

    return NextResponse.json({ comentario, comentarios });
  } catch (e) {
    logger.error("[documents.comentarios.post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE → borra un comentario. Sólo puede borrar el suyo quien lo escribió:
 * una observación ajena no se hace desaparecer, se marca resuelta.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:comentarios:borrar");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const comentarioId = req.nextUrl.searchParams.get("comentarioId") ?? "";
    const previos = comentariosDe(doc);
    const objetivo = previos.find((c) => c.id === comentarioId);
    if (!objetivo) return NextResponse.json({ error: "comentario_no_encontrado" }, { status: 404 });
    if (objetivo.autor !== auth.username) {
      return NextResponse.json({ error: "no_es_tuyo", mensaje: "Sólo quien escribió la observación puede borrarla." }, { status: 403 });
    }

    const comentarios = previos.filter((c) => c.id !== comentarioId);
    await DocumentsDB.update(auth.tenantId, id, {
      ocrMetadata: { ...(doc.ocrMetadata ?? {}), comentarios },
    });
    return NextResponse.json({ comentarios });
  } catch (e) {
    logger.error("[documents.comentarios.delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH → marca un comentario como resuelto (o lo reabre). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:comentarios:resolver");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const parsed = Resolver.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const ahora = new Date().toISOString();
    const comentarios = comentariosDe(doc).map((c) =>
      c.id === parsed.data.comentarioId
        ? {
            ...c,
            resueltoPor: parsed.data.resuelto ? auth.username : null,
            resueltoEn: parsed.data.resuelto ? ahora : null,
          }
        : c,
    );

    await DocumentsDB.update(auth.tenantId, id, {
      ocrMetadata: { ...(doc.ocrMetadata ?? {}), comentarios },
    });

    return NextResponse.json({ comentarios });
  } catch (e) {
    logger.error("[documents.comentarios.patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
