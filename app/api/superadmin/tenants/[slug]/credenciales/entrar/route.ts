import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { desbloqueoVigente } from "@/lib/superadmin/candado";
import { POST as suplantar } from "@/app/api/superadmin/impersonate/route";

/**
 * POST /api/superadmin/tenants/[slug]/credenciales/entrar
 *
 * «Entrar como esta tienda» desde la pestaña Credenciales: envoltorio de
 * `POST /api/superadmin/impersonate` (token de 10 min, su propio registro
 * `impersonate`, su rate limit STRICT y, desde 11-10, su propio chequeo del
 * candado). Acá el candado se exige SIEMPRE (la pestaña sólo existe abierta):
 *   401 sin sesión · 403 sin CSRF · 404 slug inválido · 423 sin desbloqueo vigente
 * `credenciales_entrar` va a la auditoría sólo si la suplantación respondió 200.
 */
const SlugSchema = z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/i);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const slugOk = SlugSchema.safeParse((await params).slug);
  if (!slugOk.success) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  const slug = slugOk.data;

  const desb = await desbloqueoVigente(req, auth.username);
  if (!desb) {
    return NextResponse.json(
      { error: "candado_cerrado", message: "Abre el candado para entrar como la tienda." },
      { status: 423, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Mismos encabezados (cookies de sesión, candado y CSRF, User-Agent, IP) con el
  // cuerpo que espera la suplantación. Sin content-length: el cuerpo es otro.
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  const pedido = new NextRequest(new URL("/api/superadmin/impersonate", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ slug }),
  });
  const res = await suplantar(pedido);
  if (res.status === 200) {
    await logSuperadminAction(
      "credenciales_entrar",
      `Entró como la tienda ${slug} desde Credenciales (candado abierto)`,
      { tenantSlug: slug },
      auth.username,
    );
  }
  return res;
}
