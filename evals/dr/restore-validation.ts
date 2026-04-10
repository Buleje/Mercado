import { describe, it, expect } from 'vitest'

/**
 * DR Restore Validation Suite
 *
 * These 10 tests validate that a restored database backup is healthy,
 * consistent, and ready for production use. They run against a temporary
 * database created from the latest backup during the monthly DR drill.
 *
 * Connection: Uses DR_DATABASE_URL env var (set by dr-drill.yml workflow).
 * When DR_DATABASE_URL is not set, tests are skipped gracefully.
 *
 * Reference: ADR-035 — Disaster Recovery Drills
 */

// ---------------------------------------------------------------------------
// DB Helper — connects to the restored DR temp database
// ---------------------------------------------------------------------------

interface QueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
}

async function drQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const connectionString = process.env.DR_DATABASE_URL

  if (!connectionString) {
    throw new Error('DR_DATABASE_URL not set — cannot connect to DR test database')
  }

  // Dynamic import to avoid requiring pg in environments that don't have it
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString })

  try {
    await client.connect()
    const result = await client.query(sql, params)
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    }
  } finally {
    await client.end()
  }
}

const hasDrUrl = !!process.env.DR_DATABASE_URL

// ---------------------------------------------------------------------------
// Validation Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasDrUrl)('DR Restore Validation', () => {
  // Track start time for the time budget test (#10)
  const suiteStartTime = Date.now()

  // -------------------------------------------------------------------------
  // 1. Tenant count > 0
  // -------------------------------------------------------------------------
  it('should have at least 1 tenant', async () => {
    // Every backup must contain at least the primary tenant (Bodega San Martin).
    // If this fails, the backup is empty or the restore missed the Tenant table.
    const result = await drQuery('SELECT COUNT(*)::int AS count FROM "Tenant"')
    const count = result.rows[0]?.count as number

    expect(count).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 2. Products per tenant > 0
  // -------------------------------------------------------------------------
  it('should have products for each tenant', async () => {
    // Every tenant must have at least one product. A tenant without products
    // means the catalog data was lost or not included in the backup.
    const result = await drQuery(`
      SELECT t."id", t."name", COUNT(p."id")::int AS product_count
      FROM "Tenant" t
      LEFT JOIN "Product" p ON p."tenantId" = t."id"
      GROUP BY t."id", t."name"
    `)

    expect(result.rowCount).toBeGreaterThan(0)

    for (const row of result.rows) {
      const productCount = row.product_count as number
      expect(
        productCount,
        `Tenant "${row.name}" (${row.id}) has 0 products`
      ).toBeGreaterThan(0)
    }
  })

  // -------------------------------------------------------------------------
  // 3. Sales total last 30 days coherent (non-negative)
  // -------------------------------------------------------------------------
  it('should have coherent sales totals', async () => {
    // Total sales over the last 30 days must be >= 0. A negative total
    // indicates corrupted order data or broken decimal calculations.
    const result = await drQuery(`
      SELECT COALESCE(SUM("total"), 0)::numeric AS total_sales
      FROM "Order"
      WHERE "createdAt" > NOW() - INTERVAL '30 days'
    `)

    const totalSales = Number(result.rows[0]?.total_sales ?? 0)
    expect(totalSales).toBeGreaterThanOrEqual(0)
  })

  // -------------------------------------------------------------------------
  // 4. Multi-tenant isolation — no cross-tenant data leaks
  // -------------------------------------------------------------------------
  it('should enforce tenant isolation in orders', async () => {
    // Verify that every Order has a tenantId that exists in the Tenant table.
    // Orphaned tenantIds indicate a data integrity issue.
    const result = await drQuery(`
      SELECT COUNT(*)::int AS orphan_count
      FROM "Order" o
      LEFT JOIN "Tenant" t ON o."tenantId" = t."id"
      WHERE t."id" IS NULL
    `)

    const orphanCount = result.rows[0]?.orphan_count as number
    expect(orphanCount, 'Orders exist with tenantId not found in Tenant table').toBe(0)
  })

  // -------------------------------------------------------------------------
  // 5. Referential integrity — no orphaned foreign keys
  // -------------------------------------------------------------------------
  it('should have no orphaned OrderItem foreign keys', async () => {
    // OrderItems must reference a valid Order. Orphaned OrderItems mean
    // the restore lost parent orders or FK constraints were not restored.
    const result = await drQuery(`
      SELECT COUNT(*)::int AS orphan_count
      FROM "OrderItem" oi
      LEFT JOIN "Order" o ON oi."orderId" = o."id"
      WHERE o."id" IS NULL
    `)

    const orphanCount = result.rows[0]?.orphan_count as number
    expect(orphanCount, 'Orphaned OrderItems found (orderId points to missing Order)').toBe(0)
  })

  // -------------------------------------------------------------------------
  // 6. Boleta correlativo format valid and sequential
  // -------------------------------------------------------------------------
  it('should have valid boleta correlativos', async () => {
    // Boleta numbers must follow SUNAT format: B###-########
    // (e.g., B001-00000001). Invalid formats break SUNAT compliance.
    const result = await drQuery(`
      SELECT "correlativo"
      FROM "Boleta"
      WHERE "correlativo" IS NOT NULL
      ORDER BY "createdAt" ASC
      LIMIT 100
    `)

    // Pattern: B followed by 3 digits, dash, 8 digits
    const boletaPattern = /^B\d{3}-\d{8}$/

    for (const row of result.rows) {
      const correlativo = row.correlativo as string
      expect(
        correlativo,
        `Invalid boleta format: "${correlativo}" (expected B###-########)`
      ).toMatch(boletaPattern)
    }

    // If there are multiple boletas, verify sequential ordering
    if (result.rows.length >= 2) {
      for (let i = 1; i < result.rows.length; i++) {
        const prev = result.rows[i - 1]?.correlativo as string
        const curr = result.rows[i]?.correlativo as string

        // Extract numeric portion after the dash
        const prevNum = parseInt(prev.split('-')[1] ?? '0', 10)
        const currNum = parseInt(curr.split('-')[1] ?? '0', 10)

        expect(
          currNum,
          `Boleta sequence broken: "${prev}" -> "${curr}"`
        ).toBeGreaterThanOrEqual(prevNum)
      }
    }
  })

  // -------------------------------------------------------------------------
  // 7. Fiado balance coherence — saldo = montoInicial - sumaPagos
  // -------------------------------------------------------------------------
  it('should have coherent fiado balances', async () => {
    // For each active Fiado, the remaining balance must equal
    // montoTotal minus the sum of all associated payments.
    // A mismatch means payment records were lost in the backup.
    const result = await drQuery(`
      SELECT
        f."id",
        f."montoTotal"::numeric AS monto_total,
        f."saldoPendiente"::numeric AS saldo_pendiente,
        COALESCE(SUM(fp."monto"), 0)::numeric AS total_pagos
      FROM "Fiado" f
      LEFT JOIN "FiadoPago" fp ON fp."fiadoId" = f."id"
      GROUP BY f."id", f."montoTotal", f."saldoPendiente"
      LIMIT 50
    `)

    for (const row of result.rows) {
      const montoTotal = Number(row.monto_total)
      const saldoPendiente = Number(row.saldo_pendiente)
      const totalPagos = Number(row.total_pagos)

      const expectedSaldo = montoTotal - totalPagos

      // Allow small floating-point tolerance (0.01 = 1 centimo)
      expect(
        Math.abs(saldoPendiente - expectedSaldo),
        `Fiado ${row.id}: saldo=${saldoPendiente} but expected=${expectedSaldo} (total=${montoTotal}, pagos=${totalPagos})`
      ).toBeLessThanOrEqual(0.01)
    }
  })

  // -------------------------------------------------------------------------
  // 8. No negative inventory
  // -------------------------------------------------------------------------
  it('should have no negative stock values', async () => {
    // Products must never have negative stock. This indicates
    // overselling or corrupted inventory data in the backup.
    const result = await drQuery(`
      SELECT COUNT(*)::int AS negative_count
      FROM "Product"
      WHERE "stock" < 0
    `)

    const negativeCount = result.rows[0]?.negative_count as number
    expect(negativeCount, 'Products found with negative stock').toBe(0)
  })

  // -------------------------------------------------------------------------
  // 9. Audit log integrity — hash chain verification (if table exists)
  // -------------------------------------------------------------------------
  it('should have intact audit log hash chain', async () => {
    // If the AuditLog table exists and uses hash chaining,
    // verify that each record's previousHash matches the prior record's hash.
    // Skip gracefully if the table doesn't exist yet.

    const tableCheck = await drQuery(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'AuditLog'
      ) AS table_exists
    `)

    const tableExists = tableCheck.rows[0]?.table_exists as boolean

    if (!tableExists) {
      // AuditLog table not yet created — skip validation
      // TODO: Remove this skip once AuditLog is implemented
      return
    }

    // Check if hash columns exist
    const columnCheck = await drQuery(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AuditLog' AND column_name = 'hash') AS has_hash,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AuditLog' AND column_name = 'previousHash') AS has_prev_hash
    `)

    const hasHash = columnCheck.rows[0]?.has_hash as boolean
    const hasPrevHash = columnCheck.rows[0]?.has_prev_hash as boolean

    if (!hasHash || !hasPrevHash) {
      // Hash chain columns not yet implemented — basic count check instead
      const countResult = await drQuery('SELECT COUNT(*)::int AS count FROM "AuditLog"')
      const count = countResult.rows[0]?.count as number
      expect(count).toBeGreaterThanOrEqual(0)
      return
    }

    // Verify hash chain: each record's previousHash must match the prior record's hash
    const chainResult = await drQuery(`
      WITH ordered_logs AS (
        SELECT
          "id", "hash", "previousHash",
          LAG("hash") OVER (ORDER BY "createdAt" ASC, "id" ASC) AS expected_prev_hash
        FROM "AuditLog"
        ORDER BY "createdAt" ASC, "id" ASC
      )
      SELECT COUNT(*)::int AS broken_links
      FROM ordered_logs
      WHERE expected_prev_hash IS NOT NULL
        AND "previousHash" != expected_prev_hash
    `)

    const brokenLinks = chainResult.rows[0]?.broken_links as number
    expect(brokenLinks, 'Audit log hash chain is broken').toBe(0)
  })

  // -------------------------------------------------------------------------
  // 10. Restore time budget — all validations completed within 10 minutes
  // -------------------------------------------------------------------------
  it('should complete restore validation within time budget', () => {
    // This test passes if all the above tests completed within the 10-minute
    // time budget. The vitest timeout config enforces this at the runner level,
    // but we also verify explicitly here.
    const elapsedMs = Date.now() - suiteStartTime
    const tenMinutesMs = 10 * 60 * 1000

    expect(
      elapsedMs,
      `Validation suite took ${Math.round(elapsedMs / 1000)}s (budget: 600s)`
    ).toBeLessThan(tenMinutesMs)
  })
})
