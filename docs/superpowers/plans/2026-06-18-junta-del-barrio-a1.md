# La Junta del Barrio — Fase A1 (fundación social) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps con checkbox.

**Goal:** Convertir la Junta del Barrio de fachada muerta a feature real: juntas persistidas, progreso real, unirse + compartir por WhatsApp (tuteo), landing `/junta/[code]` (mata el 404). SIN tocar checkout (el premio de envío gratis = Fase A2).

**Architecture:** Fase 2 del spec `2026-06-18-tu-barrio-buleje-design.md`, rebanada A1. Nuevos modelos `Junta`+`JuntaMember` (no se toca `Order`). DB class canónica `juntas.db.ts`. API crear/unirse/progreso con sesión de cliente. UI: `GroupBuyCard` cableado a datos reales + landing. Estado de la junta se computa con expiry on-read (sin cron en A1).

**Tech Stack:** Prisma 7 (migración vía Supabase MCP `apply_migration`) · Next 16 App Router · Zod 4 `safeParse` · Vitest 4.

**Convención tests:** SOLO `__tests__/**` (mirror del source). Import del source con `@/...`.

**Fuera de scope (A2):** envío gratis al completar, `Order.juntaId`, cron `juntas-resolve`, agrupado de ruta, segmentación GPS.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `prisma/schema.prisma` | Modelos `Junta` + `JuntaMember` + enum `JuntaStatus` | Modificar |
| (Supabase) | Migración SQL idempotente de las 2 tablas | Aplicar vía MCP |
| `lib/db/juntas.db.ts` | DB class: `create`, `getByCode`, `join`, `listOpenByZone` | Crear |
| `app/api/juntas/route.ts` | POST crear · GET listar por zona | Crear |
| `app/api/juntas/[code]/route.ts` | GET progreso | Crear |
| `app/api/juntas/[code]/join/route.ts` | POST unirse | Crear |
| `lib/junta/code.ts` | Generador de código corto compartible | Crear |
| `app/(store)/junta/[code]/page.tsx` | Landing real de la junta (mata el 404) | Crear |
| `components/marketplace/GroupBuyCard.tsx` | Cablear a datos reales + fix voseo→tuteo | Modificar |
| `__tests__/lib/**`, `__tests__/app/**` | Tests | Crear |

---

## Modelo de datos (A1)

```prisma
enum JuntaStatus {
  OPEN
  COMPLETE
  EXPIRED
}

model Junta {
  id            String        @id @default(cuid())
  tenantId      String
  code          String        // slug corto compartible (ej. "BARRIO-7F3X")
  initiatorId   String        // customerId (phone normalizado) que la abrió
  productLabel  String?       // contexto opcional ("Arroz 5kg", etc.)
  zoneLabel     String        // zona de entrega (label, NO FK en A1)
  windowEnd     DateTime      // cutoff: cuándo deja de aceptar miembros
  targetMembers Int           @default(4)
  status        JuntaStatus   @default(OPEN)
  createdAt     DateTime      @default(now())
  members       JuntaMember[]

  @@unique([tenantId, code])
  @@index([tenantId, status, zoneLabel])
}

model JuntaMember {
  id         String   @id @default(cuid())
  juntaId    String
  customerId String   // phone normalizado
  orderId    String?  // se liga en checkout (Fase A2)
  joinedAt   DateTime @default(now())
  junta      Junta    @relation(fields: [juntaId], references: [id], onDelete: Cascade)

  @@unique([juntaId, customerId])
  @@index([juntaId])
}
```

**Estado computado (on-read):** `OPEN` si `windowEnd > now` y `members < target`; `COMPLETE` si `members >= target`; `EXPIRED` si `windowEnd <= now` y `members < target`. El campo `status` persistido se actualiza en `join` cuando llega a target (COMPLETE); EXPIRED se infiere on-read (A1 sin cron).

---

## Task 1: Generador de código de junta (TDD)

**Files:** Create `lib/junta/code.ts` · Test `__tests__/lib/junta/code.test.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { makeJuntaCode } from "@/lib/junta/code";

describe("makeJuntaCode", () => {
  it("genera código con prefijo BARRIO- y 4 chars", () => {
    const c = makeJuntaCode(() => 0.5);
    expect(c).toMatch(/^BARRIO-[A-Z0-9]{4}$/);
  });
  it("es determinista dado el rng (para tests)", () => {
    expect(makeJuntaCode(() => 0)).toBe(makeJuntaCode(() => 0));
  });
  it("varía con el rng", () => {
    expect(makeJuntaCode(() => 0)).not.toBe(makeJuntaCode(() => 0.999));
  });
});
```

