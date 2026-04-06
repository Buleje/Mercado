/**
 * lib/query-monitor.ts
 *
 * N+1 Query Detection — like a security camera for database queries.
 * 
 * Detects when the same query pattern is called many times in rapid
 * succession (which usually means a loop is doing individual queries
 * instead of one batch query).
 *
 * Example of N+1 problem:
 *   BAD:  for (id of ids) { await db.findById(id); }  → N queries
 *   GOOD: await db.findMany({ where: { id: { in: ids } } })  → 1 query
 *
 * Usage: Wrap DB class methods or enable in dev mode.
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface QueryRecord {
  pattern: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

// ── Configuration ────────────────────────────────────────────────────────────

const WINDOW_MS = 500;        // Time window to detect repeated queries (ms)
const THRESHOLD = 3;          // Minimum repetitions to flag as N+1
const MAX_TRACKED = 100;      // Maximum concurrent patterns to track

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

// ── In-memory tracker ────────────────────────────────────────────────────────

const activePatterns = new Map<string, QueryRecord>();
const reportedPatterns = new Set<string>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a query execution. If the same pattern is called more than
 * THRESHOLD times within WINDOW_MS, it logs an N+1 warning.
 *
 * @param tableName  The model/table being queried (e.g., "Product", "Order")
 * @param operation  The operation type (e.g., "findUnique", "findMany")
 * @param keyFields  Fields used in the where clause (e.g., ["id", "tenantId"])
 */
export function trackQuery(
  tableName: string,
  operation: string,
  keyFields: string[] = [],
): void {
  if (!isDev()) return; // Only active in development

  const pattern = `${tableName}.${operation}(${keyFields.sort().join(",")})`;
  const now = Date.now();

  const existing = activePatterns.get(pattern);

  if (existing && now - existing.lastSeen < WINDOW_MS) {
    // Same pattern within window — increment
    existing.count++;
    existing.lastSeen = now;

    if (existing.count >= THRESHOLD && !reportedPatterns.has(pattern)) {
      reportedPatterns.add(pattern);
      const elapsed = now - existing.firstSeen;

      logger.warn(`[N+1 DETECTED] ${pattern} called ${existing.count}x in ${elapsed}ms`, {
        pattern,
        count: existing.count,
        windowMs: elapsed,
        suggestion: `Use ${tableName}.findMany() with { where: { ${keyFields[0] || "id"}: { in: [...] } } } instead of looping`,
      });
    }
  } else {
    // New pattern or expired window — reset
    if (activePatterns.size >= MAX_TRACKED) {
      // Evict oldest entry
      const oldest = Array.from(activePatterns.entries())
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
      if (oldest) activePatterns.delete(oldest[0]);
    }

    activePatterns.set(pattern, {
      pattern,
      count: 1,
      firstSeen: now,
      lastSeen: now,
    });
  }
}

/**
 * Get all detected N+1 patterns (for the admin/dev dashboard).
 */
export function getDetectedPatterns(): Array<{
  pattern: string;
  reported: boolean;
}> {
  return Array.from(activePatterns.values()).map(r => ({
    pattern: r.pattern,
    reported: reportedPatterns.has(r.pattern),
  }));
}

/**
 * Reset the tracker (useful in tests).
 */
export function resetQueryMonitor(): void {
  activePatterns.clear();
  reportedPatterns.clear();
}
