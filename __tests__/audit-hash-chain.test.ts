/**
 * __tests__/audit-hash-chain.test.ts
 *
 * Unit tests para lib/audit/hash-chain.ts — integridad del audit log
 * usando hash chain SHA-256 (Ley 29733 PE Art. 16).
 *
 * CRÍTICO: si el hash chain está roto, el audit log NO es válido legalmente.
 * Cualquier modificación retroactiva debe ser DETECTABLE.
 */

import { describe, it, expect } from "vitest";
import {
  calculateHash,
  buildHashData,
  verifyChain,
  type AuditEntry,
} from "@/lib/audit/hash-chain";

const sampleEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "audit-1",
  action: "create",
  entity: "order",
  entityId: "order-123",
  detail: "Created order via admin",
  user: "admin@buleje.pe",
  ipAddress: "192.168.1.1",
  tenantId: "tenant-main",
  createdAt: new Date("2026-05-12T10:00:00Z"),
  previousHash: null,
  hash: "",
  ...overrides,
});

function buildEntry(prev: AuditEntry | null, partial: Partial<AuditEntry> = {}): AuditEntry {
  const base = sampleEntry({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...partial,
    previousHash: prev?.hash ?? null,
  });
  const data = buildHashData(base);
  base.hash = calculateHash(data, prev?.hash ?? "GENESIS");
  return base;
}

// ─── calculateHash ────────────────────────────────────────────────────────────

