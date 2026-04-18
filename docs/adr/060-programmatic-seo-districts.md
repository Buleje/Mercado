# ADR-060: Programmatic SEO Hiperlocal — Dimensión Distrito

## Estado

🟢 **Aceptada** — Paginas, sitemap, JSON-LD, tests y dataset desplegados 2026-04-17.

## Fecha

2026-04-17

## Contexto

El Programmatic SEO de Buleje ya cubre 2 dimensiones:

| Nivel | Ruta | Combos | Target de busqueda |
|-------|------|--------|---------------------|
| Ciudad | `/zona/[ciudad]` | 15 | "software para bodegas Lima" |
| Ciudad × Categoria | `/zona/[ciudad]/[categoria]` | 15 × 6 = 90 | "abarrotes bodega Arequipa" |
| Ciudad × Producto | `/zona/[ciudad]/producto/[slug]` | 15 × N_productos | "arroz extra Pucallpa" |

La falencia es que **Google ranquea mejor por distrito que por ciudad** cuando la intencion de busqueda tiene componente local ("abarrotes cerca de mi", "delivery Yarinacocha", "bodega Los Olivos 24h"). El sitemap actual pierde tráfico de 3 tipos:

1. **Queries con distrito explícito** ("software para bodega en Callao", "ERP minimarket Wanchaq Cusco")
2. **Queries con delivery hiperlocal** ("delivery abarrotes Los Olivos", "fiado digital Yarinacocha")
3. **Queries Google My Business-style** que matchean mejor cuando el JSON-LD `areaServed` especifica `Place` con `GeoCoordinates` de un distrito concreto, no de la ciudad entera.

Los datos que ya tenemos para aprovechar esto:
- `zones.ts:39-184` — cada zona lista 3-7 `districts[]` como strings.
- `lib/geo-utils.ts` — haversine y coords por defecto Pucallpa ya listos.
- `lib/seo/json-ld.ts` — generators de SoftwareApplication, FAQ, Breadcrumbs, ItemList ya funcionando.

Sin este ADR, las landing de distrito quedan atadas a `/zona/lima#los-olivos` como ancla — Google no indexa fragmentos y la URL semántica se pierde.

## Opciones consideradas

### Opción A — Ampliar `zones.ts` con coords distritales y reusar rutas existentes

- ✅ Cero archivos nuevos
- ❌ El componente `ZoneContent` tendria que cambiar de forma condicional segun hash — rompe cache tags y Suspense
- ❌ `generateMetadata` no ve hashes, el SEO se pierde igual

### Opción B — Crear dataset `data/districts.ts` + 2 rutas nuevas `/zona/[ciudad]/distrito/[distrito]` y `/zona/[ciudad]/distrito/[distrito]/[categoria]`

- ✅ ~60 districts × (1 landing + 6 categorias) = **~420 paginas nuevas** indexables
- ✅ Cada pagina tiene su propia URL canonica, `generateMetadata`, JSON-LD y breadcrumb
- ✅ Reusa `ProductsDB.getAll` ya cacheado por `cacheTag("zone-cat-products:...")` — ningun trabajo extra en DB
- ✅ Respeta zona de cache existente (`cacheLife` + `cacheTag` por tenant/categoria)
- ✅ Cero zona peligrosa (no toca schema.prisma, checkout, auth, proxy)
- ❌ Agrega 5 archivos nuevos + 2 tests + actualiza sitemap
- ❌ Navegación distrital requiere un interlink desde `/zona/[ciudad]` (hecho en este commit)

### Opción C — Usar `[[...seo]]` catch-all y generar con 1 archivo

- ✅ 1 sola ruta handler
- ❌ `generateStaticParams` se vuelve opaco
- ❌ Difícil de debuggear cuando hay 3 niveles de override (ciudad vs distrito vs producto)
- ❌ Peor DX cuando en el futuro queramos customizar un distrito específico (ej. Yarinacocha tiene turismo, Iquitos tiene transporte fluvial)

## Decisión

