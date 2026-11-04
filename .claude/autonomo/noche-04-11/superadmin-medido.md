# Superadmin medido — 04-11 (solo lectura, base de producción)

**Una línea:** casi todo el superadmin lee datos reales, pero el puntaje de salud de los negocios está roto: marca «crítico» (10/100) a Blas, el único cliente que usa el sistema de verdad (879 acciones en 30 días).

## Cifras medidas (sql-lectura, 04-11 ~02:40)
- 15 negocios, 10 activos. Con uso humano en 7 días: **2** (main 678 acciones, Blas 193). Los otros 8 activos tienen 0 (demo, luis, tienda-3, buleje, comprafacil, pizza-pucallpa, mi-pollo, musa).
- Planes: los 10 activos son 9 `enterprise` + 1 `pro`, todos con «prueba» hasta 2027-2099. **Nadie paga un plan real**; S/ 349 no aparece en `usage-tiers.ts` ni en `mrr-plataforma.ts`.
- Blas (30 d): 74 ingresos (`login_success`) de 2 usuarios · 0 pedidos · 2 ventas · 30 líneas CTP · 64 líneas LO-TH · 86 correcciones de asistencia · 247 vistas de cámara.
- Salud guardada el 04-11: **todos los activos «critical»** (10-13/100). `TenantHealthScore` = 1.649 filas (08-04 → 04-11).
- Señales de fuga abiertas: 14 (9 `login_drop` critical falsas, 4 `trial_expiring`, 1 `order_drop`); hoy no salen solo porque «WhatsApp/Email skip (sin config)».
- Ruido: `auto-backup` (entity `System`) escribe todos los días → comprafacil/buleje/demo cuentan como «activos» 4 meses sin un solo humano.
- Pedidos en toda la base: 111 (26 en 90 d) · `StockoutPrediction` 0 · `ClientErrorLog` 0 en 7 d.

## Por sección
| Sección | Estado | Evidencia |
|---|---|---|
| Salud del negocio (cron `churn-score`) | **ROTO** | `lib/churn/health-scorer.ts:108-111` cuenta `entity "auth"`, `action "login"`, `entityId = tenant.id` → 0 ingresos en todos (lo real es `action "login_success"` + `tenantId`: Blas 74) |
| ″ módulos usados | **ROTO** | `health-scorer.ts:143-147` filtra `entityId: tenant.id` → `featuresUsed` = 0 siempre |
| ″ actividad | **FALSO para aserradero** | `health-scorer.ts:126-136` solo cuenta `Order` → Blas 0 → «999 días sin pedido» |
| Rescate | falso (hereda) | `lib/db/rescue.db.ts:32` lee `TenantHealthScore` → todos en la cola |
| Lista de clientes · insignia de riesgo | falso (hereda) | `components/superadmin/tenants/useTenantsCarga.ts:36-44` |
| Ficha › Salud | falso (hereda) | `components/superadmin/tenants/TenantHealthTab.tsx:98` → `/api/superadmin/churn/[slug]` |
| Automatización «sin pedidos 30 d» | falso para aserradero | `lib/superadmin/automations.ts:60-67` solo `Order` (la de «sin ingreso 14 d», :69-75, sí usa `login_success`) |
| Adopción de funciones | real, **solo bodega** | `lib/db/feature-adoption.db.ts` FEATURES: 13 de bodega, 0 forestales; libro CTP, LO-TH, RRHH y cámaras no cuentan; además lee TODO el historial, sin ventana |
| Cohortes | **inflado** | `lib/db/cohorts.db.ts:36` `DISTINCT tenantId, mes` sin quitar `System` |
| Uso (tenants/usage) | real, solo bodega | `app/api/superadmin/tenants/usage/route.ts:30-33` pedidos/productos/admins, `prisma` directo (regla 1) |
| Crecimiento / onboarding | real, solo bodega | `tenants/growth/route.ts`, `tenants/onboarding/route.ts` → `prisma.order` |
| Inteligencia de demanda | real, vacío | `intelligence/demand/route.ts` → `Order` + `StockoutPrediction` (0 filas) |
| Facturación / MRR | real, sin clientes que paguen | `billing-summary/route.ts:142` suma `monthlyPEN`; todo cortesía → dinero, decide Brandon |
| Salud de vendedores | depende de la caché | `vendor-health/route.ts:65` `cacheStore.get`, la escribe `cron/vendor-identity-recheck:332`; sin Redis → «neverRun» (no verificado en producción) |
| Errores por negocio | real, vacío (bien) | `client-errors.db` · 0 en 7 d |
| Plataforma (health, slo) | real, honesto | `slo/page.tsx:8` «no configurado», sin datos inventados |
| Centro de control / panel | real | `command-center.db`; las coincidencias de «demo» son enlaces, no números falsos |

