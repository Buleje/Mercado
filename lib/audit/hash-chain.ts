/**
 * SHA-256 Hash Chain for Ley 29733 Audit Log Integrity
 *
 * Creates an immutable chain where each entry references the hash of the
 * previous entry, making tampering detectable.
 *
 * Uses Node.js crypto module (available in Next.js API routes / server components).
 */

import { createHash } from "crypto";

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  ipAddress: string | null;
  tenantId: string;
  createdAt: Date | string;
  previousHash: string | null;
  hash: string;
}

/**
 * Calculate SHA-256 hash of an audit entry combined with the previous hash.
 * This creates a tamper-evident chain — changing any entry invalidates all
 * subsequent hashes.
 */
export function calculateHash(data: string, previousHash: string): string {
  return createHash("sha256")
    .update(`${previousHash}:${data}`)
    .digest("hex");
}

/**
 * Build the data string for hashing from an audit entry's content fields.
 * Excludes `hash` and `previousHash` since those are chain metadata.
 */
export function buildHashData(entry: {
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  tenantId: string;
  createdAt: Date | string;
}): string {
  const ts =
    entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : entry.createdAt;
  return `${entry.action}|${entry.entity}|${entry.entityId ?? ""}|${entry.detail}|${entry.user}|${entry.tenantId}|${ts}`;
}

/**
 * Verify the integrity of an audit log chain.
 * Returns `{ valid: true }` if the chain is intact, or
 * `{ valid: false, brokenAt: index }` indicating where tampering was detected.
 *
 * @param entries - Array of audit entries sorted by createdAt ASC (oldest first)
 */
export function verifyChain(
  entries: AuditEntry[],
): { valid: boolean; brokenAt?: number } {
  if (entries.length === 0) return { valid: true };

  // Verify first entry: previousHash should be null or GENESIS
  const genesisData = buildHashData(entries[0]);
  const genesisPrev = entries[0].previousHash ?? "GENESIS";
  const expectedGenesisHash = calculateHash(genesisData, genesisPrev);

  if (entries[0].hash !== expectedGenesisHash) {
    return { valid: false, brokenAt: 0 };
  }

  // Verify each subsequent entry
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const prev = entries[i - 1];

    // The previousHash of entry[i] must equal the hash of entry[i-1]
    if (entry.previousHash !== prev.hash) {
      return { valid: false, brokenAt: i };
    }

    // Recompute the hash and compare
    const data = buildHashData(entry);
    const expected = calculateHash(data, entry.previousHash ?? "GENESIS");
    if (entry.hash !== expected) {
      return { valid: false, brokenAt: i };
    }
  }

  return { valid: true };
}
