import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import dns from "dns/promises";

/**
 * GET /api/tenant/custom-domain/verify
 *
 * Checks whether the tenant's configured custom domain has a CNAME
 * pointing at the platform's root domain.
 *
 * Returns:
 *  { verified: true,  target: "bodegasaas.com" }
 *  { verified: false, target: "other.host.com", expected: "bodegasaas.com" }
 *  { verified: false, error: "No CNAME record found" }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { customDomain: true },
  });

  if (!tenant?.customDomain) {
    return NextResponse.json(
      { verified: false, error: "No tienes un dominio personalizado configurado" },
      { status: 400 }
    );
  }

  const expected = (process.env.ROOT_DOMAIN ?? "").split(":")[0];
  if (!expected) {
    return NextResponse.json(
      { verified: false, error: "ROOT_DOMAIN no está configurado en el servidor" },
      { status: 503 }
    );
  }

  try {
    const cnames = await dns.resolveCname(tenant.customDomain);
    // Strip trailing dot from DNS answer if present
    const target = (cnames[0] ?? "").replace(/\.$/, "").toLowerCase();
    const expectedNorm = expected.toLowerCase();
    const verified = target === expectedNorm || target.endsWith(`.${expectedNorm}`);

    return NextResponse.json({ verified, target, expected: expectedNorm });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return NextResponse.json({
        verified: false,
        error: "No se encontró un registro CNAME para ese dominio",
        expected,
      });
    }
    console.error("[custom-domain verify]", err);
    return NextResponse.json({ verified: false, error: "Error al consultar DNS", expected }, { status: 500 });
  }
}
