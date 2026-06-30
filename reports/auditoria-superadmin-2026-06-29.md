# Auditoría SUPERADMIN — verificada adversarialmente · 2026-06-29

> Workflow `audit-verificado`: 1 finder por dimensión + 1 refutador por hallazgo. Solo llega lo que sobrevivió al refutador con evidencia directa.

**Superadmin:** 22 confirmados ({"high":6,"medium":12,"low":4}) · 8 falsos positivos descartados.

## ✅ Progreso de fixes (sesión 2026-06-29 · 5 commits)

| Commit | Hallazgos cerrados |
|---|---|
| `cf099504` | #3/#4 `use cache` ActivityLog full-scans · #9 audit-log SUNAT · #10 slug→CUID |
| `9f1d5216` | #16/#19 guard `requirePlatformAPI` · #13 `_count` orders · #11 rate-limit+truncated · #15 MRR sobre todos los tenants |
| `3ee319fa` | #8 cache demand · #14 cache stores/health (getOrSet) |
| `00a7f399` | #5 cache executive (getOrSet, key por rango) |
| (verif.) | #6 "lint no cubre superadmin" → REFUTADO (ya lo cubre; los 50 colores existen porque es warn-only) |
| `d4f31aff` (storefront) | 3 XSS: storeTheme colors, customFontUrl, navLinks javascript: |

**Pendiente (priorizado):**
1. #1 churn N+1 + #2 growth `date_trunc` + #12 analytics — rewrites de query (necesitan before/after de datos).
2. #6 ~1369 colores hardcodeados + #17 `text-[10px]`×83 — migración DS multi-archivo (typography-enforcer / dark-mode-auditor).
3. #7 CSRF en mutaciones superadmin · #18 paginar tenants · #20 executive omite suspendidos · #22 broadcast cap 500 silencioso.


