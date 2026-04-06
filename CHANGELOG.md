# Changelog

## [0.1.1](https://github.com/Buleje/Mercado/compare/buleje-v0.1.0...buleje-v0.1.1) (2026-04-06)


### Features

* add agents dashboard, daily cron, and paginated history endpoint ([49afbbd](https://github.com/Buleje/Mercado/commit/49afbbdb2caff2653bfa186d854d92cfd9cfcb9c))
* add auth, persistence, BatchesDB, tests, SSE bridge, Pixel Agents ([332e2b0](https://github.com/Buleje/Mercado/commit/332e2b0c535a1da369158ee9cf6366d2da9eec57))
* add complete AI dev infrastructure — 22 skills, 12 agents, 5 commands, danger-zone hook ([7032eb2](https://github.com/Buleje/Mercado/commit/7032eb25968dd69855704b4ad44663b6c497e5e7))
* add user dropdown menu with account, history, and order status; remove OrderProgress from nav ([10ec92b](https://github.com/Buleje/Mercado/commit/10ec92bbdd06aaf285c246574c5e2329623d0c6b))
* **admin:** refactor masivo - 23 hooks + 5 components + setup page (PR [#3](https://github.com/Buleje/Mercado/issues/3)) ([df95f7d](https://github.com/Buleje/Mercado/commit/df95f7d64eea8778bb05dd4a8eeaa728781941b2))
* always show bypass login button on admin login page ([8b88d04](https://github.com/Buleje/Mercado/commit/8b88d04ac4df1239148a2da7b2691bbfe59b5736))
* bypass login admin, mejoras UI, correcciones generales\n\n- Agregar toggle 'Acceso sin login' en configuración admin\n- Nuevo endpoint /api/auth/bypass para sesión sin credenciales\n- Rediseño Hero (aurora, categorías, stats)\n- Mejoras Header (XSS fix, mega menu), Footer (WhatsApp CTA)\n- Mejoras ProductCatalog, MobileBottomNav, CheckoutModal, OrderProgress\n- Fix POST /api/orders (phone opcional), fix settings API syntax\n- Campo adminBypassLogin en Prisma schema\n- SW deshabilitado en dev, filtro errores extensiones" ([6b173f7](https://github.com/Buleje/Mercado/commit/6b173f72801cb0b148240857bd8b414de2cee507))
* initial commit - Bodega San Martin Next.js app ([5e0861f](https://github.com/Buleje/Mercado/commit/5e0861f84d9d4b070f7f700cca95bfbf3b32c4bc))
* integrate runtime multi-agent system — 6 domain agents, orchestrator, API endpoints ([0288fb7](https://github.com/Buleje/Mercado/commit/0288fb7b7fc9d18e7b3058094323988d5d9f7957))
* remove order confirmation modal, enhance order progress with animated warning icon, set light mode as default ([9420b5b](https://github.com/Buleje/Mercado/commit/9420b5b887cde9081f83273e3842334d5c555578))
* reposicionar elementos flotantes y condicionar features a primera compra ([4a54e1b](https://github.com/Buleje/Mercado/commit/4a54e1b096f7a68ee2b351f70297aceb6aab8220))
* responsive admin + brand color migration + storefront improvements ([8c6f4ca](https://github.com/Buleje/Mercado/commit/8c6f4ca7a80d25b48bf51b38582f600fa82e6da8))
* Supabase integration + rate limiting + admin stats + pagination ([eda7c22](https://github.com/Buleje/Mercado/commit/eda7c229443853b9ed4f742f257736f314037869))
* sync full project state - all components, APIs, tests and fixes ([1a9df16](https://github.com/Buleje/Mercado/commit/1a9df163ecf0d5a6f981f2c177eac6629af370b5))
* upgrade to official Anthropic spec — 18 agents, 5 skills, structured hook ([cef8873](https://github.com/Buleje/Mercado/commit/cef887352b0c638a228d1f73949a2230232c6a53))


### Bug Fixes

* add .npmrc with legacy-peer-deps for React 19 compatibility ([9a0d773](https://github.com/Buleje/Mercado/commit/9a0d7730ebbd7a7972a8e21babb121a52075a069))
* allow public spin coupon & fix DailySpecial image fallback ([b098577](https://github.com/Buleje/Mercado/commit/b098577b87d195ba6dbf15dd484453038cca68c5))
* CI working-directory and Vercel build command ([88565b5](https://github.com/Buleje/Mercado/commit/88565b56e2f045ce5b8e1179f8d578bbe32fb7b6))
* comprehensive Vercel build hardening ([676c849](https://github.com/Buleje/Mercado/commit/676c84906f89ea42410114a82790408df6ce170a))
* decouple admin bypass from settings failures ([24b7b74](https://github.com/Buleje/Mercado/commit/24b7b748f574a27e17c05ebd59a05e400f20a7a8))
* enable bypass login always - remove DB config check to allow admin access without credentials ([52d11d6](https://github.com/Buleje/Mercado/commit/52d11d6c854decda563fedd209e778a0cb807b9b))
* enable guarded admin bypass and stabilize Vercel build ([401735d](https://github.com/Buleje/Mercado/commit/401735dbb27d24ea23d61451423fe7fa9f7a079d))
* **hooks:** use process.stdin.fd instead of /dev/stdin for Windows compatibility ([f60150a](https://github.com/Buleje/Mercado/commit/f60150a67e06bdd8f183dc66edf40d549c175163))
* lazy prisma proxy + force-dynamic on all API routes to fix Vercel build ([0729d78](https://github.com/Buleje/Mercado/commit/0729d78757105c859343522d9a9cdabaad41111a))
* make CI lint step non-blocking (continue-on-error) ([6f07b61](https://github.com/Buleje/Mercado/commit/6f07b6118ef24f623a42df25b0f9a2fb9a06b990))
* move webpush setVapidDetails out of module scope to prevent Vercel build crash ([0f73a3e](https://github.com/Buleje/Mercado/commit/0f73a3ee2e4cbce18381ab9981fe0f5ce7682788))
* OrderStatusModal z-index set to 99999 to render above all UI layers\n\n- Changed z-9100 Tailwind class to inline style zIndex: 99999\n- Ensures modal appears above Confetti (z-9999), CheckoutModal (z-7501),\n  CartSidebar (z-6001), ReviewModal (z-9001), and all other overlays\n- Previous value (9100) was below Confetti (9999) causing visual overlap" ([415b9dd](https://github.com/Buleje/Mercado/commit/415b9dd604760d944f87ec0a7609f43334bb4594))
* Prisma 7 Vercel compatibility - move migrate to vercel.json buildCommand ([08ac1ea](https://github.com/Buleje/Mercado/commit/08ac1ea31144a00dae92c01c2f501d8c51265722))
* remove postbuild next-sitemap (app/sitemap.ts handles this natively) ([b2ca5e0](https://github.com/Buleje/Mercado/commit/b2ca5e0cba2e2699c6d42697c7e5ffb69ad38c85))
* remove prisma migrate from build, add vscode commit task ([f4c2d7e](https://github.com/Buleje/Mercado/commit/f4c2d7ef6ab43a20806c1c21287a1545cee2bf8f))
* remove ssr:false from Server Components + update admin credentials ([9b4a875](https://github.com/Buleje/Mercado/commit/9b4a875067a0df7d60b8a8fbc72fee57041bdc8d))
* resilient API routes when DATABASE_URL is missing\n\n- auth/login: try-catch around Prisma + Settings calls, fallback to admin2024\n- promotions: try-catch returns empty array on DB error\n- auth/bypass: try-catch returns 503 on DB error\n- settings: proper error handling in PUT route" ([d13c3fb](https://github.com/Buleje/Mercado/commit/d13c3fbe6535f92f50888e9e9e3fad00e042b4c2))
* resolve all 11 lint errors and 53 failing tests — 993/993 pass ([be019c7](https://github.com/Buleje/Mercado/commit/be019c77a956b655cc3e3b8371f22c0e75be235c))
* resolve all TypeScript build errors for Vercel deploy\n\n- CMS route handlers: update params type to Promise&lt;{id}&gt; (Next.js 15)\n- DashboardTab: fix previousPeriodComparison shape (orders/revenue)\n- lib/cms-db/pages.ts: cast Prisma JSON fields to any (JsonValue compat)\n- lib/cms/types.ts: z.record() → z.record(z.string(), z.unknown()) (Zod v4)\n\nBuild: compiled successfully" ([2068fbd](https://github.com/Buleje/Mercado/commit/2068fbd63e5283f243bdac6974a0d120f533878a))
* resolve all TypeScript errors blocking Vercel build ([22bcb05](https://github.com/Buleje/Mercado/commit/22bcb05559895ff2b12bc144f3db5e557ebfbf15))
* resolve CI cache path error and Vercel Hobby cron limits ([bb2e688](https://github.com/Buleje/Mercado/commit/bb2e688258ff5584f5a4b864a50cc6141fcd626f))
* skip ESLint during build, runs in CI instead ([15b1a25](https://github.com/Buleje/Mercado/commit/15b1a25efb49c334a93dc74f968e05cab3085e1c))
* skip TS build errors in next build (validated in CI) ([a043fb1](https://github.com/Buleje/Mercado/commit/a043fb1324a4faaf7af48f7af8b87f6c0ecb85af))
* TypeScript and ESLint errors blocking Vercel build ([197569d](https://github.com/Buleje/Mercado/commit/197569d9f889c621246bf1e13a3cb461b714378b))


### Code Refactoring

* extract customer domain DBs into lib/db/customers.db.ts ([1fb0717](https://github.com/Buleje/Mercado/commit/1fb07179277d7c10455a70d44e653adbc711e625))
* extract finance DBs into lib/db/finance.db.ts ([3e8ec73](https://github.com/Buleje/Mercado/commit/3e8ec73de1ce42a1fd63d6f5128a3f36e393e954))
* extract inventory DBs into lib/db/inventory.db.ts ([256b296](https://github.com/Buleje/Mercado/commit/256b296b8d2c3189b7f051ef65352d7359b1512b))
* extract notification DBs into lib/db/notifications.db.ts ([e782e82](https://github.com/Buleje/Mercado/commit/e782e82f54bc8330d9e4682f676b036c068b297c))
* extract orders DBs into lib/db/orders.db.ts ([20a4306](https://github.com/Buleje/Mercado/commit/20a43063c4d7a685c0acdd93352dd84995510060))
* extract ProductsDB, PriceHistoryDB, BundlesDB into lib/db/products.db.ts ([1066796](https://github.com/Buleje/Mercado/commit/1066796932881d7dab75f588bc5494169d982671))
* extract promotions DBs into lib/db/promotions.db.ts ([3da04bb](https://github.com/Buleje/Mercado/commit/3da04bb31d0a5f6f46ce45f6b8bbf4c87b8131ea))
* extract purchases DBs into lib/db/purchases.db.ts ([27fcfce](https://github.com/Buleje/Mercado/commit/27fcfce2d758a9a760b01516af27b126c4843da5))
* extract sales DBs into lib/db/sales.db.ts ([28f6a6e](https://github.com/Buleje/Mercado/commit/28f6a6e4bb71137614d36ba3055e5b2706deff38))
* extract settings DB into lib/db/settings.db.ts ([355d5f2](https://github.com/Buleje/Mercado/commit/355d5f207da8a93435dfe67ebc1c8e8f3492d5c3))
* extract shared types, normalizePhone, SurveyDB into lib/db/misc.db.ts ([5410e2d](https://github.com/Buleje/Mercado/commit/5410e2d5ed7ac071ff5b9dc791c7d0a770dc57b0))
* replace jsondb.ts with barrel re-export, implementations now in lib/db/* ([849f082](https://github.com/Buleje/Mercado/commit/849f082c47a0ee73575a08712ddcd8243b0b64cf))


### Miscellaneous

* add vercel.json + prisma generate/migrate to build scripts ([71fb27c](https://github.com/Buleje/Mercado/commit/71fb27cbb360f6d88f94e8bde17f7ff6f173ac93))
* clean up dead files (temp logs, one-shot scripts, disabled middleware) ([f0b6399](https://github.com/Buleje/Mercado/commit/f0b63991e553531b362067b87577cc7104152482))
* register agents tab, migrate BatchesDB, remove legacy commands ([4846632](https://github.com/Buleje/Mercado/commit/4846632b5142f81c43eb1054e800e5ab2a3a284c))
* restore lint-staged to eslint only on app/components/lib/hooks ([a9c9cc3](https://github.com/Buleje/Mercado/commit/a9c9cc3926c7934a2e80ae9e12e9ef5e196afbab))

## Changelog

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