**Hueco más valioso** (lo que Gainsight/ChurnZero/Baremetrics le dan al dueño): un puntaje de salud confiable con «último uso real» y uso por módulo. Acá ya está construido (cron diario, cola de rescate, insignias, ficha), pero mide mal. Arreglarlo hace que funcionen 4 pantallas a la vez.

## Tramos para esta noche (sin cambiar el schema, sin tocar dinero)
### ⭐ Tramo 1 — Salud del negocio que mide lo real (1 endpoint/cron + su DB class)
- Nuevo `lib/db/salud-negocio.db.ts` → `SaludNegocioDB.senalesDeUso(tenantId, desde7, desde30)`, SQL con `$1 $2 $3`:
  ingresos = `ActivityLog.action='login_success'` por `tenantId`; acciones humanas = sin `entity='System'` ni `'[L29733]%'`;
  módulos = `entity` distintas en 30 d sin ruido; operaciones = `Order` + `Sale` + `ForestCtpEntry` + `WoodEntry`; fecha de la última operación.
- `lib/churn/health-scorer.ts` (`calculateHealthScore`, l. 104-160): usa esa clase en vez de los 3 conteos rotos.
- Prueba: `__tests__/churn-salud-senales.test.ts` (puro: con las cifras de Blas — 74 ingresos, 30 líneas CTP, ~12 módulos — no sale `critical`) + `__tests__/churn-alertas-siempre.test.ts` debe seguir verde.
- Verificación real: `scripts/dev-helpers/tsx-servidor.sh` con un .mts que llama `calculateHealthScore` de Blas y de `demo` **sin** `saveHealthScore`. Esperado: Blas ingresos30 ≈ 74 y deja de ser «critical»; demo sigue «critical» (0 humanos).
- Significado que cambia: `ordersLast7d/30d` y `daysSinceLastOrder` pasan a ser «operaciones» (las 1.649 filas viejas quedan con el sentido anterior). Cambiar 2 textos «pedido» → «operación» en `TenantHealthTab.tsx` y `RescueQueue.tsx` (opcional, mismo tramo).
### Tramo 2 — Adopción por módulo con los del aserradero (1 pantalla + su DB class)
- `lib/db/feature-adoption.db.ts`: sumar a FEATURES libro CTP (`forestctpentry`, `woodentry`, `forestloteaserrio`, `forestctpimport`), LO-TH (`forestlothentry`), guías (`forestgtf`, `forestguiaguardada`), RRHH (`asistencia`, `colaborador`), cámaras (`camara`), agenda (`agendaactividad`); ventana de 30 d; consejos («le falta X») solo de su rubro (aserradero = usa algún módulo forestal).
- `app/superadmin/feature-adoption/page.tsx`: columna «Rubro».
- Prueba: `__tests__/feature-adoption-normaliza.test.ts` (exportar el normalizador alias → clave) + `qa-capturas --superadmin --ruta /superadmin/feature-adoption`: Blas con ≥6 módulos y sin «le falta Cupones/Marketplace».
- Arreglo corto que puede ir junto: `cohorts.db.ts:36` agregar `WHERE entity <> 'System'` (1 línea, quita la retención inflada).

## Decide Brandon (schema, dinero o datos de producción)
1. **Precio real**: ningún cliente está en un plan pagado; S/ 349 no existe como plan → el MRR del superadmin mide cortesías. Definir el plan «Aserradero S/ 349» (dinero).
2. **Marcar los negocios de prueba** (demo, luis, tienda-3, buleje, comprafacil, pizza-pucallpa, mi-pollo, QA): no hay campo `esPrueba` en `Tenant` → schema, o apagarlos (`active=false` = escribir en producción).
3. **Avisos automáticos de fuga a clientes** (`intervention-engine.ts:101-126` WhatsApp, más correo): hoy no salen por falta de configuración; si se configura Twilio antes del Tramo 1, Blas recibiría 9 avisos «critical» falsos. ¿Se prenden recién después del arreglo?
4. Deuda: `prisma` directo en superadmin (`tenants/usage`, `health`, `growth`, `onboarding`, `intelligence/demand`, `health-scorer`) → mover a `lib/db/` cuando se toquen.
