/**
 * scripts/verify-ola1-migrations.ts
 *
 * Verificación unificada de TD-030 / TD-031 / TD-032 en producción.
 * Read-only (solo SELECT), seguro de correr cuando sea.
 *
 * Reporta, para cada TD, el estado de:
 *   TD-030 — LoyaltyTransaction:
 *     · ¿existe la tabla?
 *     · ¿FK Customer.phone presente?
 *     · 3/3 índices (idx_loyaltytxn_*)
 *     · rowcount backfilled (reason='legacy-backfill')
 *     · consistency: SUM(amount) == Customer.loyaltyPoints
 *
 *   TD-031 — Review.imageUrls:
 *     · ¿existe la columna? (data_type=ARRAY, udt=_text)
 *     · 0 filas con imageUrls NULL
 *     · default '{}' aplicado
 *
 *   TD-032 — Coupon.storeId:
 *     · ¿existe la columna?
 *     · FK "Coupon_storeId_fkey" presente
 *     · idx_coupon_storeid presente
 *     · nuevo unique aplicado (Path A NULLS NOT DISTINCT o Path B parciales)
 *     · viejo "Coupon_tenantId_code_key" removido
 *     · 0 cupones huérfanos (storeId → Store inexistente)
 *
 * Para cada TD reporta estado y sugiere el comando a correr si algo falta.
 *
 * Run: npx tsx scripts/verify-ola1-migrations.ts
 *
 * Referencias:
 *   - docs/migration-plan-ola1-2026-04-09.md (sección 11)
 *   - docs/adr/020-ola1-migration-plan.md
 *   - scripts/verify-pg-indexes-ola1.ts (patrón base)
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

type CheckResult = {
  td: "TD-030" | "TD-031" | "TD-032";
  name: string;
  ok: boolean;
  detail?: string;
};

async function main() {
  console.log("🔍 Verificación unificada — Ola 1 (TD-030 / TD-031 / TD-032)\n");
  console.log("   Plan: docs/migration-plan-ola1-2026-04-09.md");
  console.log("   ADR:  docs/adr/020-ola1-migration-plan.md\n");

  const directUrl = process.env.DIRECT_URL;
  const poolerUrl = process.env.DATABASE_URL;

  if (!directUrl && !poolerUrl) {
    console.log("❌ Ni DIRECT_URL ni DATABASE_URL en .env.local");
    process.exit(1);
  }

  let Client;
  try {
    Client = (await import("pg")).Client;
  } catch {
    console.log("❌ El paquete 'pg' no está instalado.");
    console.log("   Ejecutar: npm install pg @types/pg --save-dev");
    process.exit(1);
  }

  // Preferir DIRECT_URL, fallback pooler session mode (5432) — suficiente para read-only
  const candidates: Array<{ label: string; url: string }> = [];
  if (directUrl) candidates.push({ label: "DIRECT_URL", url: directUrl });
  if (poolerUrl) {
    const parsed = new URL(poolerUrl);
    const sessionUrl = `postgresql://${parsed.username}:${parsed.password}@${parsed.hostname}:5432${parsed.pathname}`;
    candidates.push({ label: "DATABASE_URL (pooler :5432 session)", url: sessionUrl });
  }

  let client: InstanceType<typeof Client> | null = null;
  let lastError = "";
  for (const candidate of candidates) {
    const masked = candidate.url.replace(/:[^@]+@/, ":***@");
    console.log(`🔌 Intentando ${candidate.label} → ${masked}`);
    const attempt = new Client({
      connectionString: candidate.url,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await attempt.connect();
      client = attempt;
      console.log(`   ✅ Conectado\n`);
      break;
    } catch (err) {
      lastError = (err as Error).message;
      console.log(`   ⚠️  ${lastError}`);
      try {
        await attempt.end();
      } catch {
        // ignore
      }
    }
  }

  if (!client) {
    console.log(`\n❌ No se pudo conectar. Último error: ${lastError}`);
    process.exit(1);
  }

  const results: CheckResult[] = [];

  try {
    // ────────────────────────────────────────────────────────
    // TD-030
    // ────────────────────────────────────────────────────────
    const td030TableExists = await client.query(
      `SELECT to_regclass('"public"."LoyaltyTransaction"') IS NOT NULL AS exists`,
    );
    const tableOk = !!td030TableExists.rows[0].exists;
    results.push({
      td: "TD-030",
      name: "Tabla LoyaltyTransaction existe",
      ok: tableOk,
    });

    if (tableOk) {
      const td030Fk = await client.query(
        `SELECT COUNT(*)::int AS c FROM pg_constraint
          WHERE conname = 'LoyaltyTransaction_customerPhone_fkey'
            AND contype = 'f'`,
      );
      results.push({
        td: "TD-030",
        name: "FK → Customer(phone) presente",
        ok: td030Fk.rows[0].c === 1,
      });

      const td030Idx = await client.query(
        `SELECT indexname FROM pg_indexes
          WHERE tablename = 'LoyaltyTransaction'
            AND indexname LIKE 'idx_loyaltytxn_%'
          ORDER BY indexname`,
      );
      const idxCount = td030Idx.rowCount ?? 0;
      results.push({
        td: "TD-030",
        name: `Índices idx_loyaltytxn_* (${idxCount}/3)`,
        ok: idxCount === 3,
        detail: td030Idx.rows.map((r) => r.indexname).join(", "),
      });

      const td030Backfill = await client.query(
        `SELECT COUNT(DISTINCT "customerPhone")::int AS c
           FROM "LoyaltyTransaction"
          WHERE reason = 'legacy-backfill'`,
      );
      const td030CustomersWithPoints = await client.query(
        `SELECT COUNT(*)::int AS c FROM "Customer" WHERE "loyaltyPoints" > 0`,
      );
      const backfilled = td030Backfill.rows[0].c;
      const expected = td030CustomersWithPoints.rows[0].c;
      results.push({
        td: "TD-030",
        name: `Backfill cubre clientes con puntos (${backfilled}/${expected})`,
        ok: backfilled === expected,
      });

      const td030Consistency = await client.query(
        `SELECT COUNT(*)::int AS mismatched
           FROM (
             SELECT c.phone
               FROM "Customer" c
               LEFT JOIN "LoyaltyTransaction" lt ON lt."customerPhone" = c.phone
              WHERE c."loyaltyPoints" > 0
              GROUP BY c.phone, c."loyaltyPoints"
             HAVING c."loyaltyPoints" != COALESCE(SUM(lt.amount), 0)
           ) AS sub`,
      );
      results.push({
        td: "TD-030",
        name: "Consistencia SUM(amount) == loyaltyPoints",
        ok: td030Consistency.rows[0].mismatched === 0,
        detail: `${td030Consistency.rows[0].mismatched} mismatches`,
      });
    }

    // ────────────────────────────────────────────────────────
    // TD-031
    // ────────────────────────────────────────────────────────
    const td031Col = await client.query(
      `SELECT data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Review' AND column_name='imageUrls'`,
    );
    const td031ColOk =
      td031Col.rowCount === 1 &&
      td031Col.rows[0].data_type === "ARRAY" &&
      td031Col.rows[0].udt_name === "_text" &&
      td031Col.rows[0].is_nullable === "NO";
    results.push({
      td: "TD-031",
      name: "Columna imageUrls TEXT[] NOT NULL",
      ok: td031ColOk,
      detail:
        td031Col.rowCount === 1
          ? `${td031Col.rows[0].data_type}/${td031Col.rows[0].udt_name}/${td031Col.rows[0].is_nullable} default=${td031Col.rows[0].column_default}`
          : "columna no existe",
    });

    if (td031ColOk) {
      const td031Nulls = await client.query(
        `SELECT COUNT(*)::int AS c FROM "Review" WHERE "imageUrls" IS NULL`,
      );
      results.push({
        td: "TD-031",
        name: "Sin filas con imageUrls NULL",
        ok: td031Nulls.rows[0].c === 0,
        detail: `${td031Nulls.rows[0].c} nulls`,
      });
    }

    // ────────────────────────────────────────────────────────
    // TD-032
    // ────────────────────────────────────────────────────────
    const td032Col = await client.query(
      `SELECT data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Coupon' AND column_name='storeId'`,
    );
    const td032ColOk =
      td032Col.rowCount === 1 &&
      td032Col.rows[0].data_type === "text" &&
      td032Col.rows[0].is_nullable === "YES";
    results.push({
      td: "TD-032",
      name: "Columna storeId TEXT nullable",
      ok: td032ColOk,
    });

    const td032Fk = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint
        WHERE conname = 'Coupon_storeId_fkey' AND contype = 'f'`,
    );
    results.push({
      td: "TD-032",
      name: "FK Coupon_storeId_fkey presente",
      ok: td032Fk.rows[0].c === 1,
    });

    const td032Idx = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes
        WHERE indexname = 'idx_coupon_storeid' AND schemaname='public'`,
    );
    results.push({
      td: "TD-032",
      name: "Índice idx_coupon_storeid presente",
      ok: td032Idx.rows[0].c === 1,
    });

    // Unique nuevo (Path A o Path B)
    const td032UniqueA = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint
        WHERE conname = 'Coupon_tenant_code_store_unique'`,
    );
    const td032UniqueBPos = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes
        WHERE indexname = 'Coupon_tenant_code_pos_unique'`,
    );
    const td032UniqueBMkt = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_indexes
        WHERE indexname = 'Coupon_tenant_code_marketplace_unique'`,
    );
    const pathA = td032UniqueA.rows[0].c === 1;
    const pathB =
      td032UniqueBPos.rows[0].c === 1 && td032UniqueBMkt.rows[0].c === 1;
    results.push({
      td: "TD-032",
      name: "Nuevo unique aplicado (Path A o B)",
      ok: pathA || pathB,
      detail: pathA ? "Path A (NULLS NOT DISTINCT)" : pathB ? "Path B (parciales)" : "ninguno",
    });

    const td032OldUnique = await client.query(
      `SELECT COUNT(*)::int AS c FROM pg_constraint
        WHERE conname = 'Coupon_tenantId_code_key'`,
    );
    results.push({
      td: "TD-032",
      name: "Viejo Coupon_tenantId_code_key removido",
      ok: td032OldUnique.rows[0].c === 0,
    });

    if (td032ColOk) {
      const td032Orphans = await client.query(
        `SELECT COUNT(*)::int AS c
           FROM "Coupon" c
           LEFT JOIN "Store" s ON s."id" = c."storeId"
          WHERE c."storeId" IS NOT NULL AND s."id" IS NULL`,
      );
      results.push({
        td: "TD-032",
        name: "0 cupones huérfanos",
        ok: td032Orphans.rows[0].c === 0,
        detail: `${td032Orphans.rows[0].c} huérfanos`,
      });
    }

    // ────────────────────────────────────────────────────────
    // Reporte final
    // ────────────────────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const grouped = new Map<string, CheckResult[]>();
    for (const r of results) {
      const arr = grouped.get(r.td) ?? [];
      arr.push(r);
      grouped.set(r.td, arr);
    }

    for (const [td, checks] of grouped) {
      const allOk = checks.every((c) => c.ok);
      const anyOk = checks.some((c) => c.ok);
      const icon = allOk ? "✅" : anyOk ? "🟡" : "❌";
      console.log(`\n${icon} ${td}`);
      for (const c of checks) {
        const mark = c.ok ? "✓" : "✗";
        const detail = c.detail ? `  [${c.detail}]` : "";
        console.log(`   ${mark} ${c.name}${detail}`);
      }
      if (!allOk) {
        const cmd = {
          "TD-030": "npx tsx scripts/apply-td030-loyalty-transaction.ts --execute",
          "TD-031": "npx tsx scripts/apply-td031-review-imageurls.ts --execute",
          "TD-032": "npx tsx scripts/apply-td032-coupon-storeid.ts --execute",
        }[td as "TD-030" | "TD-031" | "TD-032"];
        console.log(`   ▶ Reparar con: ${cmd}`);
      }
    }

    const totalOk = results.filter((r) => r.ok).length;
    const total = results.length;
    console.log(
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalOk}/${total} checks OK\n`,
    );

    if (totalOk !== total) {
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
