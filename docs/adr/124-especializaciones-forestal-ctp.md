# ADR-124 — Especializaciones por Tenant + Módulo Forestal CTP

**Fecha:** 2026-05-28
**Estado:** Propuesto
**Decisión:** Brandon
**Contexto regulatorio:** SERFOR (Servicio Nacional Forestal y de Fauna Silvestre — Perú)

---

## Contexto

Buleje arrancó como SaaS para bodegas/abarrotes pero el modelo de negocio
multi-tenant + `Tenant.industry` ya soporta nichos verticales (`madereria`,
`farmacia`, `panaderia`, etc.). El cliente quiere ofrecer **módulos
especializados habilitables por tenant** desde superadmin — features
que no aplican a todos los tenants pero son críticos para verticales
específicos.

**Primer caso de uso:** Industria forestal. Un CTP (Centro de Transformación
Primaria) debe llevar el **LOE-CTP** (Libro de Operaciones Electrónico de
Centros de Transformación Primaria) por mandato SERFOR. Buleje ofrecerá
un libro paralelo interno (no oficial, no integra con SNIFFS aún) para
gestión operativa del flujo de madera entrante.

### Normativa SERFOR referenciada

| Norma | Contenido |
|---|---|
| RDE N° D000009-2023-MIDAGRI-SERFOR-DE | Oficializa LOE-CTP (sniffs.serfor.gob.pe) |
| RDE N° D000014-2024-MIDAGRI-SERFOR-DE | Formato GTF (Guía de Transporte Forestal) + anexos |
| Decreto Legislativo 1283 (Ley Forestal) | Marco legal trazabilidad |

---

## Decisión

### A. Mecanismo de especializaciones

**Reutilizamos `TenantFeatureFlag`** con namespacing en el `flagKey`. NO
introducimos un nuevo modelo `Specialization` — el feature flag ya
provee toggle por tenant con índice eficiente.

#### Convención de flagKey

```
spec:<vertical>:<modulo>
```

Ejemplos:
- `spec:forestal:ctp-libro` — Libro de Operaciones CTP
- `spec:forestal:gtf-emisor` — Emisor de Guías Transporte Forestal (futuro)
- `spec:salud:recetas-medicas` — Módulo recetas farmacia (futuro)
- `spec:textil:cuero` — Subnicho cuero (futuro)

#### Helper

```ts
// lib/specializations.ts
export async function isSpecializationEnabled(
  tenantId: string,
  spec: SpecializationKey,
): Promise<boolean> {
  const flag = await TenantFeatureFlagDB.get(tenantId, spec);
  return flag?.enabled === true;
}
```

### B. Modelo `WoodEntry` (Ingreso de madera al CTP)

Diseñado según campos requeridos por LOE-CTP SERFOR + extras operativos:

| Campo | Razón |
|---|---|
| `entryDate` | Fecha de ingreso físico al CTP |
| `gtfNumber` + `gtfDate` + `gtfSeries` | Guía de Transporte Forestal — obligatoria SERFOR |
| `providerName` + `providerDocument` + `providerDocumentType` | Titular habilitante (concesionario) |
| `originType` + `originCode` + `originRegion` + `originDistrict` | Trazabilidad de origen (concesión, predio, comunidad nativa) |
| `speciesCommonName` + `speciesScientificName` + `speciesCites` | Especie (CITES = protegida internacional) |
| `productType` | rolliza / aserrada / tablones / listones / durmientes / pulgada / carbón / leña |
| `volumeM3` (Decimal 12,4) | Volumen — **4 decimales** por precisión forestal |
| `pieces` + `avgLengthM` + `avgDiameterCm` + `humidityPct` | Datos físicos del lote |
| `status` (pendiente/validado/rechazado/procesado/anulado) | Flujo de validación |
| `validatedBy` + `validatedAt` | Quién firmó el ingreso |
| `photos` (Json array) | Evidencia visual |

**Tipos enum dedicados:**
- `WoodEntryStatus` — 5 estados con flujo claro
- `WoodOriginType` — 6 tipos de origen
- `WoodProductType` — 9 tipos de producto
- `DocumentType` — RUC/DNI/CE/PASAPORTE (cross-vertical, reusable)

**Índices:**
- `(tenantId, entryDate desc)` — listado por tenant ordenado
- `(tenantId, status)` — filtro por estado
- `(tenantId, gtfNumber)` — búsqueda por GTF
- `(tenantId, speciesCommonName)` — agrupar por especie
- `(deletedAt)` — soft-delete cleanup

### C. Catálogo de especies — sin tabla DB (v1)

Para evitar 1 migración extra, las especies legales Perú viven como
**data file estático** en `data/forestry-species.ts`. Si el catálogo
crece (>200 especies) o necesita CRUD por tenant, migramos a tabla.

