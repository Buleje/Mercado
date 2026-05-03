# ADR-090 — `isAdminTenant` flag para excluir tenants administrativos de alertas

- **Status:** Accepted (v1: hardcoded Set; v2: schema flag pendiente)
- **Fecha:** 2026-05-03
- **Autores:** Brandon Buleje + Claude Opus 4.7
- **Relacionado:** `TenantCard.tsx`, módulo `/superadmin/tenants`
- **Supersede a:** N/A

---

## 1. Contexto

En el panel `/superadmin/tenants`, el tenant `buleje` (cuenta personal del owner Brandon) aparecía con badge `1 PROBLEMA` y panel naranja *"Panel sin información útil — Faltan productos o movimientos"*.

Investigación: el tenant existe (plan Enterprise, 1 usuario), pero NUNCA se cargaron productos porque NO es una tienda comercial real — es la cuenta administrativa del owner. La lógica de health (`computeHealth`) no distinguía tenants comerciales de admin/demo, generando alerta falsa.

Brandon usaba `Pizza Pucallpa` y `Pòlleria El Dorado` como tenants reales. `buleje` debería excluirse de alertas operativas.

## 2. Decisión

### 2.1 v1: Lista hardcoded `ADMIN_TENANT_SLUGS`

```ts
const ADMIN_TENANT_SLUGS = new Set<string>(["buleje", "main"]);
function isAdminTenant(t: TenantRow): boolean {
  return ADMIN_TENANT_SLUGS.has(t.slug);
}
```

Razón de elegir hardcoded sobre flag DB:
- Cambio mínimo, sin migration de schema (zona peligrosa)
- Reversible en 1 commit
- 0 riesgo de schema drift
- Slugs de admin tenants cambian raramente (1-2 al año)

### 2.2 Modificación `computeHealth`

Si `isAdmin === true`:
- Skip alertas: "Sin productos", "Sin usuarios admin", "Sin marketplace"
- Mantener alerta: "Tienda inactiva" (admin tenants también pueden estar suspendidos)
- Retornar `{ ok, issues, isAdmin: true }`

### 2.3 UI

- Badge `intent="premium"` con texto **"Admin"** en lugar de `intent="offer"` "1 PROBLEMA"
- Panel data status: `SuccessAlert "Tenant administrativo — Cuenta interna del owner. No requiere productos ni movimientos."` en lugar de `WarningAlert`

## 3. Alternativas consideradas

| Opción | Razón de descarte |
|---|---|
| **Schema flag `isAdminTenant Boolean`** | Requería migration en zona peligrosa (`prisma/schema.prisma` 160 modelos). Promovible en v2 cuando estabilizado. |
| **Eliminar el tenant `buleje`** | Brandon lo usa como cuenta de pruebas / dueño. |
| **Filtrar por plan o trialEndsAt** | No correlaciona — admin tenants pueden tener cualquier plan. |
| **Endpoint `/api/superadmin/tenants` flag computado server-side** | El slug ya viaja en la response, filtrar client-side es más simple. |

## 4. Consecuencias

### Positivas
- Falsa alarma resuelta sin tocar DB
- Patrón replicable para futuros admin/demo tenants
- Reversible: cambiar 1 línea (Set vacío) restaura comportamiento previo

### Negativas / Riesgos
- Hardcoded → requiere PR para agregar/quitar tenant
- Si Brandon crea otro tenant admin con slug distinto, debe acordarse de agregarlo
- En v2 (schema flag), permitir toggle desde UI superadmin

### Plan v2 (pendiente)

```sql
-- migration expand-only (cuando estable)
ALTER TABLE "Tenant" ADD COLUMN "isAdminTenant" BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE "Tenant" SET "isAdminTenant" = TRUE WHERE slug IN ('buleje', 'main');
```

Frontend: cambiar el `Set` por `t.isAdminTenant`. Endpoint `/api/superadmin/tenants` debe incluir el campo en SELECT.

## 5. Verificación

- ✅ `tsc --noEmit` exit=0
- ✅ Visual: tenant `buleje` muestra badge purple "Admin" + panel verde
- ✅ Otros tenants (Pizza Pucallpa, Pòlleria) mantienen sus alertas correctas

## 6. Implementación

Commit: `c28b4524` — `feat(superadmin): isAdminTenant flag — buleje y main no generan alertas falsas`

Archivos tocados:
- `components/superadmin/tenants/TenantCard.tsx`: helper + lógica + badge + alert
- Sin cambios en endpoints, schema o DB