- [ ] **Step 2:** `npx vitest run __tests__/lib/junta/code.test.ts` → falla (módulo inexistente).

- [ ] **Step 3: Implementar** `lib/junta/code.ts`

```typescript
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin O/0/I/1/L

/** Código corto legible para compartir una junta. rng inyectable para tests. */
export function makeJuntaCode(rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return `BARRIO-${out}`;
}
```

- [ ] **Step 4:** corré → 3 verde. **Step 5:** commit `feat(junta): generador de codigo corto`.

---

## Task 2: Schema + migración (zona de peligro)

**Files:** Modificar `prisma/schema.prisma` · aplicar SQL vía Supabase MCP.

- [ ] **Step 1:** Agregar el enum `JuntaStatus` y los modelos `Junta`+`JuntaMember` (bloque de arriba) al final de `prisma/schema.prisma`.

- [ ] **Step 2:** Aplicar la migración idempotente vía Supabase MCP `apply_migration` (`mcp__claude_ai_Supabase__apply_migration`). Primero `list_projects` para el ref. SQL:

```sql
DO $$ BEGIN
  CREATE TYPE "JuntaStatus" AS ENUM ('OPEN','COMPLETE','EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Junta" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "initiatorId" TEXT NOT NULL,
  "productLabel" TEXT,
  "zoneLabel" TEXT NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "targetMembers" INTEGER NOT NULL DEFAULT 4,
  "status" "JuntaStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Junta_tenantId_code_key" ON "Junta"("tenantId","code");
CREATE INDEX IF NOT EXISTS "Junta_tenantId_status_zoneLabel_idx" ON "Junta"("tenantId","status","zoneLabel");

CREATE TABLE IF NOT EXISTS "JuntaMember" (
  "id" TEXT PRIMARY KEY,
  "juntaId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JuntaMember_juntaId_fkey" FOREIGN KEY ("juntaId") REFERENCES "Junta"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "JuntaMember_juntaId_customerId_key" ON "JuntaMember"("juntaId","customerId");
CREATE INDEX IF NOT EXISTS "JuntaMember_juntaId_idx" ON "JuntaMember"("juntaId");
```

- [ ] **Step 3:** `npx prisma generate` (regenera el client con los nuevos modelos). REINICIAR dev server si está corriendo (gotcha schema).

- [ ] **Step 4:** Verificar con `mcp__claude_ai_Supabase__list_tables` que `Junta` y `JuntaMember` existen. **Step 5:** commit `feat(junta): schema Junta + JuntaMember + migracion`.

---

## Task 3: DB class `juntas.db.ts` (TDD)

**Files:** Create `lib/db/juntas.db.ts` · Test `__tests__/lib/db/juntas.db.test.ts`

Rubric `db-class`: `tenantId` 1er parámetro, sin fallback "main", sin interpolación en raw SQL, invalidar caché tras writes. Métodos:
- `create(tenantId, { initiatorId, zoneLabel, productLabel?, windowEnd, targetMembers? })`: genera code (`makeJuntaCode`, reintenta si colisiona unique), crea `Junta` + primer `JuntaMember` (initiator) en una tx.
- `getByCode(tenantId, code)`: Junta + members; computa `effectiveStatus` (OPEN/COMPLETE/EXPIRED on-read).
- `join(tenantId, code, customerId)`: crea `JuntaMember` (idempotente vía unique → si ya existe, no duplica); si `count >= target` y status OPEN → update a COMPLETE. Rechaza si EXPIRED.
- `listOpenByZone(tenantId, zoneLabel)`: juntas OPEN con `windowEnd > now` en la zona.

