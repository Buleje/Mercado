# Pattern — Self-bootstrapping DB class

> Pattern observado y aplicado 3 veces en `lib/db/payment-approval.db.ts` durante la sesión 2026-05-02. Documentado aquí porque resuelve un bloqueador real (DIRECT_URL roto en WSL → `prisma migrate deploy` falla) sin sacrificar correctness en producción.

---

## Cuándo usarlo

✅ **Sí**, cuando:
- La tabla es **platform-level** (sin `tenantId`) — `PaymentApproval`, `SuperadminUser`, `PaymentProof`, `WhatsAppGlobalConfig`.
- La estructura es estable (no necesita evolución frecuente del schema).
- El DX local está bloqueado por DIRECT_URL roto / DNS / IPv6 / pgBouncer transaction-mode.
- Hay riesgo de que la tabla NO exista todavía cuando llega el primer write (deploy nuevo, migración pending).
- El equipo de plataforma controla el ciclo de vida (no es un schema de tenant).

❌ **No**, cuando:
- La tabla tiene `tenantId` — debe vivir en una migración prisma estándar (regla CLAUDE.md #1 + multi-tenant guards).
- Hay relaciones `@relation` que prisma client necesita modelar.
- Esperás que el schema cambie >1× por mes — la migración estándar es más mantenible.
- El acceso es high-frequency (10k+ qps) — el `bootstrapDone` lock es por-instancia y se evalúa en cada call (cheap pero no zero).

---

## Estructura

### 1. Module-level flag

```ts
let bootstrapDone = false;
```

### 2. Bootstrap function — idempotente

```ts
async function bootstrap(): Promise<void> {
  if (bootstrapDone) return;
  try {
    // eslint-disable-next-line no-restricted-properties -- bootstrap pre-migration
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentApproval" (
        "id" TEXT PRIMARY KEY,
        ...
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "PaymentApproval_status_idx"
        ON "PaymentApproval"("status");
    `);
    bootstrapDone = true;
  } catch (err) {
    logger.error("[payment-approval] bootstrap failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

### 3. Wrap every public method

```ts
export const PaymentApprovalDb = {
  async create(input: CreateInput): Promise<PaymentApproval> {
    await bootstrap();
    // ... raw SQL parameterized
  },
  async getById(id: string): Promise<PaymentApproval | null> {
    await bootstrap();
    // ...
  },
  // etc.
};
```

### 4. Migration file MUST also exist

`prisma/migrations/<timestamp>_<name>/migration.sql` con el mismo SQL (idempotente con `IF NOT EXISTS`). Cuando DIRECT_URL funciona y se corre `prisma migrate deploy`, ese archivo se aplica y los flags pasan al estado canónico. El bootstrap queda como **defense-in-depth**: si por algún motivo una nueva instancia Vercel arranca contra una DB sin el schema, no rompe el primer write.

---

## Anti-patterns asociados

### ❌ No usar `Math.random()` para IDs

```ts
// MAL: predecible, no es CSPRNG
const id = `pap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// BIEN: crypto.randomUUID() — disponible en todo runtime soportado
const id = crypto.randomUUID();
```

### ❌ No tragarse errores del INSERT

```ts
// MAL: el caller recibe un id "fantasma"
await prisma.$executeRaw`INSERT INTO ...`.catch((err) => {
  logger.warn("insert failed", { error: err });
  // continúa silenciosamente — el flujo sigue como si todo estuviera OK
});

// BIEN: throw para que el caller decida cómo recuperar
try {
  await prisma.$executeRaw`INSERT INTO ...`;
} catch (err) {
  logger.error("insert failed", { error: err });
  throw new Error("operation-name-insert-failed");
}
```

### ❌ No olvidar parameterización SQL

```ts
// MAL — interpolación directa, vulnerable a SQL injection
await prisma.$executeRawUnsafe(
  `SELECT * FROM "PaymentApproval" WHERE id = '${id}'`,
);

// BIEN — placeholders $1, $2, ...
await prisma.$executeRawUnsafe(
  `SELECT * FROM "PaymentApproval" WHERE id = $1`,
  id,
);
```

### ❌ No exponer PII en logs

```ts
// MAL — Ley 29733 PE: customerPhone es PII
logger.info("created", { customerPhone: input.customerPhone });

// BIEN — solo últimos 6 dígitos
logger.info("created", { customerPhone: input.customerPhone.slice(-6) });
```

---

## State-machine guards

Cuando el record tiene un campo `status` que transita por una FSM (pending → approved/rejected/finalized), **toda mutación debe incluir el guard de status en el WHERE**:

```ts
// MAL — race condition: dos calls concurrentes pueden ambos transicionar
async approve(id: string, reviewer: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "PaymentApproval" SET status = 'approved' WHERE id = $1`,
    id,
  );
}

// BIEN — UPDATE atómico con guard, retorna boolean
async approve(id: string, reviewer: string): Promise<boolean> {
  const affected = await prisma.$executeRawUnsafe(
    `UPDATE "PaymentApproval"
       SET status = 'approved', "reviewedBy" = $2, "reviewedAt" = NOW()
       WHERE id = $1
         AND status IN ('pending', 'review_required')`,
    id,
    reviewer,
  );
  return Number(affected) > 0; // false = ya finalizado por otro reviewer
}
```

---

## Casos en este repo

| Archivo | Tabla | Migración complementaria |
|---|---|---|
| `lib/db/payment-approval.db.ts` | `PaymentApproval` | `prisma/migrations/20260502120000_add_payment_approval/migration.sql` |
| `lib/db/payment-proofs.db.ts` | `PaymentProof` | (existing — no drift) |
| `scripts/create-superadmin-qa.mjs` | `SuperadminUser` | (existing — no drift) |
| `lib/db/admin-totp.db.ts` | `AdminTOTP` | (existing — no drift) |

---

## Tests

Cualquier DB class self-bootstrapping debe tener mocks que verifiquen:
1. Bootstrap es **idempotente** (segunda llamada no re-ejecuta CREATE TABLE).
2. Cada método público dispara el bootstrap antes de su query.
3. Errores en bootstrap se propagan al caller (no silent fallback).
4. State-machine guards: `approve`/`reject`/etc devuelven `false` cuando el record ya está finalizado.

Ver `__tests__/whatsapp/payment-approval.db.test.ts` (22 tests) como referencia.

---

## Referencias

- ADR-088 §2.4 — decisión de globalizar PaymentApproval sin tenantId.
- `WHATSAPP_SETUP.md` — runbook operacional del pipeline que usa este patrón.
- CLAUDE.md regla #1 — "nunca prisma.* directo, usar lib/db/*.db.ts" (este patrón cumple porque toda la lógica vive dentro del DB class).
- CLAUDE.md regla #11 — "raw SQL solo `$1 $2 $3`, nunca interpolation" (este patrón usa parameterización siempre).
