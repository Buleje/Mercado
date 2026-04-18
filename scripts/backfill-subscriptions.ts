/**
 * scripts/backfill-subscriptions.ts — ADR-076
 *
 * Lee las suscripciones mock de `lib/mocks/subscriptions.mock.ts` y las inserta
 * en las tablas `subscriptions` + `subscription_deliveries` para poblar dev y
 * staging con datos realistas. NO correr en producción — los mocks son
 * fixtures de demo, no data real de clientes.
 *
 * IDEMPOTENTE — antes de insertar, hace findFirst por `id` y saltea las que
 * ya existen. Re-ejecuciones son seguras.
 *
 * Uso (desde la raíz del proyecto, con DATABASE_URL apuntando a la base dev o
 * staging; para producción aplicar la migration pero NO correr este script):
 *
 *   DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-subscriptions.ts
 *
 * Para cada suscripción activa crea adicionalmente hasta 3 SubscriptionDelivery
 * con `scheduledFor` futuro pero SIN `orderId` (las entregas reales se crean
 * cuando el cron delivery-scheduler procese la suscripción).
 */

import { prisma } from "@/lib/prisma";
import {
  MOCK_SUBSCRIPTIONS,
  type MockSubscriptionWithCustomer,
} from "@/lib/mocks/subscriptions.mock";
import type { SubscriptionFreq, SubscriptionStatus } from "@/lib/generated/prisma/client";

const DEFAULT_TENANT_ID = process.env.BACKFILL_TENANT_ID ?? "main";

const FREQUENCY_DAYS: Record<SubscriptionFreq, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

interface BackfillStats {
  scanned: number;
  insertedSubs: number;
  insertedDeliveries: number;
  skippedExisting: number;
}

function pickFrequency(raw: string): SubscriptionFreq {
  if (raw === "weekly" || raw === "biweekly" || raw === "monthly" || raw === "bimonthly") {
    return raw;
  }
  return "monthly";
}

function pickStatus(raw: string): SubscriptionStatus {
  if (raw === "active" || raw === "paused" || raw === "cancelled") {
    return raw;
  }
  return "active";
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

async function backfillOne(
  mock: MockSubscriptionWithCustomer,
  tenantId: string,
  stats: BackfillStats,
): Promise<void> {
  stats.scanned += 1;

  // Idempotency: skip si ya existe por id.
  const existing = await prisma.subscription.findUnique({
    where: { id: mock.id },
    select: { id: true },
  });
  if (existing) {
    stats.skippedExisting += 1;
    return;
  }

  // productId del mock es string numerico ("1001"..."1008"); si falla parse,
  // saltamos silenciosamente (no inventamos ids).
  const productId = Number(mock.productId);
  if (!Number.isFinite(productId) || productId <= 0) {
    return;
  }

  const frequency = pickFrequency(mock.frequency);
  const status = pickStatus(mock.status);
  const nextDeliveryAt = new Date(mock.nextDelivery);
  const createdAt = new Date(mock.createdAt);

  await prisma.subscription.create({
    data: {
      id: mock.id,
      tenantId,
      userId: mock.customerPhone, // Customer.phone = FK lógico
      productId,
      frequency,
      quantity: Math.max(1, mock.quantity),
      discount: mock.discount,
      status,
      nextDeliveryAt,
      createdAt,
      updatedAt: createdAt,
      ...(status === "paused" ? { pausedAt: new Date() } : {}),
      ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
    },
  });
  stats.insertedSubs += 1;

  // Si está activa, encolamos 3 entregas futuras (scheduledFor, sin orderId).
  if (status === "active") {
    const step = FREQUENCY_DAYS[frequency];
    const rows = [0, 1, 2].map((i) => ({
      subscriptionId: mock.id,
      tenantId,
      scheduledFor: addDays(nextDeliveryAt, i * step),
      skipped: false,
    }));
    const result = await prisma.subscriptionDelivery.createMany({
      data: rows,
    });
    stats.insertedDeliveries += result.count;
  }
}

export async function backfillSubscriptions(
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    scanned: 0,
    insertedSubs: 0,
    insertedDeliveries: 0,
    skippedExisting: 0,
  };

  for (const mock of MOCK_SUBSCRIPTIONS) {
    await backfillOne(mock, tenantId, stats);
  }

  return stats;
}

// Allow the script to be invoked directly via `npx tsx`.
if (require.main === module) {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    console.error(
      "[backfill-subscriptions] REFUSED: NODE_ENV=production. Los mocks son fixtures de demo, no datos reales.",
    );
    process.exit(1);
  }
  backfillSubscriptions()
    .then((stats) => {
      console.log("[backfill-subscriptions] done", stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[backfill-subscriptions] failed", err);
      process.exit(1);
    });
}
