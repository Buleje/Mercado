import "server-only";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_PREFIX = "sk_";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): string {
  return KEY_PREFIX + crypto.randomBytes(32).toString("hex");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new API key for `tenantId`.
 * The `rawKey` is returned ONCE and never stored in plaintext — the caller
 * must show it to the user immediately.
 */
export async function createApiKey(
  tenantId: string,
  name: string
): Promise<{ rawKey: string; keyPrefix: string; id: string }> {
  const rawKey = generateRawKey();
  const keyPrefix = rawKey.slice(0, 10); // "sk_" + first 7 hex chars
  const keyHash = hashKey(rawKey);

  const apiKey = await prisma.apiKey.create({
    data: { tenantId, name: name.trim(), keyPrefix, keyHash },
  });

  return { rawKey, keyPrefix, id: apiKey.id };
}

/**
 * Revoke (deactivate) an API key.
 * Scoped to `tenantId` so tenants cannot revoke other tenants' keys.
 */
export async function revokeApiKey(id: string, tenantId: string): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id, tenantId },
    data: { active: false },
  });
  return result.count > 0;
}

/**
 * Validate a raw API key from an Authorization header.
 * Returns the owning tenantId on success, null on failure.
 * Updates `lastUsedAt` asynchronously (fire-and-forget).
 */
export async function validateApiKey(rawKey: string): Promise<{ tenantId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashKey(rawKey);
  const key = await prisma.apiKey.findFirst({
    where: { keyHash, active: true },
    select: { id: true, tenantId: true },
  });
  if (!key) return null;

  // Fire-and-forget last-used update
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  return { tenantId: key.tenantId };
}

/**
 * List active API keys for a tenant (never returns key hashes).
 */
export async function listApiKeys(tenantId: string) {
  return prisma.apiKey.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}
