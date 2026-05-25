# ADR-118 — Adelantos & Liquidaciones: features enterprise (multi-moneda, límite, comprobantes, recordatorios, recurrentes)

**Fecha:** 2026-05-25 · **Estado:** Aceptado · **Relacionado:** ADR-117 (módulo base)

## Contexto

El módulo Adelantos & Liquidaciones (ADR-117) ya tiene 6 secciones (Resumen, Lista,
Personas, Cobranza, Actividad, Análisis) + estado de cuenta. Para llevarlo a nivel
producto faltan 5 features que tocan schema y/o infraestructura (cron). Se agrupan en
**una sola sesión dedicada** porque comparten migración de schema y requieren el cuidado
de zona de peligro (CLAUDE.md §6).

## Decisión

Implementar 5 features con migración **expand → migrate → contract** (zero-downtime):

| # | Feature | Schema | Infra |
|---|---|---|---|
| 1 | Multi-moneda correcta | (existe `moneda`) | Totales segmentados por moneda (backend + frontend) |
| 2 | Límite de crédito por persona | `AdelantoBeneficiario.limiteCredito Decimal?` | Validación en create |
| 3 | Comprobantes/fotos | `Adelanto.comprobanteUrl String?`, `AdelantoEntrega.comprobanteUrl String?` | `/api/upload` existente |
| 4 | Recordatorios automáticos | `AdelantoBeneficiario.ultimoRecordatorio DateTime?` | Cron diario + notificación |
| 5 | Adelantos recurrentes | nuevo modelo `AdelantoRecurrente` | Cron diario que materializa adelantos |

### Migración (EXPAND — fase 1, esta sesión)

Todas las columnas nuevas son **nullable** y el modelo nuevo es aditivo → 100%
backward-compatible. Se aplica vía `DIRECT_URL` (pgBouncer no soporta DDL) con
`ADD COLUMN IF NOT EXISTS` + `prisma generate` + restart del dev server.

```sql
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "limiteCredito" DECIMAL(12,2);
ALTER TABLE "AdelantoBeneficiario" ADD COLUMN IF NOT EXISTS "ultimoRecordatorio" TIMESTAMP(3);
ALTER TABLE "Adelanto" ADD COLUMN IF NOT EXISTS "comprobanteUrl" TEXT;
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "comprobanteUrl" TEXT;
-- + tabla AdelantoRecurrente (ver schema.prisma)
```

### Consecuencias

- **Positivo:** features de producto completas; nada rompe (expand seguro); cada una
  testeada en vivo + commit independiente.
- **Negativo / riesgo:** requiere restart del dev server (Prisma client). Cron nuevos
  agregan carga al scheduler. Multi-moneda obliga a segmentar TODOS los totales.
- **Mitigación:** columnas nullable (sin default destructivo); cron idempotente
  (`ultimaEjecucion`/`proximaEjecucion`); RBAC `requireAdmin` en todos los endpoints.

## Alternativas consideradas

- **localStorage para recordatorios** (ya implementado v1): se mantiene como fallback
  client-side; el cron server-side lo complementa para multi-dispositivo.
- **No multi-moneda:** la bodega opera en PEN; se implementa USD opt-in con totales
  segmentados para no mostrar sumas mezcladas incorrectas.

## Referencias
- ADR-117 (módulo base), CLAUDE.md §6 (zona de peligro), migration-planner skill.
