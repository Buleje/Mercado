# Plantas forestales en el superadmin — contrato (17-10, arquitecto-plantas)

Pedido de Brandon: «en superadmin administrar los negocios que son aserradero (módulo forestal activado) para llevar el control, el pietaje, reportes de incoherencias de volumen, el volumen de cada planta, inspeccionar, cuántas trozas y aserrada tienen, y demás para la inspección de plantas y su control».

Tipos: `lib/superadmin/plantas-forestales/tipos.ts` · Zod: `lib/superadmin/plantas-forestales/schemas.ts` (YA ESCRITOS, no los cambies sin avisar al hilo principal).

## Qué es una planta
- Planta = tenant con `spec:forestal:ctp-libro` en `TenantFeatureFlag` (`lib/specializations.ts:40`, `:171`). Hoy 5: Blas real (`cmpxiv6p4000bohvzwl6bnfpv`), `main` y 3 copias `-op-…` de prueba.
- Operaciones hermanas por `grupoId` (ADR-395, `lib/forestal/ctp-operaciones.ts:1-50`).
- Plantas de prueba: lista en `PlatformSetting` clave `interno:plantas-forestales:prueba` (sin schema; Tenant no tiene flag de prueba).

## De dónde sale cada número (REUSAR, nunca recalcular)
| Métrica | Función | Costo Blas |
|---|---|---|
| Movimiento y saldo de rolliza | `ForestCtpDB.saldos` `lib/db/forest-ctp.db.ts:4297` | 1.023 ms |
| Existencia final por especie | `conciliacionPeriodo` `forest-ctp.db.ts:4706` | 677 ms |
| Aserrada disponible | `productosDisponibles` `forest-ctp.db.ts:4012`; sumar SOLO corridas en m³ como `lib/forestal/capacidad-de-planta.ts:573-574`. NO `totales.volumen` (`:4289`, mezcla unidades) ni `saldos().productos.stock` (el «62 vs 20») | 414 ms |
| Pies tablares | `PT_POR_M3=424` `lib/forestal/cubicacion.ts:85`; `ptDeLinea` `plata-de-guia.ts:346` (rolliza ≈ aserrable al 56 %). Siempre «≈» | 0 |
| Trozas libres / por recepcionar | `armarBalance` `capacidad-de-planta.ts` (fuentes `patio`, `porRecepcionar`) con `trozasDelPatio` `lib/db/wood-entries.db.ts:2331`. OJO `contarTrozasDelPatio` `:2623` cuenta también las consumidas | 1.085 ms |
| Trozas varadas | `contarTrozasVaradas` `wood-entries.db.ts:2588` | 147 ms |
| Lotes | `ForestLoteAserrioDB.list` `lib/db/forest-lote-aserrio.db.ts:327` | 963 ms |
| Guías sin ingresar | `ForestGtfDB.sinIngresarAlCtp` `lib/db/forest-gtf.db.ts:517` | 137 ms |
| Tendencia mensual | `tendenciasMensuales` `forest-ctp.db.ts:5756` | 136 ms |
| Rendimiento | `grafoTrazabilidad` `:5265` → `analizarRendimiento`/`marcarParciales`/`alertasRendimiento` `lib/forestal/ctp-radar-rendimiento.ts:109/139/206` | 126 ms |
| Incoherencias de saldo | `excepcionesDeSaldo` `lib/forestal/ctp-saldos-excepciones.ts:157` (pura); su entrada hoy se arma en el cliente `use-excepciones-de-saldos.ts:52-75` → extraer a `lib/forestal/ctp-saldos-excepciones-entrada.ts` (mismo comportamiento, el hook la llama) | 0 |
| Pendientes y plazos | `juntarDatosReporte` `lib/db/forest-reporte-diario-datos.db.ts:61` (`pendientesDelLibro` `:226`) | sin medir |
| Cuadre por guía | `cuadreDeIngreso`/`descuadra` `lib/forestal/cuadre-trozas.ts:36/62` | 0 |
| Cumplimiento | última foto de `ForestCtpComplianceSnapshot` (schema `:7020`; Blas 43 fotos, última 16-10); el score se calcula en `hooks/use-ctp-compliance.ts:202-233` | 1 lectura |