describe("calculateHash — SHA-256 determinism", () => {
  it("retorna 64 caracteres hex", () => {
    const hash = calculateHash("data", "prev");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("misma data + previousHash → mismo hash (determinístico)", () => {
    const h1 = calculateHash("payload", "prev-hash");
    const h2 = calculateHash("payload", "prev-hash");
    expect(h1).toBe(h2);
  });

  it("cambio en data → hash DIFERENTE (no colisión trivial)", () => {
    const h1 = calculateHash("payload", "prev");
    const h2 = calculateHash("payload2", "prev");
    expect(h1).not.toBe(h2);
  });

  it("cambio en previousHash → hash DIFERENTE", () => {
    const h1 = calculateHash("payload", "prev-1");
    const h2 = calculateHash("payload", "prev-2");
    expect(h1).not.toBe(h2);
  });
});

// ─── buildHashData ────────────────────────────────────────────────────────────

describe("buildHashData — serialización determinística", () => {
  it("retorna string pipe-separated con TODOS los campos críticos", () => {
    const entry = sampleEntry();
    const data = buildHashData(entry);
    expect(data).toContain("create");
    expect(data).toContain("order");
    expect(data).toContain("order-123");
    expect(data).toContain("admin@buleje.pe");
    expect(data).toContain("tenant-main");
  });

  it("entityId null se serializa como string vacío", () => {
    const data = buildHashData({ ...sampleEntry(), entityId: null });
    expect(data).toContain("||");
  });

  it("createdAt Date → ISO string", () => {
    const data = buildHashData({
      ...sampleEntry(),
      createdAt: new Date("2026-05-12T10:00:00Z"),
    });
    expect(data).toContain("2026-05-12T10:00:00.000Z");
  });

  it("createdAt string → pass-through (idempotente para re-serialización)", () => {
    const data = buildHashData({
      ...sampleEntry(),
      createdAt: "2026-05-12T10:00:00.000Z",
    });
    expect(data).toContain("2026-05-12T10:00:00.000Z");
  });

  it("cambios en CUALQUIER campo afectan el data string", () => {
    const base = sampleEntry();
    const fields: (keyof typeof base)[] = [
      "action", "entity", "entityId", "detail", "user", "tenantId",
    ];
    const baseData = buildHashData(base);
    for (const field of fields) {
      const modified = buildHashData({ ...base, [field]: "MUTATED" });
      expect(modified).not.toBe(baseData);
    }
  });
});

// ─── verifyChain — happy path ──────────────────────────────────────────────────

describe("verifyChain — happy path", () => {
  it("chain vacío es válido", () => {
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it("1 entry válida (genesis correcto) → valid", () => {
    const entry = buildEntry(null);
    expect(verifyChain([entry])).toEqual({ valid: true });
  });

  it("3 entries enlazadas correctamente → valid", () => {
    const e1 = buildEntry(null, { id: "1", action: "create" });
    const e2 = buildEntry(e1, { id: "2", action: "update" });
    const e3 = buildEntry(e2, { id: "3", action: "delete" });
    expect(verifyChain([e1, e2, e3])).toEqual({ valid: true });
  });

  it("100 entries enlazadas correctamente → valid (stress)", () => {
    const chain: AuditEntry[] = [];
    let prev: AuditEntry | null = null;
    for (let i = 0; i < 100; i++) {
      const e = buildEntry(prev, { id: `entry-${i}`, action: `action-${i}` });
      chain.push(e);
      prev = e;
    }
    expect(verifyChain(chain)).toEqual({ valid: true });
  });
});

// ─── verifyChain — TAMPERING DETECTION (lo más crítico) ────────────────────────

describe("verifyChain — detecta tampering", () => {
  it("detecta cambio en data de entry 0 (genesis tampering)", () => {
    const e1 = buildEntry(null, { action: "create" });
    const e2 = buildEntry(e1, { action: "update" });

    // Atacante modifica e1.action pero deja e1.hash original
    const tampered = { ...e1, action: "TAMPERED" };
    const result = verifyChain([tampered, e2]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("detecta cambio en data de entry middle (chain rota desde ahí)", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);
    const e3 = buildEntry(e2);

    const tamperedE2 = { ...e2, detail: "Hacked" };
    const result = verifyChain([e1, tamperedE2, e3]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detecta hash modificado sin cambiar data (forge attempt)", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);

    const fakeHash = "f".repeat(64);
    const forgedE1 = { ...e1, hash: fakeHash };
    const result = verifyChain([forgedE1, e2]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("detecta previousHash modificado (intento de re-link)", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);
    const e3 = buildEntry(e2);

    // Atacante modifica e3.previousHash a un valor random
    const forgedE3 = { ...e3, previousHash: "deadbeef" + "0".repeat(56) };
    const result = verifyChain([e1, e2, forgedE3]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it("detecta deleción del medio (chain ya no enlaza)", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);
    const e3 = buildEntry(e2);
    const e4 = buildEntry(e3);

    // Atacante elimina e2 del array, dejando e1, e3, e4
    // El previousHash de e3 ya no matchea con e1.hash
    const result = verifyChain([e1, e3, e4]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detecta inserción de entry forjada en el medio", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);

    // Atacante inserta entry forjada entre e1 y e2 sin recalcular
    const forged = sampleEntry({
      id: "forged",
      previousHash: e1.hash,
      hash: "f".repeat(64), // hash inventado
    });
    const result = verifyChain([e1, forged, e2]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });
});

// ─── verifyChain — edge cases ──────────────────────────────────────────────────

describe("verifyChain — edge cases", () => {
  it("entry con previousHash explícitamente null (genesis) — valid", () => {
    const e = buildEntry(null);
    expect(e.previousHash).toBeNull();
    expect(verifyChain([e]).valid).toBe(true);
  });

  it("entry con previousHash 'GENESIS' string — valid", () => {
    const base = sampleEntry({ previousHash: "GENESIS" });
    const data = buildHashData(base);
    base.hash = calculateHash(data, "GENESIS");
    expect(verifyChain([base]).valid).toBe(true);
  });

  it("modificación de ipAddress NO está en hash data (intencional: campo no firmado)", () => {
    const e1 = buildEntry(null);
    const e2 = buildEntry(e1);

    // ipAddress NO se incluye en buildHashData → modificarlo NO rompe la chain
    const modified = { ...e2, ipAddress: "10.0.0.1" };
    const result = verifyChain([e1, modified]);

    expect(result.valid).toBe(true);
  });
});
