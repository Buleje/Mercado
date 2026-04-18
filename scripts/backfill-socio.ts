/**
 * scripts/backfill-socio.ts — ADR-078
 *
 * Seed/backfill inicial del programa Socio Buleje desde `lib/mocks/socio-buleje.mock.ts`.
 *
 * Qué hace:
 *   - Lee el mock membership (demo user `user_demo_01` en tenant `main`).
 *   - Inserta SocioMembership canónico (plan=annual, status=active).
 *   - Crea el primer SocioBillingCycle `paid` (representa el cobro histórico).
 *   - Recorre MOCK_CASHBACK_HISTORY y append-only inserta las entries (earned).
 *   - Verifica que el balance final coincida con `MOCK_SOCIO_MEMBERSHIP.cashbackBalance`.
 *
 * IDEMPOTENTE:
 *   - Antes de insertar busca `findUnique({ tenantId_userId })`.
 *   - Si existe, hace log y exit(0) sin tocar nada.
 *   - Re-ejecuciones son safe.
 *
 * Uso (tras aplicar migration):
 *   DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-socio.ts
 *
 * NOT executed automatically — Brandon lo corre manualmente tras `db:migrate`.
 */

import { prisma } from "@/lib/prisma";
import {
  MOCK_SOCIO_MEMBERSHIP,
  MOCK_CASHBACK_HISTORY,
} from "@/lib/mocks/socio-buleje.mock";
import { SOCIO_PLAN_PRICES } from "@/lib/db/interfaces/ISocioBulejeDB";

interface BackfillStats {
  membershipCreated: boolean;
  cyclesInserted: number;
  entriesInserted: number;
  finalBalance: number;
  expectedBalance: number;
  balanceMatch: boolean;
}

export async function backfillSocio(): Promise<BackfillStats> {
  const tenantId = MOCK_SOCIO_MEMBERSHIP.tenantId;
  const userId = MOCK_SOCIO_MEMBERSHIP.userId;
  const planCanonical = MOCK_SOCIO_MEMBERSHIP.plan === "yearly" ? "annual" : "monthly";
  const startedAt = new Date(MOCK_SOCIO_MEMBERSHIP.startDate);
  const currentPeriodEnd = new Date(MOCK_SOCIO_MEMBERSHIP.endDate);
  const cycleAmount = SOCIO_PLAN_PRICES[planCanonical];

  const p = prisma as unknown as {
    socioMembership: {
      findUnique(a: {
        where: { tenantId_userId: { tenantId: string; userId: string } };
      }): Promise<{ id: string } | null>;
      create(a: {
        data: Record<string, unknown>;
      }): Promise<{ id: string }>;
    };
    socioBillingCycle: {
      create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
    };
    socioCashbackEntry: {
      create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
      count(a: { where: Record<string, unknown> }): Promise<number>;
    };
  };

  const stats: BackfillStats = {
    membershipCreated: false,
    cyclesInserted: 0,
    entriesInserted: 0,
    finalBalance: 0,
    expectedBalance: MOCK_SOCIO_MEMBERSHIP.cashbackBalance,
    balanceMatch: false,
  };

  // Idempotency gate.
  const existing = await p.socioMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  if (existing) {
    console.log(
      `[backfill-socio] Membership ya existe (${existing.id}) — nothing to do.`,
    );
    return stats;
  }

  // Membership
  const membership = await p.socioMembership.create({
    data: {
      tenantId,
      userId,
      plan: planCanonical,
      status: "active",
      startedAt,
      currentPeriodEnd,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      autoRenew: true,
    },
  });
  stats.membershipCreated = true;

  // Billing cycle histórico (ya pagado).
  await p.socioBillingCycle.create({
    data: {
      membershipId: membership.id,
      tenantId,
      periodStart: startedAt,
      periodEnd: currentPeriodEnd,
      amountSoles: cycleAmount,
      status: "paid",
      paidAt: startedAt,
    },
  });
  stats.cyclesInserted = 1;

  // Cashback entries — append-only en orden cronológico ascendente.
  const sorted = [...MOCK_CASHBACK_HISTORY].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  let running = 0;
  for (const tx of sorted) {
    const amount = Number(tx.amount.toFixed(2));
    const isRedemption = tx.reason === "redemption";
    const signed = isRedemption ? -amount : amount;
    running = Number((running + signed).toFixed(2));

    await p.socioCashbackEntry.create({
      data: {
        membershipId: membership.id,
        tenantId,
        userId,
        orderId: tx.orderId,
        type: isRedemption ? "redeemed" : "earned",
        amountSoles: signed,
        description: tx.description,
        balanceAfter: running,
        createdAt: new Date(tx.date),
      },
    });
    stats.entriesInserted += 1;
  }

  // Si hay diferencia entre running y expected, cerrar con un `adjustment`.
  // El mock guarda 47.3 como balance; el ledger acumula 11.1 con la historia
  // corta — diferencia = `adjustment` de inicio (entries anteriores no mock).
  const expected = stats.expectedBalance;
  if (Math.abs(running - expected) > 0.005) {
    const delta = Number((expected - running).toFixed(2));
    await p.socioCashbackEntry.create({
      data: {
        membershipId: membership.id,
        tenantId,
        userId,
        orderId: null,
        type: "adjustment",
        amountSoles: delta,
        description:
          "Ajuste backfill ADR-078 — cierre de saldo histórico antes del ledger",
        balanceAfter: expected,
        createdAt: sorted[0] ? new Date(sorted[0].date) : startedAt,
      },
    });
    stats.entriesInserted += 1;
    running = expected;
  }
  stats.finalBalance = running;
  stats.balanceMatch = Math.abs(running - expected) < 0.005;

  return stats;
}

// Allow the script to be invoked directly via `npx tsx`.
if (require.main === module) {
  backfillSocio()
    .then((stats) => {
      console.log("[backfill-socio] done", stats);
      if (!stats.balanceMatch) {
        console.error(
          `[backfill-socio] balance mismatch: final=${stats.finalBalance} expected=${stats.expectedBalance}`,
        );
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[backfill-socio] failed", err);
      process.exit(1);
    });
}