**Elegimos la Opción B** — dataset dedicado + 2 rutas nuevas con `generateStaticParams` explícito.

### Archivos entregados

| Archivo | Rol | LOC |
|---------|-----|-----|
| `data/districts.ts` | Dataset de ~60 distritos con `{slug, name, cityslug, geo, description}` + helpers `findDistrict`, `getDistrictsForCity`, `getZoneForDistrict`, `getDistrictFAQs` | ~450 |
| `lib/seo/json-ld.ts` | +3 helpers: `generateDistrictLandingLD`, `generateDistrictCategoryLD`, `districtBreadcrumbs` | +120 |
| `app/(store)/zona/[ciudad]/distrito/[distrito]/page.tsx` | Landing de distrito — H1, hero, grid categorias, FAQ, cross-links | ~280 |
| `app/(store)/zona/[ciudad]/distrito/[distrito]/[categoria]/page.tsx` | Distrito × Categoria — H1, grid productos, JSON-LD hiperlocal, cross-links | ~300 |
| `app/(store)/zona/[ciudad]/page.tsx` | Interlink nuevo → `/distrito/...` strip | +25 |
| `app/sitemap.ts` | `districtPages[]` extendido | +25 |
| `__tests__/seo/districts-dataset.test.ts` | Unit tests integridad dataset | ~150 |
| `__tests__/seo/district-json-ld.test.ts` | Unit tests helpers JSON-LD | ~170 |
| `docs/adr/060-programmatic-seo-districts.md` | Este ADR | — |

### Cobertura inicial

| Ciudad | Distritos declarados | Distritos cubiertos por este ADR |
|--------|----------------------|-----------------------------------|
| Pucallpa | 4 | 4 (Calleria, Manantay, Yarinacocha, Campo Verde) |
| Iquitos | 4 | 4 |
| Tarapoto | 3 | 3 |
| Lima | 7 | 7 (SJL, Comas, VES, SMP, Los Olivos, Ate, Callao) |
| Arequipa | 5 | 5 |
| Trujillo | 4 | 4 |
| Chiclayo | 3 | 3 |
| Piura | 4 | 4 |
| Tacna | 4 | 4 |
| Tumbes | 4 | 4 |
| Cusco | 5 | 5 |
| Huancayo | 3 | 3 |
| Puno | 4 | 4 |
| Ayacucho | 4 | 4 |
| Huancavelica | 3 | 3 |
| **Total** | **61** | **61** |

Con 6 categorias reales: **61 × 1 + 61 × 6 = 61 + 366 = 427 paginas nuevas indexables**.

### Constraints aplicados

1. **Multi-tenant safe** — `cacheTag("district-cat-products:${tenantId}:${categoryId}")` aisla por tenant. `headers().get("x-tenant-id")` igual que las rutas `/zona/[ciudad]/[categoria]` existentes.
2. **Next 16 cache components** — `"use cache"` + `cacheLife({ revalidate: 300, stale: 60, expire: 900 })` identico al patron ya aprobado en zone pages (ADR-019).
3. **Sin zona peligrosa** — no toca `checkout`, `orders.db`, `role-permissions`, `proxy`, `schema.prisma`, `cart-context`.
4. **Reuso de helpers** — `districtBreadcrumbs` extiende `zoneBreadcrumbs`, `generateDistrictCategoryLD` extiende `generateItemListLD` con `areaServed` más preciso.
5. **Slugs únicos cross-cities** — `san-juan-bautista-iquitos` vs `san-juan-bautista-ayacucho`, `la-victoria-chiclayo` — para no colisionar si en el futuro un distrito pasa a otra ciudad.

### KPIs esperables (30-90 días)

| Métrica | Baseline 2026-04-17 | Meta 30d | Meta 90d |
|---------|----------------------|----------|----------|
| Paginas indexadas por Google (`site:buleje.pe`) | ~500 | 900 | 1,200 |
| Clicks organicos/mes desde Search Console | TBD | +30% | +80% |
| Paginas con `areaServed: Place` JSON-LD | 0 | 427 | 427 |
| Top-10 ranking por query "bodega [distrito]" | 0 | 3-5 | 8-12 |
| CTR promedio desde SERP local | TBD | +15% | +25% |

