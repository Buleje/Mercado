/**
 * scripts/mark-roadmap-done.ts
 *
 * Marca items del Master Roadmap 2026-04-09 como `done` en la tabla
 * RoadmapItemStatus. Se ejecuta una sola vez tras un sprint multi-agent.
 *
 * Uso:
 *   npx tsx scripts/mark-roadmap-done.ts
 *
 * Idempotente: si el item ya está `done`, lo deja.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { prisma } from "../lib/prisma";

// Items que quedaron done tras el sprint multi-agent 2026-04-10 (teams A-E)
const DONE_ITEMS: Array<{ id: string; note: string }> = [
  { id: "fix-platform-settings-mrr",       note: "Verificado: schema PlatformSetting + lib/plans-server.ts + lib/db/platform-settings.db.ts ya shipped (Team A)." },
  { id: "fix-tenants-fantasma-apply",       note: "Verificado: MarketplaceStoresDB.register() crea Tenant real en $transaction (ADR-023, Team C)." },
  { id: "rate-limit-upstash-distributed",   note: "Verificado: @upstash/ratelimit + createDistributedRateLimiter en lib/rate-limit.ts (Team A)." },
  { id: "abandoned-cart-whatsapp-cliente",  note: "Done: /api/abandoned-cart ahora envia WA al cliente con rate-limit 48h + cooldown 22-07 (Team B)." },
  { id: "daily-briefing-whatsapp-dueno",    note: "Done: sendDailyDigestWhatsApp(tenantId) en lib/mailer-digest.ts + cron itera tenants activos (Team B)." },
  { id: "churn-engine-cron-playbook",       note: "Done: CHURN_AUTORUN feature flag + dry-run safe-by-default en /api/cron/churn-score (Team C)." },
  { id: "crm-rfm-campanas-segmento",        note: "Done: CRMClientesModule consume /api/customers/rfm (7 segmentos) + MassMessageSender acepta preselectedPhones (Team C)." },
  { id: "cupones-por-tienda-td032",         note: "Verificado: Coupon.storeId ya en schema + UI toggle en CouponsTab (Team E)." },
  { id: "catalogo-precargado-200-productos",note: "Verificado: data/catalog-peru.ts con 200 SKUs + /api/onboarding/import-catalog (Team E)." },
  { id: "fefo-enforcement-venta",           note: "Verificado: lib/inventory/fefo-deduct.ts + wiring en /api/sales (Team E)." },
];

async function ensureTable() {
  // Crea la tabla si no existe (idempotente). No afecta filas existentes.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RoadmapItemStatus" (
      "id"          TEXT PRIMARY KEY,
      "itemId"      TEXT NOT NULL UNIQUE,
      "status"      TEXT NOT NULL DEFAULT 'planned',
      "progress"    INTEGER NOT NULL DEFAULT 0,
      "startedAt"   TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "notes"       TEXT,
      "updatedBy"   TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RoadmapItemStatus_status_idx" ON "RoadmapItemStatus"("status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RoadmapItemStatus_updatedAt_idx" ON "RoadmapItemStatus"("updatedAt");
  `);
  console.log("[mark-roadmap-done] tabla RoadmapItemStatus verificada/creada");
}

async function main() {
  await ensureTable();
  console.log(`[mark-roadmap-done] marcando ${DONE_ITEMS.length} items como done...`);

  const now = new Date();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { id, note } of DONE_ITEMS) {
    try {
      const existing = await prisma.roadmapItemStatus.findUnique({ where: { itemId: id } });
      if (existing?.status === "done") {
        skipped++;
        console.log(`  ⏭️  ${id} already done`);
        continue;
      }

      const stamp = `[${now.toISOString()} · sprint-multi-agent-2026-04-10]`;
      const notesValue = existing?.notes
        ? `${existing.notes}\n${stamp} ${note}`
        : `${stamp} ${note}`;

      await prisma.roadmapItemStatus.upsert({
        where: { itemId: id },
        create: {
          itemId: id,
          status: "done",
          progress: 100,
          startedAt: existing?.startedAt ?? now,
          completedAt: now,
          notes: notesValue,
          updatedBy: "sprint-multi-agent-luis-2026-04-10",
        },
        update: {
          status: "done",
          progress: 100,
          completedAt: now,
          notes: notesValue,
          updatedBy: "sprint-multi-agent-luis-2026-04-10",
        },
      });

      if (existing) {
        updated++;
        console.log(`  🔄 ${id} updated → done`);
      } else {
        created++;
        console.log(`  ✅ ${id} created as done`);
      }
    } catch (err) {
      console.error(`  ❌ ${id} failed:`, (err as Error).message);
    }
  }

  console.log(`\n[mark-roadmap-done] resumen: ${created} creados, ${updated} actualizados, ${skipped} ya estaban done`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[mark-roadmap-done] fatal:", err);
  process.exit(1);
});
