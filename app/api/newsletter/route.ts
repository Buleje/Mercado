import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
});

export async function POST(req: Request) {
  const limited = applyRateLimit(req, "STRICT", "newsletter");
  if (limited) return limited;

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
    const tenantId = (req as Request & { cookies?: { get?: (k: string) => { value?: string } | undefined } }).cookies?.get?.("active-tenant")?.value ?? "main";
    // Upsert — don't fail if already subscribed
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      update: { updatedAt: new Date() },
      create: { email, tenantId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Error al suscribir" }, { status: 500 });
  }
}
