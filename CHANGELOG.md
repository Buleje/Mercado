# Changelog

All notable changes to Bodega San Martín will be automatically documented in this file.

See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Pre-Release History

Summary of major changes from conventional commits, grouped by type.

### Features

- **infra**: implementar 16 mejoras de infraestructura del checklist 2026 (`19caa45`)
- **api**: cursor pagination, cache y mejoras en marketplace products (`5c1f39d`)
- **openapi**: generación automática de spec OpenAPI desde Zod schemas (`8686667`)
- **queue**: sistema de colas con retry para Vercel serverless (`4d736cc`)
- **saas**: complete SaaS multi-tenant — routing, isolation, billing, superadmin (`c13d86f`)
- **superadmin**: GET /api/superadmin/stores endpoint para cross-tenant store listing (`07da410`)
- **superadmin**: modularizar SuperAdmin — 7 módulos route-based reemplazando monolito de 1875 líneas (`3e3b6fa`)
- **storefront**: preview responsive + QR tienda + layout full-width (`d931f4b`)
- **storefront**: personalización avanzada — 15 nuevos controles de estilo y contenido (`62bdf69`)
- **catalogo**: módulo Catálogo de Reabastecimiento con 243 productos peruanos (`972639c`)
- **demo**: demo permanente con datos completos + launcher directo (`7513ffd`)
- **demo**: seed completo con datos para todos los módulos (`8aea03e`)
- **demo**: demo en vivo Enterprise + botón lanzar demo (`911ecc7`)
- **saas**: 7 secciones interactivas para landing SaaS /saas (`b1aa7b8`)
- **saas**: panel target=_blank + SaaS demo interactiva con 5 módulos (`6aa5dad`)
- **saas**: panel de control central con 8 secciones y 30+ enlaces (`3292f58`)
- **saas**: checkout con branding + billing usage endpoint + plan limit helper (`ae6e396`)
- **fase-5**: Meta Pixel + JSON-LD dinámico + PWA manifest dinámico (`a0f2dae`)
- **fase-4**: tipografía dinámica + dark mode admin + plantillas de tienda (`efd923a`)
- **fase-3**: upload de imágenes a Supabase Storage + vista previa en vivo (`8ca315d`)
- **fase-2**: drag & drop con @dnd-kit + renderizado dinámico por orden (`08e5810`)
- **fase-1**: ThemeCustomizer guarda en DB + ThemeInjector global + metadata dinámica (`da0ff80`)

### Fixes

- **api**: corregir rutas marketplace — filtro Product, rol tienda_owner y observabilidad (`302dedf`)
- **tests**: corregir hoisting de NotFoundError y fixtures de mocks en tests de marketplace (`7a38c96`)
- **otel**: restaurar validateEnv en instrumentation.ts y corregir mocks de tests (`7ecbe65`)
- **ui**: resolver 15 errores de consola — CSP, empty img src, self-fetch perf, 401s (`85d3ea2`)
- **ui**: logo compacto inline + preview modal fullscreen (`fe1dd03`)
- **csp**: CSP frame-src self + reorganizar personalizar tienda en 8 tabs (`2d994e6`)
- **saas**: auto-login post-registro + notificaciones por tenant + onboarding flow (`a74c123`)
- **ui**: dropdown menus z-index above category strip + dark mode support (`d45d8f3`)
- **theme**: ThemeInjector only overrides backgrounds, never text color (`0b7f399`)
- **theme**: sections visibility + color overrides now apply to storefront (`7fbcb9c`)
- **theme**: storefront reads storeTheme for visibleSections + colors apply via CSS overrides (`3e72b23`)
- **prisma**: storeTheme saves correctly after prisma generate + .next cache clear (`500a6b1`)
- **tenant**: DELETE tenant uses raw SQL for reliable cascade + DB wiped clean (`a8c441c`)
- **tenant**: DELETE tenant with safe cascade + storeTheme direct upsert bypass (`5d1125a`)
- **tenant**: settings PUT uses x-tenant-id header + notifications filtered + delete tenant cascade (`69a11b7`)
- **tenant**: multi-tab tenant isolation + StoreCustomizer saves correctly (`8d8f319`)

### Refactoring

- **middleware**: consolidar rate limiter y fix CSP connect-src (`60f557c`)
- **config**: crear middleware.ts, consolidar CSP y capacitor (`0901f03`)
- **tenant**: propagate tenantId isolation across 500+ files (`7c9cf6e`)
- **catalogo**: carrito mejorado + totales + quick-add + margen (`130d4e1`)
- **saas**: eliminar 4 secciones duplicadas + mini-apps funcionales (`fbc73d4`)

### Tests

- **middleware**: agregar 24 tests y restringir CSP connect-src (`e5db3cb`)

### Chores

- agregar Storybook, release-please y docs de rolling releases (`b3d6e6d`)
- agregar dependencias storybook, openapi, otel y storybook scripts (`adb65e1`)
- update schema, config and skills for SaaS multi-tenant (`25f2161`)
- add .claude/launch.json for dev server configuration (`fd9db8f`)

### Docs

- mejorar PR template con DoD completo y guía Doppler (`dba5f84`)
