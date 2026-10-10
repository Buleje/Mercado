# CONTRACTS/ — Contratos de ola (architect output)

El agente `architect` genera un contrato por ola antes de que los frentes arranquen.
Back y front trabajan contra este contrato, no contra suposiciones.

## Formato

```
CONTRACTS/ola-{N}.md
```

## Contenido obligatorio por item

```markdown
## Item #X — Titulo

### Tipos compartidos
export interface CreateCouponRequest { ... }
export interface CreateCouponResponse { ... }

### API Endpoints
POST /api/marketplace/coupons
  Auth: requireAdmin(["admin"])
  Body: CreateCouponRequest
  Response 201: CreateCouponResponse
  Response 400: { error: string, issues: ZodIssue[] }

### Zod Schema
const CreateCouponSchema = z.object({ ... });

### Props componente
interface CouponToggleProps { ... }

### Dependencias
- back crea API → front consume
```

## Reglas

1. Tipos TS son el contrato — no texto en prosa
2. Schemas Zod listos para copiar directamente al backend
3. Props con JSDoc y defaults claros
4. Si el architect no lo define, el frente NO lo inventa