### D. Módulo admin

- **ModuleId:** `ctp-libro-operaciones` (agregar a `lib/module-permissions.ts`)
- **Condicional:** solo se renderiza si `isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")`
- **Path:** `/admin?tab=ctp-libro-operaciones`
- **Componente:** `components/admin/forestal/CTPLibroOperaciones.tsx`

### E. Superadmin habilitador

- **Path:** `/superadmin/specializations`
- **UI:** Lista de tenants × matriz de especializaciones disponibles. Toggle 1-click.
- **API:** `PATCH /api/superadmin/specializations` `{ tenantId, specKey, enabled }`
- **Audit:** cada toggle se loguea en `ActivityLog` con `actor=superadminId`.

---

## Plan de implementación (fases)

### Fase 1 (este commit) — Foundation

- [x] Schema: `WoodEntry` + 4 enums (`WoodEntryStatus`, `WoodOriginType`, `WoodProductType`, `DocumentType`)
- [x] ADR-124 (este doc)
- [ ] `lib/db/wood-entries.db.ts` — DB class con CRUD + filtros + agregados
- [ ] `lib/specializations.ts` — helper `isSpecializationEnabled` + registry de specs
- [ ] `app/api/admin/forestal/wood-entries/route.ts` — endpoints GET (list) + POST (create)
- [ ] Migration SQL (NO aplicada; Brandon decide cuándo)

### Fase 2 (próximo commit) — UI

- [ ] `components/admin/forestal/CTPLibroOperaciones.tsx` — lista + form
- [ ] `components/admin/forestal/WoodEntryForm.tsx` — formulario crear/editar
- [ ] Registro en `app/admin/page.tsx` (condicional por feature flag)
- [ ] `lib/module-permissions.ts` — agregar ModuleId

### Fase 3 — Superadmin

- [ ] `app/superadmin/specializations/page.tsx`
- [ ] `app/api/superadmin/specializations/route.ts`
- [ ] Audit log de habilitación/deshabilitación

### Fase 4 — Reportes + Export

- [ ] PDF resumen mensual (formato SERFOR-compatible)
- [ ] Export CSV/Excel para presentar al regulador
- [ ] Dashboard: volumen por especie, evolución temporal, alertas CITES

### Fase 5 — Integraciones (futuro lejano)

- [ ] Sync con SNIFFS oficial vía API SERFOR (si liberan API)
- [ ] Validación cruzada GTF con consulta SUNAT/RENIEC del titular
- [ ] Geolocalización del origen (mapa de procedencia)

---

## Tradeoffs

| Decisión | Pro | Con |
|---|---|---|
| TenantFeatureFlag (no tabla Specialization) | -1 migración, simple | flagKey strings — sin validación schema |
| Especies como data file (v1) | -1 migración, fácil edit | No CRUD desde admin; catálogo fijo |
| Status enum vs string | Type-safe en TS + DB | Migration breaking si agregamos status |
| Volumen Decimal(12,4) | Precisión forestal real | Más memoria que float |
| `gtfNumber` indexado sin unique | Permite múltiples entries por GTF (split species) | Requiere validación app-level si querés unicidad |

---

## Riesgos

1. **Migración breaking:** agregar enums nuevos a Postgres requiere `prisma migrate deploy` con DIRECT_URL. Workaround: aplicar SQL directo vía Supabase MCP (patrón ya usado en project_session_2026-05-02).

2. **CITES compliance:** marcar `speciesCites=true` y no validarlo en runtime es riesgo legal. v2 debe bloquear ingresos de especies CITES sin permiso oficial adjunto.

3. **Reuso para otros verticales:** `DocumentType` enum es cross-vertical. Si Pharma agrega `RNM` (Registro Nacional Médico), agregar al enum sin breaking change.

---

## Referencias

- [SERFOR LOE-CTP V2.6.1](https://sniffs.serfor.gob.pe/control/libroctp/)
- [Guía Práctica LOE-CTP (PDF SERFOR)](https://repositorio.serfor.gob.pe/bitstream/SERFOR/911/3/SERFOR%202021%20Guia%20implementacion%20libro%20operaciones.pdf)
- [Formato GTF aprobado RDE 014-2024](https://vlex.com.pe/vid/resolucion-n-d000014-2024-974843830)
- [Decreto Legislativo 1283 (Ley Forestal PE)](https://www.serfor.gob.pe/portal/transparencia/normatividad)

---

## Trazabilidad de cambios

| Commit | Cambio |
|---|---|
| _pendiente_ | Schema + DB class + endpoint (Fase 1) |
| _pendiente_ | UI módulo admin (Fase 2) |
| _pendiente_ | Superadmin habilitador (Fase 3) |
