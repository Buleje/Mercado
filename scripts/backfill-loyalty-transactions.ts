/**
 * scripts/backfill-loyalty-transactions.ts — TD-030 / ADR-024
 *
 * Seeds the LoyaltyTransaction ledger with one synthetic row per existing
 * customer that has loyaltyPoints > 0, so that the materialized balance and
 * the ledger agree at the moment the new write path goes live.
 *
 * **IDEMPOTENT** — before inserting, the script does
 *   findFirst({ customerId, reason: "backfill" })
 * and skips customers that already have a backfill row. Re-running is safe.
 *
 * Usage (run inside the same maintenance window that flips the
 * `loyalty.ledger.enabled` feature flag, per ADR-024 step 5):
 *
 *   DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-loyalty-transactions.ts
 *
 * NOT executed automatically — Brandon runs it manually after the migration
 * has been applied to the target environment.
 */

import { prisma } from "@/lib/prisma";

interface BackfillStats {
  scanned: number;
  inserted: number;
  skipped: number;
  zeroBalance: number;
}

export async function backfillLoyaltyTransactions(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    scanned: 0,
    inserted: 0,
    skipped: 0,
    zeroBalance: 0,
  };

  // Stream customers in pages so we don't load the whole table.
  const PAGE = 200;
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await prisma.customer.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { phone: cursor } } : {}),
      orderBy: { phone: "asc" },
      select: {
        phone: true,
        tenantId: true,
        loyaltyPoints: true,
        createdAt: true,
      },
    });

    if (batch.length === 0) break;

    for (const customer of batch) {
      stats.scanned += 1;

      if (customer.loyaltyPoints <= 0) {
        stats.zeroBalance += 1;
        continue;
      }

      // Idempotency gate — skip customers that already have a backfill row.
      const existing = await prisma.loyaltyTransaction.findFirst({
        where: {
          customerId: customer.phone,
          tenantId: customer.tenantId,
          reason: "backfill",
        },
        select: { id: true },
      });

      if (existing) {
        stats.skipped += 1;
        continue;
      }

      await prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.phone,
          tenantId: customer.tenantId,
          amount: customer.loyaltyPoints,
          reason: "backfill",
          metadata: {
            source: "ADR-024",
            backfilledAt: new Date().toISOString(),
          },
          // Use the customer's own creation date so the ledger looks plausible
          // historically — not now().
          createdAt: customer.createdAt,
        },
      });

      stats.inserted += 1;
    }

    cursor = batch[batch.length - 1]?.phone;
    if (batch.length < PAGE) break;
  }

  return stats;
}

// Allow the script to be invoked directly via `npx tsx`.
if (require.main === module) {
  backfillLoyaltyTransactions()
    .then((stats) => {
      console.log("[backfill-loyalty] done", stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[backfill-loyalty] failed", err);
      process.exit(1);
    });
}
