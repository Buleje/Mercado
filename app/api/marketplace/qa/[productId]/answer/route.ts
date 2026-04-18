/**
 * POST /api/marketplace/qa/[productId]/answer
 *
 * Agrega una respuesta a una pregunta. Hoy mock; cuando integremos con
 * auth real, el isVendor se infiere del user.role en sesión.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductQADB } from "@/lib/db/product-qa.db";
import { logger } from "@/lib/logger";

const Body = z.object({
  questionId: z.string().min(1).max(100),
  userName: z.string().min(1).max(80),
  body: z.string().min(5).max(1000),
  isVendor: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const answer = await ProductQADB.createAnswer({
      tenantId: "global",
      questionId: parsed.data.questionId,
      userId: `u_${Date.now()}`,
      userName: parsed.data.userName,
      isVendor: parsed.data.isVendor ?? false,
      body: parsed.data.body,
    });
    return NextResponse.json({ data: answer }, { status: 201 });
  } catch (err) {
    logger.error("[marketplace/qa/answer] create failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
