#!/usr/bin/env ts-node
/**
 * scripts/backfill-gift-cards.ts — ADR-077
 *
 * Dev/staging tool: lee `lib/mocks/gift-cards.mock.ts` y crea las gift cards
 * correspondientes en Prisma. IMPORTANTE:
 *   - Los mocks incluyen un `code` plano; NO lo preservamos. Generamos
 *     codigos nuevos + hash HMAC y los imprimimos en stdout para testing
 *     manual (el operador los copia y los prueba en /validate o /redeem).
 *   - Requiere DATABASE_URL (via .env) y AUTH_SECRET.
 *   - Idempotente a nivel de "no duplica"; chequeamos si ya hay una gift
 *     card con el mismo senderUserId + recipientName + amount y skip.
 *
 * Uso:
 *   node -r dotenv/config --loader tsx scripts/backfill-gift-cards.ts
 *   # o
 *   npx tsx -r dotenv/config scripts/backfill-gift-cards.ts
 *
 * NUNCA correr en prod. Este script no tiene cofirmacion interactiva.
 */

import { prisma } from "@/lib/prisma";
import { MOCK_GIFT_CARDS } from "@/lib/mocks/gift-cards.mock";
import {
  generateCode,
  hashCode,
  codeLast4,
} from "@/lib/gift-cards/code-utils";

const DESIGN_MAP: Record<string, string> = {
  cumpleanos: "cumpleanos",
  navidad: "navidad",
  felicitaciones: "felicitaciones",
  aniversario: "aniversario",
  gracias: "gracias",
  "anio-nuevo": "anio_nuevo",
  bienvenida: "bienvenida",
  general: "general",
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("[backfill] ABORT: NODE_ENV=production no permitido");
    process.exit(1);
  }
  if (!process.env.AUTH_SECRET) {
    console.warn(
      "[backfill] WARN: AUTH_SECRET no esta seteado — usando fallback dev (docs/adr/077).",
    );
  }

  console.log(`[backfill] Procesando ${MOCK_GIFT_CARDS.length} mocks...`);

  const report: Array<{ id: string; plainCode: string; amount: number; recipientName: string }> = [];
  let skipped = 0;

  for (const mock of MOCK_GIFT_CARDS) {
    // Skip si ya existe una card equivalente (misma tenant + sender + recipient + amount)
    const existing = await prisma.giftCard.findFirst({
      where: {
        tenantId: mock.tenantId,
        senderUserId: mock.senderUserId,
        recipientName: mock.recipientName,
        amountSoles: mock.amount,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const plainCode = generateCode();
    const codeHash = hashCode(plainCode);
    const last4 = codeLast4(plainCode);
    const designEnum = DESIGN_MAP[mock.design] ?? "general";

    // Mapear status del mock al enum Prisma
    const status =
      mock.status === "canjeada"
        ? "fully_redeemed"
        : mock.status === "expirada"
          ? "expired"
          : mock.balance < mock.amount
            ? "partially_redeemed"
            : "active";

    const created = await prisma.giftCard.create({
      data: {
        tenantId: mock.tenantId,
        codeHash,
        codeLast4: last4,
        amountSoles: mock.amount,
        balanceSoles: mock.balance,
        currency: "PEN",
        design: designEnum as
          | "cumpleanos"
          | "navidad"
          | "felicitaciones"
          | "aniversario"
          | "gracias"
          | "anio_nuevo"
          | "bienvenida"
          | "general",
        status: status as
          | "pending_delivery"
          | "active"
          | "fully_redeemed"
          | "partially_redeemed"
          | "expired"
          | "cancelled",
        senderName: mock.senderName,
        senderUserId: mock.senderUserId,
        recipientName: mock.recipientName,
        recipientEmail: mock.contactMethod === "email" ? mock.recipientContact : null,
        recipientPhone: mock.contactMethod === "whatsapp" ? mock.recipientContact : null,
        recipientUserId: mock.redeemedByUserId,
        dedicatoria: mock.message,
        purchasedAt: new Date(mock.createdAt),
        firstRedeemedAt: mock.redeemedAt ? new Date(mock.redeemedAt) : null,
        fullyRedeemedAt:
          mock.status === "canjeada" && mock.redeemedAt
            ? new Date(mock.redeemedAt)
            : null,
      },
    });

    report.push({
      id: created.id,
      plainCode,
      amount: mock.amount,
      recipientName: mock.recipientName,
    });
  }

  console.log(`\n[backfill] ${report.length} gift cards creadas, ${skipped} skipped.\n`);

  if (report.length > 0) {
    console.log("══════════════════════════════════════════════════════════════");
    console.log("CODIGOS GENERADOS (solo se imprimen UNA VEZ — guardalos ya):");
    console.log("══════════════════════════════════════════════════════════════");
    for (const r of report) {
      console.log(
        `  ${r.plainCode}   S/ ${r.amount.toFixed(2)}   ${r.recipientName}   (id=${r.id})`,
      );
    }
    console.log("══════════════════════════════════════════════════════════════");
  }
}

main()
  .catch((e) => {
    console.error("[backfill] error fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
