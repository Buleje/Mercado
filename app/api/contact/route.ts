import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const ContactSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(5).max(1000),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "contact"); if (_rl) return _rl;
  try {
    const body = await req.json();
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    // Store as a support ticket for the platform
    await prisma.supportTicket.create({
      data: {
        tenantId: "main",
        subject: `Contacto web: ${parsed.data.name}`,
        message: `Nombre: ${parsed.data.name}\nTelefono: ${parsed.data.phone}\nEmail: ${parsed.data.email || "No proporcionado"}\n\nMensaje:\n${parsed.data.message}`,
        status: "open",
        priority: "medium",
        createdBy: parsed.data.phone,
      },
    });

    return NextResponse.json({ success: true, message: "Mensaje recibido" });
  } catch {
    return NextResponse.json(
      { error: "Error al enviar el mensaje" },
      { status: 500 }
    );
  }
}
