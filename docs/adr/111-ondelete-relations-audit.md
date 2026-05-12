# ADR-111: Auditoría onDelete en relaciones Prisma (45 sin política explícita)

**Status:** Proposed
**Date:** 2026-05-12
**Decisión-makers:** Brandon Buleje
**Context:** Audit Code Reviewer detectó 45 relaciones en `prisma/schema.prisma` que dependen del default `onDelete: NoAction` (= bloqueante si hay rows hijas). Esto es seguro pero puede generar errores opacos en producción al intentar borrar (`P2003 Foreign key constraint`).

---

## Decisión

Aplicar política explícita por categoría de relación:

| Tipo de relación parent | Política | Razón |
|---|---|---|
| `tenant: Tenant` (33 rels) | `Cascade` | Borrar tenant = borrar TODOS sus datos (offboarding limpio) |
| `customer: Customer` (4 rels) | `SetNull` | Preservar histórico de orders/sales aún si customer eliminado |
| `order: Order` (4 rels) | `Cascade` | Items, delivery slots y returns nacen con la order |
| `product: Product` (3 rels) | `Restrict` | NO se puede borrar producto con orders/recipes activas |
| `store: Store` (2 rels) | `Cascade` | Borrar store = borrar sus inventarios y assignments |
| `supplier: Supplier` (1 rel) | `Restrict` | NO se puede borrar supplier con purchase orders |
| `creditProfile: CreditProfile` (2 rels) | `Cascade` | Installments solo viven con el profile |
| `partner: DeliveryPartner` (1 rel) | `SetNull` | Preservar histórico de offers aún si partner se da de baja |
| `folder: DocumentFolder` (1 rel) | `SetNull` | Documents quedan huérfanos pero accesibles |
| `parent: DocumentFolder` (1 rel) | `Cascade` | Subfolders desaparecen con parent |
| Polimórfica/otras (3) | Evaluar caso por caso | — |

---

## Plan de aplicación

1. **Fase 1 (read-only audit, hoy 2026-05-12):** este ADR documenta el plan.
2. **Fase 2 (schema edit + migration, próximo sprint):**
   - Editar `prisma/schema.prisma` agregando `onDelete:` a las 45 relaciones.
   - DANGER ZONE: skill bloquea — requiere override consciente con `--accept-danger`.
   - Generar migration: `prisma migrate dev --create-only --name add-ondelete-policies`.
3. **Fase 3 (verificación staging):**
   - Smoke test borrado de tenant en staging.
   - Smoke test rechazo de borrado de producto con orders activas.
4. **Fase 4 (deploy producción):** canary 5% → 25% → 100%.

---

## Riesgos

- **Cascade en Tenant**: si Brandon borra accidentalmente un tenant en superadmin, pierde TODOS sus datos. Mitigación: confirmación doble en `/superadmin/tenants/[id]/delete` + soft-delete previo.
- **Restrict en Product**: bloqueará borrado de productos con historia. Hoy probablemente ya falla silenciosamente — esto lo hace explícito.
- **SetNull en Customer**: requiere que las FK sean `customerId String?` (nullable). Si alguna es `String` (NOT NULL), la migration fallará. Revisar antes.

---

## Alternativas consideradas

- **NoAction (status quo)**: deja errores opacos en prod. Rechazado.
- **Cascade global**: muy peligroso para Product/Supplier. Rechazado.
- **Soft-delete en lugar de FK**: refactor masivo, no se justifica para los pocos casos de borrado real. Rechazado.

---

## Línea de relaciones detectadas (referencia)

Ver `/tmp/relations-no-ondelete.txt` o:
```bash
grep -nE "@relation\(.+references:" prisma/schema.prisma | grep -v "onDelete"
```

Total: 45 relaciones. Líneas 1300, 1954, 1982, 1983, 2026, 2027, 2055, 2056, 2070, 2083, 2084, 2159, 2160, 2246, 2269, 2286, 2287, 2288, 2322, 2323, 2382, 2383, 2429, 2430, 2452, 2471, 2588, 2644, 2646, 2727, 2729, 2847, 2930, 2940, 2955, 2990, 3071, 3182, 3211, 3398, 3399, 3454, 3528, 4274, 4295.

---

## Notas

- ADR documenta el plan SIN tocar el schema (regla DANGER ZONE).
- Próximo sprint: aplicar Fase 2 con override consciente.
- No requiere cambio de código en `lib/db/*.db.ts` — Prisma maneja la cascada a nivel DB.
