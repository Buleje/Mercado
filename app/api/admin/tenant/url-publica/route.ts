import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { TenantsDB } from "@/lib/db/tenants.db";
import { TenantCustomDomainDB } from "@/lib/db/tenant-custom-domain.db";
import { ROOT_DOMAIN } from "@/lib/middleware/constants";
import { baseVerificacion } from "@/lib/tenant-url-publica";

/**
 * GET /api/admin/tenant/url-publica → `{ base, fuente }`: la dirección pública
 * del negocio para los QR de verificación (etiquetas, guías, certificados).
 * Dominio propio > negocio principal > subdominio > `/t/<slug>`
 * (`lib/tenant-url-publica.ts`). El negocio sale del JWT, nunca del header.
 * Sin query → sin Zod de entrada; la salida la valida el cliente con
 * `RespuestaUrlPublicaSchema`.
 */
export const GET = withApiHandler("tenant-url-publica-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "tenant-url-publica");
  if (rl) return rl;

  const [tenant, dominio] = await Promise.all([
    TenantsDB.getBasicById(auth.tenantId),
    TenantCustomDomainDB.findCurrentDomain(auth.tenantId),
  ]);
  if (!tenant) return NextResponse.json({ message: "No encontramos tu negocio." }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "";
  const r = baseVerificacion({
    slug: tenant.slug,
    customDomain: dominio?.customDomain ?? null,
    rootDomain: ROOT_DOMAIN,
    baseUrl,
  });
  if (!/^https?:\/\//.test(r.base)) {
    return NextResponse.json(
      { message: "Falta la dirección pública del sistema (NEXT_PUBLIC_BASE_URL): los QR no tendrían a dónde apuntar." },
      { status: 503 },
    );
  }
  return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=300" } });
});
