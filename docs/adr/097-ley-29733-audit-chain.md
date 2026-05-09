# ADR-097 — Ley 29733: Conexión del Audit Chain a Prisma

**Fecha:** 2026-05-08
**Estado:** Aceptado
**Autores:** Backend Platform Engineer, Bug Hunter
**Impacto:** Legal / Compliance / P0

---

## Contexto

La Ley 29733 de Perú (Protección de Datos Personales), artículos 23-25, exige un registro inalterable de accesos y modificaciones a datos personales. El incumplimiento expone a multas SBS de S/ 2,150 a S/ 430,000.

**Bug descubierto (2026-05-08):** El Bug Hunter detectó que `complianceAuditExtension` estaba correctamente implementada en `lib/audit/prisma-middleware.ts` pero **nunca conectada** al cliente Prisma en `lib/prisma.ts`. El código existía pero era letra muerta — desde el primer deploy ninguna operación sobre datos personales generaba audit entries con hash chain.

**Hallazgo secundario (P1):** El `latestHashCache` (Map in-memory) en `prisma-middleware.ts` era process-scoped sin TTL. En Vercel Fluid Compute con múltiples instancias calientes, dos instancias concurrentes podían leer `"GENESIS"` como hash previo, produciendo cadenas divergentes desde el mismo punto.

---

## Decisión

### 1. Conectar la extension en `lib/prisma.ts` (PASO 1)

Dentro de `createPrismaClient()`, después de construir `new PrismaClient({ adapter })`, se aplica `.$extends(complianceAuditExtension)` condicionalmente:

```typescript
import { complianceAuditExtension } from "@/lib/audit/prisma-middleware";

const auditEnabled = process.env.AUDIT_CHAIN_ENABLED !== "false";
const base = new PrismaClient({ adapter });
if (!auditEnabled) return base;
return base.$extends(complianceAuditExtension) as unknown as PrismaClient;
```

**Feature flag `AUDIT_CHAIN_ENABLED`:**
- Default: activo en todos los entornos (prod + dev + CI).
- Setear `AUDIT_CHAIN_ENABLED=false` en CI o desarrollo local para evitar saturación del log.
- En prod nunca debe ser `false` — viola la Ley 29733.

**Por qué dentro de `createPrismaClient()` y no en el Proxy externo:**
Prisma 7 `.$extends()` retorna un objeto nuevo que no es compatible con el tipo `PrismaClient` directamente. El Proxy lazy existente wrappea el cliente ya instanciado, por lo que la extension debe aplicarse en la instancia base, no después del Proxy.

### 2. Cache con TTL de 60 s + invalidación tras write (PASO 2)

El `latestHashCache` fue reemplazado con una estructura `Map<string, { hash: string; expiresAt: number }>` con TTL de 60 segundos (`performance.now()` — no flageado por Next 16).

Dos mecanismos de mitigación de divergencia:
- **TTL 60 s:** Tras expirar, la instancia re-lee el hash real de la DB, convergiendo en máximo 60 s.
- **`invalidateHashCache(tenantId)` tras cada write:** La misma instancia borra su entrada de cache justo antes de escribir el nuevo hash, garantizando consistencia intra-instance.

**Migración futura a Upstash Redis (P1 recomendado):**
La interfaz del cache (`set/get/delete`) es intencionalmente idéntica a la API Redis, haciendo la migración trivial. Conectar via `lib/cache.ts` o `@upstash/redis` directamente.

### 3. Backfill de entradas existentes (PASO 3)

Script `scripts/backfill-l29733-chain.mjs` creado. Es idempotente (salta entradas que ya tienen hash). Procesa por tenant, ordenado por `createdAt ASC`, construyendo el chain desde `GENESIS`.

El script NO se ejecuta automáticamente — requiere decisión explícita de Brandon con `DIRECT_URL` accesible (o `DATABASE_URL` con puerto 5432).

### 4. Tests de regresión (PASO 4)

`__tests__/lib/audit-chain-integration.test.ts` cubre:
- `calculateHash` determinismo y sensibilidad a cambios.
- `buildHashData` formato correcto de string.
- `verifyChain` con 1, 3, 10 entries válidas.
- Tampering en entry[0], entry[1], entry[2] detectado con `brokenAt` correcto.
- Chains de múltiples tenants independientes.
- Flow completo con prisma mock (3 writes consecutivos + verify).

---

## Alternativas consideradas

| Alternativa | Razón de rechazo |
|---|---|
| Usar `prisma.$use()` (middleware legacy) | Removido en Prisma 7 — solo existe `.$extends()` |
| Log a tabla separada `ComplianceLog` | Requeriría migración de schema (no disponible sin DIRECT_URL accesible) — ActivityLog ya tiene la estructura correcta |
| Reemplazar inmediatamente con Upstash Redis | Scope excesivo para P0. El TTL de 60 s es mitigación suficiente a corto plazo |
| Deshabilitar logs de READ para reducir volumen | Los artículos 23-25 incluyen acceso (READ) a datos personales — no es omisible |

---

## Consecuencias

**Positivas:**
- Ley 29733 art. 23-25 ahora tiene cobertura técnica real.
- Hash chain detectable en `GET /api/compliance/verify-chain` (si existe) o via script.
- Feature flag permite desactivar en CI sin riesgo legal.

**Negativas / Riesgos:**
- **Latencia +3-7 ms por operación** en modelos sensibles (12 modelos): el audit log es fire-and-forget, así que no bloquea la respuesta HTTP, pero sí añade carga a la conexión DB.
- **Storage:** ~1 KB por audit entry. Con 100 operaciones/día sobre datos personales = ~100 KB/día = ~3 MB/mes. Monitorear si escala.
- **READ logging es agresivo:** Cada `findMany`/`findFirst` en Customer, Order, Sale, etc. genera una entrada. En storefront con alto tráfico esto puede saturar ActivityLog. Reconsiderar filtrar READs a solo escrituras si el volumen es un problema (requiere nuevo ADR y análisis legal).
- **Multi-instance divergencia:** Mitigada con TTL 60 s. Riesgo residual: si dos instancias escriben simultáneamente para el mismo tenant en la misma ventana de 60 s, el hash previo podría ser el mismo en ambas. La cadena tendría dos ramas. Solución definitiva: Upstash Redis.

---

## Comandos de operación

### Activar/desactivar (Vercel env)
```
AUDIT_CHAIN_ENABLED=false   # desactiva (solo CI/dev)
AUDIT_CHAIN_ENABLED=true    # activa (default implícito)
```

### Backfill (Brandon debe correr esto)
```bash
# Dry run — ver qué se actualizaría sin escribir
DRY_RUN=1 node -r dotenv/config scripts/backfill-l29733-chain.mjs dotenv_config_path=.env.local

# Aplicar (requiere DATABASE_URL con puerto 5432 accesible)
node -r dotenv/config scripts/backfill-l29733-chain.mjs dotenv_config_path=.env.local
```

### Tests
```bash
npx vitest run __tests__/lib/audit-chain-integration.test.ts
```

---

## Referencias

- Ley 29733 Perú — Protección de Datos Personales (art. 23-25)
- Reglamento DS 003-2013-JUS
- `lib/audit/prisma-middleware.ts` — extension Prisma
- `lib/audit/hash-chain.ts` — SHA-256 chain helpers
- `lib/prisma.ts` — singleton Prisma con extension conectada
- ADR-022 — Upstash Redis rate limiting (infra Redis disponible)
