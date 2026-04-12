/**
 * Script: cleanup-fake-tenants
 *
 * Problema (ADR-023):
 *   Antes del fix 2026-04-09, el endpoint público
 *   POST /api/marketplace/stores/apply creaba stores con tenantId sintético
 *   tipo `store-${phoneDigits}` que NO existía como row real en la tabla
 *   Tenant. Eso rompía el aislamiento multi-tenant y bloqueaba el login del
 *   dueño al admin panel.
 *
 * Qué hace este script:
 *   1. Busca todos los Store cuyo tenantId NO existe como row real en Tenant,
 *      o matchea el patrón fantasma `store-\d+`.
 *   2. Para cada uno, crea un Tenant REAL (cuid) con:
 *        - name   = store.name
 *        - slug   = store.slug (fallback: store.slug + sufijo numérico)
 *        - type   = "store"
 *        - plan   = "free"
 *        - active = false  (pendiente de aprobación por superadmin)
 *   3. Actualiza store.tenantId → tenant.id (cuid real).
 *   4. Migra referencias secundarias (Order.tenantId, StoreBanner.tenantId,
 *      CommissionLedger.tenantId, Review.tenantId) del tenantId viejo al nuevo.
 *   5. Log cada operación y retorna resumen.
 *
 * Modos:
 *   --dry-run (default): no escribe, solo muestra qué haría.
 *   --apply           : ejecuta los cambios en una $transaction por store.
 *
 * Uso:
 *   npx tsx scripts/cleanup-fake-tenants.ts            # dry run
 *   npx tsx scripts/cleanup-fake-tenants.ts --apply    # ejecuta
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const isApply  = process.argv.includes("--apply");
const isDryRun = !isApply;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set. Export it first or add to .env.local");
  }
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const resolvedUrl = !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;
  const adapter = new PrismaPg({
    connectionString: resolvedUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 2,
  });
  return new PrismaClient({ adapter });
}

type StoreRow = {
  id:       string;
  tenantId: string;
  slug:     string;
  name:     string;
};

const FAKE_TENANT_PATTERN = /^store-\d+$/;

function derivedTenantName(store: StoreRow): string {
  // Evitamos duplicar "Bodega" si el nombre ya empieza con eso.
  const lower = store.name.toLowerCase();
  if (lower.startsWith("bodega") || lower.startsWith("minimarket") || lower.startsWith("tienda")) {
    return store.name;
  }
  return `Bodega ${store.name}`;
}

async function uniqueSlug(
  prisma: PrismaClient,
  base: string,
  suffix: string,
): Promise<string> {
  const existing = await prisma.tenant.findUnique({
    where:  { slug: base },
    select: { id: true },
  });
  if (!existing) return base;
  return `${base}-${suffix}`;
}

async function main() {
  const prisma = createClient();
  console.log(
    isDryRun
      ? "🔍 DRY RUN — ningún cambio será escrito (usa --apply para ejecutar)\n"
      : "🔧 APPLY — ejecutando cambios sobre la BD\n",
  );

  let scanned      = 0;
  let fantasma     = 0;
  let huerfano     = 0;
  let fixed        = 0;
  let skipped      = 0;
  const skipReasons: string[] = [];

  try {
    // 1. Cargar todos los stores + todos los tenants (para lookup O(1))
    const [allStores, allTenants] = await Promise.all([
      prisma.store.findMany({
        select: { id: true, tenantId: true, slug: true, name: true },
      }),
      prisma.tenant.findMany({ select: { id: true } }),
    ]);

    scanned = allStores.length;
    const tenantIdSet = new Set(allTenants.map((t) => t.id));

    console.log(`📋 Stores escaneados: ${scanned}`);
    console.log(`📋 Tenants reales en BD: ${allTenants.length}\n`);

    // 2. Buscar candidatos: tenantId matchea patrón fantasma O no existe en Tenant
    const candidates: StoreRow[] = [];
    for (const store of allStores) {
      const isFantasma   = FAKE_TENANT_PATTERN.test(store.tenantId);
      const isOrphanedId = !tenantIdSet.has(store.tenantId);

      if (isFantasma)   fantasma++;
      if (isOrphanedId && !isFantasma) huerfano++;

      if (isFantasma || isOrphanedId) {
        candidates.push(store);
      }
    }

    console.log(`🎯 Candidatos a fix: ${candidates.length}`);
    console.log(`   - Pattern 'store-\\d+' (fantasma explícito): ${fantasma}`);
    console.log(`   - Tenant inexistente (huérfano): ${huerfano}\n`);

    if (candidates.length === 0) {
      console.log("✅ No hay stores con tenants fantasma. Todo limpio.");
      return;
    }

    // 3. Por cada candidato, planear (o ejecutar) el fix
    for (const store of candidates) {
      const oldTenantId = store.tenantId;
      const tenantName  = derivedTenantName(store);
      const suffix      = store.id.slice(-6);
      const tenantSlug  = await uniqueSlug(prisma, store.slug, suffix);

      console.log(`\n🏪 Store "${store.name}" (id=${store.id})`);
      console.log(`   tenantId viejo: ${oldTenantId}`);
      console.log(`   → Crear Tenant real { name: "${tenantName}", slug: "${tenantSlug}" }`);

      if (isDryRun) {
        console.log("   [dry-run] no se escribe nada");
        fixed++;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          // 3a. Crear el Tenant real
          const newTenant = await tx.tenant.create({
            data: {
              slug:   tenantSlug,
              name:   tenantName,
              type:   "store",
              plan:   "free",
              active: false, // pendiente de aprobación
            },
            select: { id: true },
          });

          console.log(`   ✅ Tenant creado id=${newTenant.id}`);

          // 3b. Actualizar el Store
          await tx.store.update({
            where: { id: store.id },
            data:  { tenantId: newTenant.id },
          });
          console.log(`   ✅ Store.tenantId actualizado`);

          // 3c. Migrar referencias secundarias que apuntaban al tenantId viejo.
          //     Usamos updateMany para que no falle si no existen rows.
          const tablesWithTenantId: Array<
            { model: "order" | "storeBanner" | "commissionLedger" | "review"; label: string }
          > = [
            { model: "order",            label: "Order" },
            { model: "storeBanner",      label: "StoreBanner" },
            { model: "commissionLedger", label: "CommissionLedger" },
            { model: "review",           label: "Review" },
          ];

          for (const { model, label } of tablesWithTenantId) {
            // @ts-expect-error — dynamic model access is fine in script
            const result = await tx[model].updateMany({
              where: { tenantId: oldTenantId },
              data:  { tenantId: newTenant.id },
            });
            if (result.count > 0) {
              console.log(`   ✅ ${label}: migradas ${result.count} rows`);
            }
          }
        });

        fixed++;
      } catch (err) {
        skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`   ❌ FALLÓ para store ${store.id}: ${msg}`);
        skipReasons.push(`${store.id}: ${msg}`);
      }
    }

    // 4. Resumen final
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 RESUMEN");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Stores escaneados:        ${scanned}`);
    console.log(`Fantasma (store-\\d+):     ${fantasma}`);
    console.log(`Huérfanos (tenant ∄):     ${huerfano}`);
    console.log(`${isDryRun ? "Planificados a fix" : "✅ Reparados       "}: ${fixed}`);
    console.log(`Saltados por error:       ${skipped}`);

    if (skipReasons.length > 0) {
      console.log("\n❌ Errores:");
      for (const r of skipReasons) console.log(`  - ${r}`);
    }

    if (isDryRun && fixed > 0) {
      console.log("\n💡 Para aplicar los cambios:");
      console.log("   npx tsx scripts/cleanup-fake-tenants.ts --apply");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