## Consecuencias

### Positivas

- **Multiplicador SEO real**: 427 landings nuevas con contenido único, breadcrumbs jerárquicos y JSON-LD hiperlocal — la "cross-cutting lever" #5 del ROADMAP-24-WEEKS (programmatic SEO foundation) gana escala.
- **Signal de AreaServed preciso**: Google puede asociar Buleje con queries distritales que hasta ahora caían al nivel ciudad o ni siquiera indexaban.
- **Interlinking denso**: cada landing distrital apunta a los otros distritos de su ciudad + al padre ciudad + al hub marketplace, generando estructura de topic cluster robusta.
- **Reusa infra existente**: cache keys, JSON-LD helpers, breadcrumb schema, estructura de Suspense — todo ya probado en zone pages.
- **Base para Ola 2 local**: cuando activemos delivery network por distrito (Sprint 7 ROADMAP), cada landing ya tiene el JSON-LD para "delivery en [distrito]" pre-desplegado.

### Negativas

- **427 paginas adicionales en build** — `generateStaticParams` las pre-renderiza. Impacto marginal (< 10s extra según el patron de `/zona/[ciudad]/[categoria]` ya medido).
- **Dataset distritos requiere mantenimiento manual** — si se agregan nuevas ciudades hay que ampliar `data/districts.ts`. Mitigación: tests unitarios forzan que cada distrito apunte a una zona existente; drift cae en rojo.
- **Contenido descriptivo puede percibirse repetitivo** si Google detecta overlap >> con `/zona/[ciudad]/[categoria]`. Mitigación: cada `district.description` es única (80+ chars) + H1 incluye el nombre del distrito explícito + FAQ distrital per-distrito.

### Riesgos

1. **Thin content penalty**. Si Google considera que `Distrito × Categoria` no aporta valor sobre `Ciudad × Categoria`, podría des-indexar. Mitigación: `generateDistrictLandingLD` con `areaServed.geo` distrital + descripción única + FAQ-per-distrito + interlinking denso.
2. **Duplicate content por slug colision**. `san-juan-bautista` aparece en Iquitos y Ayacucho — resuelto con sufijo explícito (`san-juan-bautista-iquitos` / `san-juan-bautista-ayacucho`). Test unitario lo enforza.
3. **Sitemap > 50,000 URLs** (limite Google). Actual total post-deploy ≈ 900-1,200. Lejos del tope. Si algún día el tenant supera 5,000 productos × 15 ciudades se cortaría a `xml-sitemap-split` (fuera de scope).
4. **Desalineación de coords distritales**. Si una bodega real cambia el radio de delivery, el `areaServed.geo` hardcoded podría sesgar. Mitigación: coords son aproximadas al centro del distrito; el delivery real se valida por `haversineKm` en checkout (no por JSON-LD).

## Referencias

- `docs/ROADMAP-24-WEEKS.md` — Sprint 2 item #9 "Programmatic SEO por zona × producto"
- `docs/ROADMAP-24-WEEKS.md` — "cross-cutting lever" #5 "Programmatic SEO foundation"
- `docs/VISION_2027.md` — KPI "Paginas indexadas" y "Clicks organicos/mes"
- `docs/adr/019-next-16-cache-components.md` — patron `use cache` + `cacheLife` + `cacheTag`
- `app/(store)/zona/[ciudad]/page.tsx` — patron base ciudad → reusado en distrito
- `app/(store)/zona/[ciudad]/[categoria]/page.tsx` — patron base ciudad × cat → reusado en distrito × cat
- `lib/geo-utils.ts` — haversine y coords Pucallpa
- `CLAUDE.md` reglas 4 (Next 16 cache), 6 (totales backend), 7 (fire-and-forget ausente aqui), 12 (ADR nuevo)
