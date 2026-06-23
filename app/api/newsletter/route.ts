import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { NewsletterDB } from "@/lib/db/newsletter.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { CouponsDB } from "@/lib/db/coupons.db";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
});

// Cupón de bienvenida: las tiendas con el bloque de captura (flag "capture")
// PROMETEN "10% OFF en tu primera compra". Para que la promesa sea real (no
// dato falso), al suscribirse emitimos/recuperamos un cupón real redimible.
const WELCOME_CODE = "BIENVENIDA10";
const WELCOME_PERCENT = 10;

/** Lee una cookie del `Request` plano (no es NextRequest → sin `.cookies`). */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function POST(req: Request) {
  const limited = applyRateLimit(req, "STRICT", "newsletter");
  if (limited) return limited;

  return runWithAuditContext(
    req as Parameters<typeof runWithAuditContext>[0],
    "anonymous",
    async () => {
      try {
        const body = await req.json();
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
            { status: 400 }
          );
        }
        const { email } = parsed.data;

        // En `/api/*` plano el middleware envía `x-tenant-id: main` (no resuelve
        // la tienda individual). El contexto real está en el cookie
        // `active-tenant-slug` que el middleware setea al entrar a /t/<slug>.
        const xTenant = req.headers.get("x-tenant-id")?.trim();
        const rawTenant =
          (xTenant && xTenant !== "main" ? xTenant : "") ||
          readCookie(req, "active-tenant") ||
          readCookie(req, "active-tenant-slug") ||
          "main";

        const tenant = await findTenantByIdOrSlug(rawTenant).catch(() => null);
        const tenantId = tenant?.id ?? rawTenant;

        await NewsletterDB.subscribe(tenantId, email);

        // Cupón de bienvenida — solo si la tienda muestra el bloque de captura
        // (flag "capture"). Best-effort: nunca rompe la suscripción si falla.
        let coupon: { code: string; discountValue: number } | null = null;
        try {
          if (tenant) {
            const settings = await SettingsDB.get(tenant.id);
            const features = (settings?.storeTheme as { features?: unknown } | undefined)?.features;
            const hasCapture = Array.isArray(features) && features.includes("capture");
            if (hasCapture) {
              let c = await CouponsDB.findByCode(tenant.id, WELCOME_CODE);
              if (!c) {
                c = await CouponsDB.create(tenant.id, {
                  code: WELCOME_CODE,
                  description: "Cupón de bienvenida — 10% en tu primera compra",
                  discountType: "percent",
                  discountValue: WELCOME_PERCENT,
                });
              }
              coupon = { code: c.code, discountValue: Number(c.discountValue) };
            }
          }
        } catch (err) {
          logger.error("[newsletter] emisión de cupón de bienvenida falló", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        return NextResponse.json({ ok: true, coupon });
      } catch (_err) {
        return NextResponse.json({ error: "Error al suscribir" }, { status: 500 });
      }
    }
  );
}
