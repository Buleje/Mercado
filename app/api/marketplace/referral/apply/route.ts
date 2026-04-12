import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { CustomersDB } from "@/lib/db/customers.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const ApplySchema = z.object({
  phone: z.string().min(6).max(20),
  code: z.string().min(3).max(10),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "referral-apply");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Datos inválidos" },
        { status: 400 },
      );
    }

    const result = await CustomersDB.applyReferralCode(
      parsed.data.phone,
      parsed.data.code.toUpperCase(),
    );

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
