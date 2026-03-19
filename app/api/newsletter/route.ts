import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);

    // Upsert — don't fail if already subscribed
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      update: { updatedAt: new Date() },
      create: { email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al suscribir" }, { status: 500 });
  }
}
