/**
 * scripts/apply-cacao-v4.mjs
 *
 * ADR-128 v4 — Trazabilidad, alertas, inventario y ventas avanzadas del módulo Cacao.
 *
 * Aplica (aditivo, idempotente):
 *   1. ALTER "CacaoVenta" ADD loteId, loteCode, montoCobrado, estadoPago(+default)
 *      + index (tenantId, loteId)
 *   2. CREATE TABLE "CacaoAjusteInventario"  (+ índices)
 *   3. CREATE TABLE "CacaoFermentacionRegistro"  (+ índice)
 *   4. CREATE TABLE "CacaoConfig"  (config de alertas por tenant)
 *
 * Modos:
 *   node -r dotenv/config scripts/apply-cacao-v4.mjs dotenv_config_path=.env.local            (dry-run)
 *   node -r dotenv/config scripts/apply-cacao-v4.mjs --execute dotenv_config_path=.env.local  (aplica)
 *
 * Conexión: pooler Supabase en modo session (puerto 5432), patrón del repo.
 * Rollback:
 *   ALTER TABLE "CacaoVenta" DROP COLUMN loteId, DROP COLUMN loteCode, DROP COLUMN montoCobrado, DROP COLUMN estadoPago;
 *   DROP TABLE "CacaoAjusteInventario", "CacaoFermentacionRegistro", "CacaoConfig";
 */
import pg from "pg";

const DRY_RUN = !process.argv.includes("--execute");

const STATEMENTS = [
  // ── 1. CacaoVenta: columnas nuevas ──
  `ALTER TABLE "CacaoVenta" ADD COLUMN IF NOT EXISTS "loteId" TEXT`,
  `ALTER TABLE "CacaoVenta" ADD COLUMN IF NOT EXISTS "loteCode" TEXT`,
  `ALTER TABLE "CacaoVenta" ADD COLUMN IF NOT EXISTS "montoCobrado" DECIMAL(14,2)`,
  `ALTER TABLE "CacaoVenta" ADD COLUMN IF NOT EXISTS "estadoPago" TEXT NOT NULL DEFAULT 'pendiente'`,
  `CREATE INDEX IF NOT EXISTS "CacaoVenta_tenantId_loteId_idx" ON "CacaoVenta" ("tenantId", "loteId")`,

  // ── 2. CacaoAjusteInventario ──
  `CREATE TABLE IF NOT EXISTS "CacaoAjusteInventario" (
     "id"            TEXT NOT NULL,
     "tenantId"      TEXT NOT NULL,
     "fecha"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "tipo"          TEXT NOT NULL,
     "cantidadKg"    DECIMAL(12,2) NOT NULL,
     "variedad"      TEXT,
     "grado"         TEXT,
     "motivo"        TEXT NOT NULL,
     "observaciones" TEXT,
     "status"        TEXT NOT NULL DEFAULT 'registrado',
     "createdBy"     TEXT NOT NULL,
     "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "deletedAt"     TIMESTAMP(3),
     CONSTRAINT "CacaoAjusteInventario_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "CacaoAjusteInventario_tenantId_fecha_idx" ON "CacaoAjusteInventario" ("tenantId", "fecha" DESC)`,
  `CREATE INDEX IF NOT EXISTS "CacaoAjusteInventario_deletedAt_idx" ON "CacaoAjusteInventario" ("deletedAt")`,

  // ── 3. CacaoFermentacionRegistro ──
  `CREATE TABLE IF NOT EXISTS "CacaoFermentacionRegistro" (
     "id"          TEXT NOT NULL,
     "tenantId"    TEXT NOT NULL,
     "beneficioId" TEXT NOT NULL,
     "dia"         INTEGER NOT NULL,
     "fecha"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "tempC"       DECIMAL(5,2),
     "volteo"      BOOLEAN NOT NULL DEFAULT false,
     "phMasa"      DECIMAL(4,2),
     "notas"       TEXT,
     "createdBy"   TEXT NOT NULL,
     "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "CacaoFermentacionRegistro_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "CacaoFermentacionRegistro_tenantId_beneficioId_idx" ON "CacaoFermentacionRegistro" ("tenantId", "beneficioId")`,

  // ── 4. CacaoConfig ──
  `CREATE TABLE IF NOT EXISTS "CacaoConfig" (
     "tenantId"          TEXT NOT NULL,
     "precioAlertaPenKg" DECIMAL(10,2),
     "stockMinimoKg"     DECIMAL(12,2),
     "fermDiasAlerta"    INTEGER NOT NULL DEFAULT 7,
     "humedadMaxPct"     DECIMAL(5,2) NOT NULL DEFAULT 7.5,
     "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy"         TEXT,
     CONSTRAINT "CacaoConfig_pkey" PRIMARY KEY ("tenantId")
   )`,
];

const CHECKS = [
  `SELECT count(*)::int c FROM information_schema.columns WHERE table_name='CacaoVenta' AND column_name IN ('loteId','loteCode','montoCobrado','estadoPago')`,
  `SELECT to_regclass('"public"."CacaoAjusteInventario"') IS NOT NULL AS e`,
  `SELECT to_regclass('"public"."CacaoFermentacionRegistro"') IS NOT NULL AS e`,
  `SELECT to_regclass('"public"."CacaoConfig"') IS NOT NULL AS e`,
];

async function main() {
  console.log(
    `🌱 ADR-128 v4 — Cacao trazabilidad/alertas/inventario/ventas\n   Modo: ${DRY_RUN ? "🟡 DRY-RUN" : "🔴 EXECUTE"}\n`,
  );
  if (DRY_RUN) {
    STATEMENTS.forEach((s, i) =>
      console.log(`   ${String(i + 1).padStart(2)}. ${s.split("\n")[0].trim()}…`),
    );
    console.log(
      "\n   Para aplicar: node -r dotenv/config scripts/apply-cacao-v4.mjs --execute dotenv_config_path=.env.local",
    );
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL ausente");
    process.exit(1);
  }
  const parsed = new URL(url);
  if (!parsed.hostname.includes("pooler.supabase.com")) {
    console.error(`❌ No es pooler Supabase: ${parsed.hostname}`);
    process.exit(1);
  }

  const client = new pg.Client({
    host: parsed.hostname,
    port: 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("🔌 Conectado\n");
  try {
    for (const sql of STATEMENTS) {
      const t0 = Date.now();
      await client.query(sql);
      console.log(`   ✅ ${sql.split("\n")[0].trim().slice(0, 70)}… (${Date.now() - t0}ms)`);
    }
    console.log("\n🔍 Validaciones:");
    const r1 = await client.query(CHECKS[0]);
    console.log(
      `   ${r1.rows[0].c === 4 ? "✅" : "❌"} CacaoVenta tiene las 4 columnas (${r1.rows[0].c}/4)`,
    );
    for (let i = 1; i < CHECKS.length; i++) {
      const r = await client.query(CHECKS[i]);
      const name = ["", "CacaoAjusteInventario", "CacaoFermentacionRegistro", "CacaoConfig"][i];
      console.log(`   ${r.rows[0].e ? "✅" : "❌"} Tabla ${name} existe`);
    }
    console.log("\n✅ Migración v4 aplicada. Ahora: npx prisma generate + reiniciar dev.");
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
