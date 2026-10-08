import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { TenantsDB } from "@/lib/db/tenants.db";
import { TenantCustomDomainDB } from "@/lib/db/tenant-custom-domain.db";
import { ROOT_DOMAIN } from "@/lib/middleware/constants";
import { codigoCortoPublicable } from "@/lib/resolve-tenant";
import { baseQrCorta, baseVerificacion } from "@/lib/tenant-url-publica";

/**
 * GET /api/admin/tenant/url-publica → `{ base, fuente }`: la dirección pública
 * del negocio para los QR de verificación (etiquetas, guías, certificados).
 * Dominio propio > negocio principal > subdominio > `/t/<slug>`
 * (`lib/tenant-url-publica.ts`). El negocio sale del JWT, nunca del header.
 * Desde ADR-486 la base es la CORTA (`…/v` o `…/v/<código del negocio>`): los
 * armadores de cada QR la reconocen y usan una letra por documento.
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
  const larga = baseVerificacion({
    slug: tenant.slug,
    customDomain: dominio?.customDomain ?? null,
    rootDomain: ROOT_DOMAIN,
    baseUrl,
  });
  if (!/^https?:\/\//.test(larga.base)) {
    return NextResponse.json(
      { message: "Falta la dirección pública del sistema (NEXT_PUBLIC_BASE_URL): los QR no tendrían a dónde apuntar." },
      { status: 503 },
    );
  }
  // Por `/t/<slug>` el negocio necesita su código corto; si no le toca (choca
  // con uno más viejo), sus QR siguen con la base larga.
  const codigo = larga.fuente === "ruta" ? await codigoCortoPublicable(auth.tenantId) : null;
  const r = baseQrCorta(larga, { codigo, baseUrl });
  return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=300" } });
});
