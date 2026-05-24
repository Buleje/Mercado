import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  sendOrderConfirmation,
  sendFiadoReminder,
  sendWelcomeTenant,
} from "@/lib/email/resend";
import { withApiHandler } from "@/lib/api-handler";

const Schema = z.object({
  type: z.enum(["order-confirmation", "fiado-reminder", "welcome"]),
  to: z.string().email(),
  data: z.record(z.string(), z.unknown()),
});

export const POST = withApiHandler("email-send", async (req: NextRequest) => {
  // SECURITY/CRITICAL 2026-05-06 (audit email #1): cerrar relay anónimo.
  // Antes cualquiera podía mandar emails desde nuestro dominio Resend → spam
  // masivo + reputación quemada. Requiere admin + rate limit estricto.
  const rl = applyRateLimit(req, "STRICT", "email-send");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { type, to, data } = parsed.data;

  switch (type) {
    case "order-confirmation":
      sendOrderConfirmation(to, {
        id: String(data.id ?? ""),
        total: Number(data.total ?? 0),
        items: Number(data.items ?? 0),
      });
      break;
    case "fiado-reminder":
      sendFiadoReminder(to, {
        customerName: String(data.customerName ?? ""),
        amount: Number(data.amount ?? 0),
        dueDate: String(data.dueDate ?? ""),
      });
      break;
    case "welcome":
      sendWelcomeTenant(to, {
        name: String(data.name ?? ""),
        slug: String(data.slug ?? ""),
      });
      break;
  }

  return NextResponse.json({ success: true });
});
