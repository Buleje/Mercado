import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { crearRonda, estadoDeRonda, turnoDe, type Ronda } from "@/lib/documents/firma-multi";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  firmantes: z.array(z.object({
    nombre: z.string().min(1).max(120),
    telefono: z.string().max(30).optional().nullable(),
    email: z.string().max(160).optional().nullable(),
    cargo: z.string().max(80).optional().nullable(),
  })).min(1).max(10),
  /** `true` = cada uno firma cuando le toca; `false` = en cualquier orden. */
  enOrden: z.boolean().default(true),
  /** Días de vigencia de cada enlace. */
  diasVigencia: z.number().int().min(1).max(90).default(30),
});

/** GET → la ronda tal como está, con a quién le toca ahora. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:firmantes:list");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const ronda = ((doc.ocrMetadata ?? {}) as { firmaRonda?: Ronda }).firmaRonda ?? null;
    return NextResponse.json({ ronda, estado: estadoDeRonda(ronda), turno: turnoDe(ronda) });
  } catch (e) {
    logger.error("[documents.firmantes.get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST → arma la ronda y le da a cada firmante SU enlace.
 *
 * Cada enlace es un share propio: así se puede revocar el de uno sin tocar el
 * de los demás, y el centro de enlaces los muestra como cualquier otro.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:firmantes:crear");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (doc.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "solo_pdf" }, { status: 415 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const anterior = ((doc.ocrMetadata ?? {}) as { firmaRonda?: Ronda }).firmaRonda ?? null;
    if (estadoDeRonda(anterior) === "en-curso") {
      // Rehacer la ronda a mitad de camino borraría firmas ya hechas.
      return NextResponse.json({ error: "ronda_en_curso" }, { status: 409 });
    }

    const ronda = crearRonda(parsed.data.firmantes, {
      enOrden: parsed.data.enOrden,
      creadaPor: auth.username,
    });

    // Un enlace por firmante. Si alguno falla, se sigue: el resto puede firmar
    // y al que le faltó se le vuelve a generar desde la ficha.
    for (const f of ronda.firmantes) {
      const share = await DocumentsDB.createShare(auth.tenantId, id, {
        createdById: `${auth.username} (firma: ${f.nombre})`,
        expiresInDays: parsed.data.diasVigencia,
      });
      f.token = share?.token ?? null;
    }

    await DocumentsDB.update(auth.tenantId, id, {
      ocrMetadata: { ...doc.ocrMetadata, firmaRonda: ronda },
    });

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "share",
      metadata: { firmaRonda: true, firmantes: ronda.firmantes.length, enOrden: ronda.enOrden },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ ronda, estado: estadoDeRonda(ronda), turno: turnoDe(ronda) });
  } catch (e) {
    logger.error("[documents.firmantes.post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