- [ ] **Step 1: Test que falla** (mock de `@/lib/prisma`) — cubre: create genera code+initiator member; join idempotente; join lleva a COMPLETE al llegar a target; getByCode computa EXPIRED si windowEnd pasó. (Escribir con `vi.clearAllMocks()` en `beforeEach` — el repo NO resetea mocks entre tests.)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: vi.fn(), junta: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  juntaMember: { create: vi.fn(), count: vi.fn() },
} }));
import { JuntasDB } from "@/lib/db/juntas.db";
// ... (el implementador completa los casos con los mocks; clearAllMocks en beforeEach)
```

> NOTA implementador: definir los casos concretos contra la API real de `prisma` que uses. Mantener tenantId 1er parámetro. Computar estado con un helper puro `effectiveStatus(members, target, windowEnd, now)` testeable aparte.

- [ ] **Step 2-4:** TDD hasta verde. **Step 5:** commit `feat(junta): DB class juntas.db con estado computado`.

---

## Task 4: API routes (TDD)

**Files:** Create `app/api/juntas/route.ts`, `app/api/juntas/[code]/route.ts`, `app/api/juntas/[code]/join/route.ts` · Tests en `__tests__/app/api/juntas/**`.

Patrón (igual que `app/api/checkout/fiado-option/route.ts`): `applyRateLimit(req, "STRICT", "...")`, sesión cliente vía `req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)` + `getCustomerPayload`, `safeParse` Zod, sin `force-dynamic`. `customerId` = `normalizePhone(payload.customerId)`.

- POST `/api/juntas`: body `{ zoneLabel: string, productLabel?: string, targetMembers?: 2..12, windowHours?: 1..72 }` → `JuntasDB.create(tenantId, {...})`. Devuelve `{ code }`.
- GET `/api/juntas/[code]`: → `JuntasDB.getByCode(tenantId, code)` serializado: `{ code, zoneLabel, productLabel, target, count, status, windowEnd }`. 404 si no existe.
- POST `/api/juntas/[code]/join`: → `JuntasDB.join(tenantId, code, customerId)`. Devuelve progreso actualizado. 400 si EXPIRED.

- [ ] TDD por route (mock de `JuntasDB` + sesión). Casos: sin sesión 401; crear OK devuelve code; join idempotente; get inexistente 404. **Commit** por route o agrupado: `feat(junta): API crear/unirse/progreso`.

---

## Task 5: Landing `/junta/[code]` + GroupBuyCard real + home strip

**Files:** Create `app/(store)/junta/[code]/page.tsx` · Modificar `components/marketplace/GroupBuyCard.tsx` · home strip (componente nuevo `components/marketplace/JuntaBarrioStrip.tsx` montado en el home del marketplace).

Reglas UI: tuteo (fix del voseo actual de GroupBuyCard: "Arma"/"Ahorras"/"Compartes"/"súmate"), tokens DS, Lucide, `(store)` NO renderea su propio nav/footer.

- `app/(store)/junta/[code]/page.tsx`: server component, lee el code, fetch `JuntasDB.getByCode`, renderiza progreso real + botón "Unirme" (POST join) + compartir WhatsApp (tuteo). Empty/expired states.
- `GroupBuyCard.tsx`: aceptar props reales (`code`, `count`, `target`, `status`, `zoneLabel`) + callbacks reales (join, share). Quitar los defaults fake. Fix voseo→tuteo en TODO el copy.
- `JuntaBarrioStrip.tsx`: si hay junta OPEN en la zona del visitante → "Tu cuadra: {count}/{target} · únete". Montar en el home del marketplace.

- [ ] Verificación visual: `/preview /junta/BARRIO-XXXX` (crear una junta de prueba vía API primero) light+dark; confirmar progreso real, tuteo, sin texto diminuto. **Commit:** `feat(junta): landing /junta/[code] + GroupBuyCard real + strip home`.

---

## Task 6: Verificación e2e

- [ ] Crear junta vía `POST /api/juntas` (con sesión cliente + CSRF, skill `/auth` o cookie). Unir 2-3 clientes vía join. Confirmar en DB (`SELECT * FROM "Junta"`, `"JuntaMember"`) que persisten y que status pasa a COMPLETE al llegar a target. Landing muestra el progreso real. **Commit** `test(junta): e2e fundacion social` (o `--allow-empty` si solo verificación manual).

---

## Self-Review (cobertura spec §6)
| Requisito spec | Task |
|---|---|
| Schema Junta+JuntaMember | 2 |
| DB class | 3 |
| Flujo crear/unirse/progreso | 1 (code) + 3 + 4 |
| Landing real (mata 404) | 5 |
| GroupBuyCard real + tuteo | 5 |
| Strip en home | 5 |
| **Diferido A2:** envío gratis, cron resolve, Order.juntaId, agrupado ruta | — |