## HIGH (6)
### N+1: churn dashboard hace 1 query findFirst por cada tenant y pagina DESPUÉS de cargar todo
- **Dónde:** `app/api/superadmin/churn/route.ts:67`
- **Fix:** El limit/offset se aplica recién en memoria (linea 100) tras disparar N findFirst. Reemplazar el groupBy+Promise.all por UNA query: `prisma.tenantHealthScore.findMany({ distinct: ['tenantId'], orderBy: [{tenantId:'asc'},{calculatedAt:'desc'}], select:{...} })` o un raw con DISTINCT ON (tenantId) ... ORDER BY tenantId, calculatedAt DESC, y paginar en la DB (take/skip) en vez de cargar todos los scores de todos los tenants por request.
- **Verificación (refutador):** Confirmado en app/api/superadmin/churn/route.ts. Líneas 48-51: groupBy de tenantHealthScore por tenantId SIN take/limit/cursor (carga todos los tenants). Líneas 67-87: Promise.all(latestByTenant.map(g => prisma.tenantHealthScore.findFirst(...))) = exactamente 1 findFirst por tenant (N+1; Promise.all paraleliza pero siguen siendo N queries). Líneas 99-100: filteredScores.sort(...).slice(offset, off

### groupBy por createdAt (timestamp exacto) no agrega nada: devuelve ~1 fila por orden de 6 meses cross-tenant
- **Dónde:** `app/api/superadmin/tenants/growth/route.ts:35`
- **Fix:** Agrupar por `createdAt` (DateTime con precisión de ms) produce un grupo por instante único ≈ un grupo por orden: el GROUP BY no reduce nada y transfiere el dataset completo de 6 meses de TODOS los tenants a Node, que luego rebucketiza por mes en JS (lineas 82-94). Agrupar por mes en la DB con raw SQL `date_trunc('month', "createdAt")` (o un groupBy con columna mes pre-derivada). Sin server-cache ni take, se recomputa en cada request.
- **Verificación (refutador):** Confirmado con evidencia directa, no pude refutarlo. schema.prisma:489 define `createdAt DateTime @default(now())` = timestamp(3) de precisión milisegundos, sin `@db.Date` ni truncación. Prisma groupBy agrupa por el valor EXACTO de la columna (no trunca DateTime), así que `by: ["tenantId","createdAt"]` produce un grupo por cada timestamp distinto ≈ 1 fila por orden; `_sum.total` es el total de esa

### Full-table scan de ActivityLog (la tabla que más crece) sin WHERE ni LIMIT en cohortes
- **Dónde:** `lib/db/cohorts.db.ts:27`
- **Fix:** DISTINCT sobre toda la tabla ActivityLog sin WHERE ni LIMIT escanea cada fila histórica del log de actividad (la tabla de mayor crecimiento del sistema) y trae todos los pares (tenant, mes) a memoria en cada carga del dashboard (no-store, sin cache). Acotar con un WHERE de ventana temporal (p.ej. últimos 12-18 meses, que es maxMonths=12) y/o materializar la agregación. El endpoint no tiene cache.
- **Verificación (refutador):** Verificado directo en lib/db/cohorts.db.ts:27-29: `SELECT DISTINCT "tenantId", to_char("createdAt",'YYYY-MM') AS ym FROM "ActivityLog"` sin WHERE ni LIMIT, tal cual cita el auditor. No hay capa que lo mitigue: (1) es `prisma.$queryRawUnsafe` directo — el Proxy de lib/prisma.ts solo envuelve delegates de modelo (findMany/count) para N+1, el raw SQL pasa sin inyectar LIMIT; (2) getCohortRetention NO

### Full-table scan de ActivityLog con findMany distinct sin where/limit en feature-adoption
- **Dónde:** `lib/db/feature-adoption.db.ts:48`
- **Fix:** Igual que cohorts: distinct sobre TODA la ActivityLog sin filtro temporal ni límite. Prisma materializa todos los pares (tenantId, entity) jamás registrados en memoria de Node. Escala con el tamaño total del log. Acotar a tenants activos (`where: { tenantId: { in: activeIds }, createdAt: { gte: ventana } }`) o reemplazar por groupBy agregado en DB. Endpoint sin cache.
- **Verificación (refutador):** Confirmado por lectura directa. lib/db/feature-adoption.db.ts:48 es exactamente prisma.activityLog.findMany({ distinct: ["tenantId","entity"], select:{tenantId:true,entity:true} }) — sin where, sin take. ActivityLog está documentada por el propio repo como "la tabla más grande del sistema" (app/api/cron/activity-log-purge/route.ts:9). El schema (schema.prisma:1284-1288) NO tiene índice compuesto (

### executive analytics: groupBy de top-customers sin filtro de fecha (scan all-time) + 2 findMany de órdenes a memoria, sin server-cache
- **Dónde:** `app/api/superadmin/analytics/executive/route.ts:83`
- **Fix:** El groupBy de `ordersByCustomer` no tiene cota temporal: agrega toda la historia de orders cross-tenant en cada request. Además dos findMany (`ordersLast30`, `ordersForHeatmap`) traen todas las filas del rango (from/to son params del usuario, sin tope) a memoria. La ruta solo tiene Cache-Control private max-age=120 (cache de browser por usuario), sin "use cache" server-side: en cada miss recomputa todo. Acotar el groupBy de top-customers con ventana de fecha, clamp del rango from/to, y agregar "use cache"/cacheLife como hacen analytics/route.ts y tenants/route.ts.
- **Verificación (refutador):** Verificado leyendo app/api/superadmin/analytics/executive/route.ts. (1) groupBy líneas 83-90: where solo {status not cancelado, customerPhone not null}, SIN createdAt → scan all-time real; take:10 con orderBy _sum desc NO acota (agrega toda la tabla antes de ordenar); @@index([customerPhone]) no evita el scan de agregación. (2) findMany líneas 97 y 132 cargan órdenes a memoria (heatmap/daily-activ

### Colores de paleta Tailwind hardcodeados de forma masiva (1369) en el panel superadmin; varios rompen dark mode
- **Dónde:** `/home/usuario/proyectos/Mercado/components/superadmin/TenantMonitorPanel.tsx:74`
- **Fix:** Migrar a tokens DS: bg-gray-100->bg-[var(--surface-sunken)], text-gray-400->text-[var(--text-tertiary)], teal/emerald->--accent / --data-success. Correr lint-design-tokens.ts sobre components/superadmin (hoy el glob no lo cubre).
- **Verificación (refutador):** CONFIRMADO con evidencia directa. (1) TenantMonitorPanel.tsx:74/75/78 son literalmente `bg-gray-100` sin variante dark:, y el archivo tiene 0 usos de `dark:` (grep -c = 0). (2) El dark mode es real y activo en superadmin: app/layout.tsx:364 envuelve TODA la app en <ThemeProvider> de @/contexts/theme-context, y 81 archivos de superadmin usan `dark:`. (3) Prueba contundente: el propio skeleton del s

## MEDIUM (12)
### CSRF global exime TODO /api/superadmin/* y varias mutaciones no validan CSRF inline
- **Dónde:** `lib/csrf.ts:104`
- **Fix:** Agregar `if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();` al inicio de cada handler de mutación superadmin (prioridad: totp/enroll, totp/verify, chat/broadcast).
- **Verificación (refutador):** Verificado directo en código, todos los hechos confirmados, no refutable. (1) lib/csrf.ts:104-106 exime literalmente TODO /api/superadmin/*: `if (pathname.startsWith("/api/superadmin/")) return true;`, corrido en proxy.ts:78 para toda mutación. (2) ensureCsrfCookie corre solo en la rama default (proxy.ts:119) tras guardSuperadminApi/Pages retornar early (proxy.ts:97-102). (3) El CSRF superadmin es

### Lecturas cross-tenant sin paginar cargadas a memoria + agregación en JS (dashboards)
- **Dónde:** `app/api/superadmin/intelligence/demand/route.ts:67`
- **Fix:** Usar prisma.groupBy/aggregate (agregación DB-side, como ya hace el mismo executive/route.ts con orderItem.groupBy:118), o paginar/cap con take.
- **Verificación (refutador):** CONFIRMADO. demand/route.ts:67 y :80 son dos `prisma.orderItem.findMany` SIN `take`, sin filtro tenantId (endpoint superadmin `requirePlatformAPI`, cross-tenant intencional), que traen todos los OrderItem desde una fecha (select quantity + product.category) y se suman en JS en `aggregateByCategory` (líneas 96-106). Hay un 3er findMany no acotado (order, línea 203) y stockoutPrediction (134), todos

### Toggle de Modo SUNAT Oficial (impacto tributario) sin audit log persistente
- **Dónde:** `app/api/superadmin/tenants/[slug]/sunat-oficial/route.ts:74`
- **Fix:** Agregar `await logSuperadminAction("sunat_oficial_toggle", ..., session.username)` antes de retornar (awaited, como en impersonate).
- **Verificación (refutador):** CONFIRMADO. sunat-oficial/route.ts:74-80 solo hace TenantFeatureFlagDB.set + logger.info. (1) logger (lib/logger.ts) emite JSON a stdout/log-drains, NO escribe en DB — no es rastro forense persistente. (2) TenantFeatureFlagDB.set (lib/db/tenant-feature-flag.db.ts:24-30) es un upsert pelado, sin audit interno (el JSDoc "auditable" = tabla consultable, no que loguee writes). (3) No hay middleware qu

### PATCH de tenant escribe el ActivityLog con tenantId = slug en vez del CUID canónico, desfasando el audit trail
- **Dónde:** `app/api/superadmin/tenants/[slug]/route.ts:84`
- **Fix:** Usar `tenantId: tenant.id` (y `entityId: tenant.id`) en el activityLog.create, consistente con el resto de rutas superadmin.
- **Verificación (refutador):** CONFIRMADO real. En app/api/superadmin/tenants/[slug]/route.ts el handler hace prisma.tenant.update con select:{id:true} (línea 70, CUID en mano) pero escribe el ActivityLog con entityId: slug (81) y tenantId: slug (84). Tenant.id es CUID (@default(cuid()), schema:18) y slug es un string único distinto (schema:19) — difieren para todo tenant salvo el legacy "main". El CUID es el tenantId canónico 

### marketplace/orders: lectura masiva sin paginar (hasta 2000 pedidos con PII) + ALL tenants, sin rate-limit ni cache
- **Dónde:** `app/api/superadmin/marketplace/orders/route.ts:17`
- **Fix:** Paginar (cursor/offset + límite por página), agregar `applyRateLimit`, y cachear con `getOrSet`/`use cache` + cacheTag como en dashboard/widgets. Minimizar PII a lo estrictamente necesario para la vista.
- **Verificación (refutador):** VERIFICADO leyendo el archivo real y su hermano. app/api/superadmin/marketplace/orders/route.ts L23/L28-29: prisma.order.findMany con take:2000 seleccionando customerPhone + customerLocation (PII), sin paginación (no cursor/skip), y prisma.tenant.findMany sin where/take (L37-39). El handler completo (71 líneas) NO tiene getOrSet ni Cache-Control: responde NextResponse.json({orders}) directo. En co

### analytics: findMany de órdenes del periodo (rango from/to sin tope) + bucketización O(buckets×órdenes) en memoria
- **Dónde:** `app/api/superadmin/analytics/route.ts:150`
- **Fix:** from/to vienen del query string sin validar tope (linea 336-337); un rango amplio trae todas las órdenes a memoria, y el conteo por bucket hace `.filter()` sobre el array completo por cada bucket = O(buckets × órdenes). Reemplazar por un groupBy/raw con `date_trunc` por granularidad y dejar el conteo en la DB. Mitigado parcialmente por "use cache" (revalidate 300s) pero cada rango distinto genera una entrada de cache que computa el scan completo.
- **Verificación (refutador):** Verificado en /home/usuario/proyectos/Mercado/app/api/superadmin/analytics/route.ts. (1) El findMany de órdenes (líneas 150-153) NO tiene `take` ni cursor — el único `take: 50` del archivo es para activityLog (línea 66). (2) from/to llegan crudos de searchParams (líneas 336-337) sin Zod safeParse ni clamp de rango máximo; se pasan directo a new Date() (líneas 30-31). (3) La bucketización es efecti

### marketplace/orders carga 2000 órdenes con TODOS sus OrderItem solo para contarlos (debe usar _count)
- **Dónde:** `app/api/superadmin/marketplace/orders/route.ts:34`
- **Fix:** Selecciona `items: { select: { id } }` solo para hacer `o.items.length`: trae todas las filas de OrderItem de hasta 2000 órdenes a memoria. Usar `_count: { select: { items: true } }` y leer `o._count.items`. Además devuelve las 2000 órdenes en un solo payload sin cursor (paginar como hace orders/route.ts) y `tenant.findMany` trae todos los tenants sin límite.
- **Verificación (refutador):** Verificado leyendo app/api/superadmin/marketplace/orders/route.ts completo. Línea 34: `items: { select: { id: true } }` materializa TODAS las filas OrderItem de hasta 2000 órdenes. Línea 60: `itemCount: o.items.length` es el ÚNICO uso de `o.items` en todo el archivo (revisé las 71 líneas — no aparece en ningún otro lado). Es decir, las filas se cargan exclusivamente para contarlas, exactamente com

### stores/health escanea todos los tenants 'store' + settings + productos en cada request, sin paginar ni cachear
- **Dónde:** `app/api/superadmin/stores/health/route.ts:35`
- **Fix:** Carga TODOS los tenants tipo store (sin take/paginación) y arma ~17 checks por tenant en el payload de respuesta (items[]). Crece linealmente con la cantidad de negocios sin cota y se recomputa en cada request (no hay "use cache"). Agregar paginación (cursor/limit) y/o "use cache"+cacheLife; el score por tienda es agregable/cacheable, no necesita recalcularse para todas en cada GET.
- **Verificación (refutador):** Verificado contra app/api/superadmin/stores/health/route.ts. Claims confirmados: (1) tenant.findMany({where:{type:"store"},orderBy:{createdAt:"desc"}}) SIN take/skip/cursor — el unico take:1 es sobre la relacion anidada stores, no sobre la lista de tenants (L35-68); (2) settings.findMany({where:{tenantId:{in:tenantIds}}}) + product.groupBy sobre el set completo, ambos sin limite (L73-108); (3) SIN

### billing-summary trunca el cálculo de MRR/ARR a 1000 tenants (take:1000) — omite tenants del KPI financiero
- **Dónde:** `app/api/superadmin/billing-summary/route.ts:203`
- **Fix:** Para un KPI de revenue no truncar: usar agregación a nivel DB (groupBy plan/status) o paginar/streamear sin cap, o como mínimo subir el cap y emitir warning. La tabla detallada sí puede paginarse, pero el total de MRR/ARR/counts debe computarse sobre el universo completo.
- **Verificación (refutador):** CONFIRMADO con evidencia directa. billing-summary/route.ts:202 tiene `take: 1000` dentro del `prisma.tenant.findMany` (bloque 186-203) con `orderBy: { createdAt: "desc" }` (linea 201). Sobre ese array capado se calcula `mrrPEN = rows.reduce(...)` (linea 228), `arrPEN: mrrPEN * 12` (linea 302), counts y byPlan — `rows` se mapea 1:1 desde `tenants` (linea 205). Como ordena por createdAt desc, conser

### Ruta superadmin valida la cookie equivocada: requireAdmin(SESSION admin) en vez de PLATFORM_SESSION
- **Dónde:** `/home/usuario/proyectos/Mercado/app/api/superadmin/specializations/route.ts:33`
- **Fix:** Reemplazar requireAdmin(req,["superadmin"]) por requirePlatformAPI(req) de @/lib/superadmin-auth (mismo patron que el resto de rutas superadmin). Asi el actor del audit es el username de plataforma y el guard coincide con el middleware.
- **Verificación (refutador):** Confirmado por lectura directa. `requireAdmin` (lib/require-admin.ts:23) lee la cookie de SESION admin de tenant (`SESSION.COOKIE_NAME`), NO `PLATFORM_SESSION`. El login superadmin (app/api/superadmin/auth/route.ts:186,235) setea EXCLUSIVAMENTE `PLATFORM_SESSION.COOKIE_NAME` — nunca la cookie SESSION admin — por lo que un superadmin real solo tiene PLATFORM_SESSION y `requireAdmin` no halla token 

### Texto informativo a text-[10px]/[11px] literal (83 ocurrencias) por debajo del minimo legible
- **Dónde:** `/home/usuario/proyectos/Mercado/components/superadmin/tenants/TenantDetailModal.tsx:318`
- **Fix:** Subir texto informativo a text-xs/text-sm o usar el token `text-[length:var(--ts-2xs)]` solo donde sea eyebrow/decorativo. Reemplazar literales px por tokens --ts-*.
- **Verificación (refutador):** Confirmado con evidencia directa, no es falso positivo. Las líneas citadas existen exactas: TenantDetailModal.tsx:318 `text-[10px] text-[var(--text-tertiary)]">Sin teléfono registrado — copiá la clave...` (cuerpo informativo), :415 `text-[10px]>Estas acciones requieren tu código TOTP...` (cuerpo informativo), :432 timestamp; BeneficiosTab.tsx:217 `text-[10px] leading-tight ...>{b.desc}` (descripci

### Dashboard principal de tenants hace lectura masiva sin paginar (todos los tenants/stores/settings)
- **Dónde:** `/home/usuario/proyectos/Mercado/app/api/superadmin/tenants/route.ts:41`
- **Fix:** Paginar server-side (take/cursor) en la lista de tenants y stores, o virtualizar la tabla en el cliente; loguear el catch en vez de tragarlo.
- **Verificación (refutador):** Verificado leyendo /home/usuario/proyectos/Mercado/app/api/superadmin/tenants/route.ts completo + grep. CONFIRMADO, no refutable: las tres findMany (tenant L41, store L63, settings L103) no tienen take/skip/cursor; GET(req) nunca lee searchParams y getTenantsData() no recibe args -> sin paginación posible. No hay wrapper/middleware/rewrite que lo acote. El payload crece linealmente con N tenants y

## LOW (4)
### specializations usa guard de rol-tenant requireAdmin(["superadmin"]) en vez del guard de plataforma
- **Dónde:** `app/api/superadmin/specializations/route.ts:33`
- **Fix:** Reemplazar requireAdmin(req,["superadmin"]) por `const auth = await requirePlatformAPI(req); if (auth instanceof NextResponse) return auth;`.
- **Verificación (refutador):** VERIFICADO REAL. En app/api/superadmin/specializations/route.ts:33 y :77 se usa `requireAdmin(req, ["superadmin"])` importado de @/lib/require-admin. Ese guard lee la cookie SESSION de tenant (line 23: SESSION.COOKIE_NAME), NO PLATFORM_SESSION. require-admin.ts:60-71 rechaza role="superadmin" con 403 (los superadmin reales usan PLATFORM_SESSION), y require-admin.ts:79-82 hace que el management-tie

### analytics/executive omite tenants suspendidos (active:true) en cohorts y MRR-by-plan → diverge de /analytics
- **Dónde:** `app/api/superadmin/analytics/executive/route.ts:75`
- **Fix:** Para métricas históricas (cohorts por mes de alta, distribución) no filtrar por active; el estado active es ortogonal a 'cuándo se dio de alta'. Filtrar active solo donde se quiera 'activos hoy'. Alinear el criterio con /api/superadmin/analytics.
- **Verificación (refutador):** VERIFICADO en código real. executive/route.ts:74-77 `prisma.tenant.findMany({ where:{ active:true }, select:{id,createdAt,plan} })` alimenta `cohorts` (líneas 158-174: signups/payingNow por mes de alta), y :78-82 `groupBy({ by:["plan"], where:{ active:true } })` alimenta `mrrByPlan` (185-189, con campo `count`). En cambio analytics/route.ts:50-56 `findMany({ select:{...} })` NO tiene where → cuent

### marketplace/orders: take:2000 sin paginación — analítica cross-tenant truncada a los 2000 más recientes
- **Dónde:** `app/api/superadmin/marketplace/orders/route.ts:23`
- **Fix:** Agregar paginación por cursor (como app/api/superadmin/orders/route.ts ya hace con take:limit+1 + nextCursor) o mover los agregados a groupBy en DB en vez de traer filas crudas y reducir en el cliente.
- **Verificación (refutador):** Confirmado con evidencia directa. route.ts:23 tiene `take: 2000` hardcodeado (líneas 17-36), orderBy createdAt desc, sin skip/cursor/total y el handler no lee ningún query param. El comentario (línea 8) dice "Returns all marketplace orders". Los dos consumidores calculan agregados client-side sobre el array truncado: AnalyticsTab.tsx:127 (totalRevenue reduce, más tasas de completion/cancel/repeat 

### chat/broadcast: resolveSegment cap take:500 — un broadcast 'a todos' alcanza como máximo 500 tenants en silencio
- **Dónde:** `app/api/superadmin/chat/broadcast/route.ts:48`
- **Fix:** Para broadcast platform-wide, iterar/paginar todos los tenants del segmento (o batch por páginas) en vez de un take:500 fijo, o como mínimo devolver un flag 'truncated' + total real para que el operador sepa que no llegó a todos.
- **Verificación (refutador):** Confirmado con evidencia directa. broadcast/route.ts:48 `return prisma.tenant.findMany({ where, select, take: 500 })`: con status:'all' el `where` queda vacío (líneas 37-47 no añaden filtro), por lo que `take:500` recorta duro a 500 tenants. resolveSegment es la única fuente para preview (GET, línea 63 → `count: tenants.length`) y envío (POST, línea 81). No hay skip/cursor/paginación en la ruta (g

---
## Apéndice — falsos positivos descartados en superadmin (anti-inflado)
- ✗ chat/broadcast (mensaje masivo a hasta 500 tenants) sin rate limit ni CSRF inline — _Refutado. (1) RATE LIMIT SÍ existe: proxy.ts paso 4 corre `checkRateLimit(req)` sobre TODO `/api/*` en producción (NODE_ENV!=='development') ANTES del route han_
- ✗ Endpoint superadmin con guard roto: cualquier admin de tenant puede togglear feature flags de CUALQUIER tenant (escalada cross-tenant); el superadmin real ni siquiera puede usarlo — _REFUTADO. El auditor solo miró requireAdmin en el handler e ignoró el middleware de Next 16. proxy.ts (el middleware real; matcher en proxy.ts:139 cubre /api/su_
- ✗ chat/broadcast: mutación masiva de plataforma (mensaje a hasta 500 tenants) SIN CSRF ni rate-limit — _REFUTADO. El exploit central (confused-deputy CSRF disparable por página atacante) no es alcanzable. requirePlatformAPI (lib/superadmin-auth.ts:18-30) autentica_
- ✗ Extender trial desde la cola de rescate NO reactiva el tenant: trial válido pero tienda inactiva (estado inconsistente entre los dos caminos) — _Las dos diferencias de código son ciertas (rescue.db.ts:86 solo toca trialEndsAt; extend-trial/route.ts:76 hace active:true con days>0), pero el DAÑO afirmado e_
- ✗ dashboard/widgets: order.findMany({ distinct:['tenantId'] }) sin where ni take escanea la tabla Order completa (todos los tenants, todo el histórico) — _El código existe tal cual (route.ts:82-90: order.findMany distinct:['tenantId'] sin take, uno sin where), pero el hallazgo está refutado en su impacto por evide_
- ✗ specializations usa el guard equivocado (requireAdmin de sesión-tenant) en vez de requirePlatformAPI — _REFUTADO como vulnerabilidad. Cierto que app/api/superadmin/specializations/route.ts:33,77 usa requireAdmin(req,["superadmin"]) y que require-admin.ts:60-71 rec_
- ✗ compliance/data-export: savedLocation se consulta por customerPhone SIN tenantId (las queries hermanas sí scopean tenantId) — _Falso positivo. (1) SavedLocation NO tiene columna tenantId (schema.prisma:451-460) — el "fix" `where:{tenantId}` es un type error imposible; las queries herman_
- ✗ Filtros/búsquedas de los tabs superadmin no cumplen la regla bsm (h-12, border-2, rounded-2xl, text-base) — _REFUTADO (misapplication de regla). Los className citados existen (StoresTab:260 `rounded-xl border py-2 text-sm`; Repartidores:452 `h-9 border text-sm`; Suppor_

## Apéndice 2 — hallazgos storefront/checkout (1ª corrida off-target, igual verificados)
23 bugs reales fuera de superadmin (XSS storeTheme, doble-gasto puntos, lecturas de catálogo completo, typography). Ver tarea wp4khm30j.