6 lecturas en paralelo = 937 ms por planta. Lista: 4 plantas a la vez + caché `getOrSet` 300 s por planta (patrón `specializations.ts:170`) + botón «Recalcular».
Blas hoy: rolliza −21,755 m³, 5 especies negativas, 78,671 m³ consumidos en 5 corridas sin guía atribuida.

## Decisiones
- Semáforo por EXISTENCIA FINAL, no por movimiento del período (falso rojo n.º 1). Corridas abiertas y consumo sin guía = amarillo, no rojo (falsos rojos 3 y 4; memoria `ctp-sobreconsumo-anatomia-y-falsos-rojos`).
- Una lectura que falla → `null` + `lecturas[fuente]="error"` + semáforo gris con el motivo. Nunca 0.
- Fuga entre tenants: el `tenantId` de la ruta se valida contra `PlantasForestalesDB.listar()`; si no es planta → 404.
- Test contra la base real: superadmin y DB class dan el mismo número (tolerancia 0,001 m³).

## Superadmin
- Auth: `requirePlatformAPI` `lib/superadmin-auth.ts:18` + `applyRateLimit` (+ `assertCsrf` en lo que escribe) como `app/api/superadmin/specializations/route.ts:36-39`.
- Auditar lecturas de ficha: `logSuperadminAction` `lib/audit/superadmin-audit.ts:49` (acción `planta.ver`).
- Candado: sólo para suplantar (`abrir-panel-tienda.ts:56`, 423). Leer no lo pide.
- «Abrir su libro»: `abrirPanelDeTienda` `components/superadmin/tenants/abrir-panel-tienda.ts:10` abre `/t/<slug>/admin` sin pestaña → agregar destino opcional (`?tab=…`). Sin verificar que el proxy conserve `?tab=`.
- Registrar pantallas: `ModuleTabs.tsx:112-184`, `SuperAdminShell.tsx:155-173`, `command-palette-pantallas.ts:72-92` (un test pone rojo una página sin registrar).
- NO copiar `tenants/[slug]/overview/route.ts` (usa `prisma.*` directo).

## Rutas
| Método y ruta | Entrada | Respuesta | Auditoría |
|---|---|---|---|
| GET `/api/superadmin/plantas` | `listaQuerySchema` | `PlantasListaResponse` | no |
| GET `/api/superadmin/plantas/[tenantId]` | `fichaQuerySchema` | `PlantaFichaResponse` | `planta.ver` |
| GET `/api/superadmin/plantas/incoherencias` | `incoherenciasQuerySchema` | `IncoherenciasResponse` | no |
| POST `/api/superadmin/plantas/refrescar` | `refrescarSchema` | `{ ok: true }` | no |
| GET/POST `/api/superadmin/plantas/[tenantId]/inspecciones` (fase 3) | `crearInspeccionSchema` | `InspeccionResumen[]` / `InspeccionPlanta` | `inspeccion.crear` |
| GET/PATCH `…/inspecciones/[id]` (fase 3) | `editarInspeccionSchema` | `InspeccionPlanta` | `inspeccion.editar/cerrar` |

## Fases y archivos (disjuntos)
- F1-2 backend: `lib/db/plantas-forestales.db.ts` (único método cross-tenant: `listar()`) · `lib/superadmin/plantas-forestales/{resumen.server,incoherencias,pies-tablares,semaforo}.ts` · `lib/forestal/ctp-saldos-excepciones-entrada.ts` + su uso en `components/admin/forestal/hooks/use-excepciones-de-saldos.ts` · `app/api/superadmin/plantas/{route,refrescar/route,incoherencias/route,[tenantId]/route}.ts` · `__tests__/superadmin/plantas-*.test.ts`.
- F1-2 frontend: `app/superadmin/plantas/{page,incoherencias/page,[tenantId]/page}.tsx` · `components/superadmin/plantas/*` · `components/superadmin/ModuleTabs.tsx` · `SuperAdminShell.tsx` · `command-palette-pantallas.ts` · `abrir-panel-tienda.ts`.
- F3 (inspección, modelo nuevo `ForestInspeccionPlanta`, SQL aditivo en `migracion-inspeccion.sql`): database → backend → frontend. Espera OK de Brandon.
