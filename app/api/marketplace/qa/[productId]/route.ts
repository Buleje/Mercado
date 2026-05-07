/**
 * GET  /api/marketplace/qa/[productId]      → lista preguntas + respuestas
 * POST /api/marketplace/qa/[productId]      → nueva pregunta (mock)
 *
 * Endpoint público del marketplace. Hoy mock; contrato listo para Prisma.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ProductQADB } from "@/lib/db/product-qa.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";


const QuestionBody = z.object({
  userName: z.string().min(1).max(80),
  question: z.string().min(10).max(500),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId: pidStr } = await params;
  const productId = parseInt(pidStr, 10);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  try {
    const questions = await ProductQADB.getQuestions("global", productId);
    return NextResponse.json(
      { data: questions, total: questions.length },
      {
        headers: {
          "Cache-Control": "public, max-age=120, s-maxage=180",
          "X-Total-Count": String(questions.length),
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/qa] list failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  // Rate limit: anti-spam preguntas (10 / 15min / IP)
  const rl = applyRateLimit(req, "MODERATE", "marketplace-qa-question");
  if (rl) return rl;

  const { productId: pidStr } = await params;
  const productId = parseInt(pidStr, 10);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = QuestionBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const question = await ProductQADB.createQuestion({
      tenantId: "global",
      productId,
      userId: `u_${randomUUID()}`,
      userName: parsed.data.userName,
      question: parsed.data.question,
    });
    return NextResponse.json({ data: question }, { status: 201 });
  } catch (err) {
    logger.error("[marketplace/qa] create failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
