import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { NewsletterDB } from "@/lib/db/newsletter.db";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
});

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

        // Derive tenantId from middleware cookie (public endpoint — best-effort)
        const tenantId =
          (req as Request & { cookies?: { get?: (k: string) => { value?: string } | undefined } })
            .cookies?.get?.("active-tenant")?.value ?? "main";

        await NewsletterDB.subscribe(tenantId, email);

        return NextResponse.json({ ok: true });
      } catch (_err) {
        return NextResponse.json({ error: "Error al suscribir" }, { status: 500 });
      }
    }
  );
}
