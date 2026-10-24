import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl } from "@/lib/documents/storage";
import {
  COOKIE_ENLACE, MAX_LARGO_CLAVE, claveCoincide, cookieEnlaceValida, cabeceraCookieEnlace, firmarCookieEnlace,
} from "@/lib/documentos/clave-enlace";

/**
 * Enlace público de UN documento (`/d/<token>`, `/firmar/<token>`).
 *
 * GET  — sin clave, el documento; con clave, sólo con la cookie de acceso que
 *        deja el POST al acertarla (la clave ya no viaja en la URL, 23-10).
 * POST — `{ password }` en el cuerpo: si acierta, el documento + la cookie
 *        (`lib/documentos/clave-enlace.ts`) con la que `/raw` y `/sign` lo abren.
 */
const Body = z.object({ password: z.string().max(MAX_LARGO_CLAVE) });
type Ctx = { params: Promise<{ token: string }> };
type Encontrado = NonNullable<Awaited<ReturnType<typeof DocumentsDB.findByShareToken>>>;

async function responderDocumento(found: Encontrado): Promise<NextResponse> {
  const signedUrl = await getSignedUrl(found.doc.storagePath, 60 * 60);
  if (!signedUrl) return NextResponse.json({ error: "storage_fail" }, { status: 502 });

  DocumentsDB.incrementShareAccess(found.share.id).catch((err) =>
    logger.error("[public.documents] contar acceso falló", { error: String(err) }),
  );

  const res = NextResponse.json({
    document: {
      id: found.doc.id,
      name: found.doc.name,
      mimeType: found.doc.mimeType,
      size: found.doc.size,
      uploadedAt: found.doc.uploadedAt,
    },
    signedUrl,
    share: {
      expiresAt: found.share.expiresAt,
      accessCount: found.share.accessCount + 1,
    },
  });
  if (found.share.hasPassword) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = applyRateLimit(req, "MODERATE", "documents:public");
    if (rl) return rl;

    const { token } = await ctx.params;
    const found = await DocumentsDB.findByShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    if (found.share.hasPassword) {
      const stored = await DocumentsDB.getShareRawPassword(token);
      if (!stored || !cookieEnlaceValida(req.cookies.get(COOKIE_ENLACE)?.value, "documento", token, stored)) {
        return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
      }
    }
    return await responderDocumento(found);
  } catch (e) {
    logger.error("[public.documents] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    // El mismo tope que el GET: abrir con clave cuesta 1 pedido.
    const rl = applyRateLimit(req, "MODERATE", "documents:public");
    if (rl) return rl;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const { token } = await ctx.params;
    const found = await DocumentsDB.findByShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    const stored = found.share.hasPassword ? await DocumentsDB.getShareRawPassword(token) : null;
    if (found.share.hasPassword && (!stored || !claveCoincide(stored, parsed.data.password))) {
      return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
    }

    const res = await responderDocumento(found);
    if (stored && res.ok) {
      const valor = firmarCookieEnlace("documento", token, stored);
      if (valor) res.headers.append("Set-Cookie", cabeceraCookieEnlace("documento", token, valor));
      else logger.error("[public.documents] sin AUTH_SECRET: la cookie de acceso no se pudo firmar");
    }
    return res;
  } catch (e) {
    logger.error("[public.documents] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
