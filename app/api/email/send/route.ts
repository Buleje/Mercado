import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  sendOrderConfirmation,
  sendFiadoReminder,
  sendWelcomeTenant,
} from "@/lib/email/resend";

const Schema = z.object({
  type: z.enum(["order-confirmation", "fiado-reminder", "welcome"]),
  to: z.string().email(),
  data: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
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
}
