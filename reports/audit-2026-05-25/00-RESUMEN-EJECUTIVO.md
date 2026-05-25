# Auditoría General Buleje — Resumen Ejecutivo
**Fecha:** 2026-05-25 · **Método:** 5 agentes paralelos (security, performance, database, code-quality, architecture) · **Verificación:** hallazgos P0 cross-checados manualmente por el lead.

## Scorecard por frente

| Frente | P0 | P1 | P2 | Veredicto |
|---|---|---|---|---|
| 🔒 Seguridad | 0 | 0 | 4 | 🟢 Muy endurecido (auditorías previas) |
| ⚡ Performance | 0 | 5 | 6 | 🟢 Sin bloqueantes, mejoras de CWV |
| 🗄️ Base de datos | 4 | 7 | 6 | 🔴 Índices + leak tenant |
| 🧹 Calidad código | 8 | 9 | 5 | 🟡 Deuda sistémica |
| 🏛️ Arquitectura | 1 | 4 | 4 | 🟡 Monolitos UI + prisma directo |

## P0 verificados (confirmados por el lead, no inflados)

| # | Archivo:línea | Problema | Fix |
|---|---|---|---|
| 1 | `lib/db/recommendations.db.ts:39` | `product.findMany` sin `tenantId` → mezcla catálogo de todos los tenants + carga TODO a RAM por request | Scopear por tenantId + cache |
| 2 | `prisma/schema.prisma` OrderItem/SaleItem | Falta `@@index([productId])` → seq scan en analytics y recomendador | +9 `@@index` + migración DIRECT_URL |
| 3 | `app/sitemap.ts:131,266` | `product/receta.findMany` sin tenantId en SEO público | Agregar `tenantId:"main"` (2 líneas) |
| 4 | `cuenta/gift-cards/page.tsx:19` + `cuenta/cupones/page.tsx:19` | `userId="user_me"` hardcodeado → feature rota en prod | Leer userId de sesión real |
| 5 | `app/superadmin/slo/page.tsx:65` | Mock `dpl_mock_001` → panel SLO inútil | Conectar API o ocultar |

## Tema transversal (aparece en 3 informes)
**Prisma directo fuera de `lib/db/`:** 163-275 archivos (según método de conteo). La mayoría en cron (legítimo), pero ~190 routes de negocio bypassean cache/audit/tenantId. Proyecto grande, no quick-win.

## Lo que YA está bien (no tocar)
- Seguridad: 0 SQLi/XSS/auth-bypass/secrets. ~110 "endpoints sin auth" eran falsos positivos.
- Capa datos desacoplada: 0 prisma en `components/`, 0 dep `lib/db→components`.
- `app/admin/page.tsx` ya modular (430 LOC + 34 hooks). NO es el monolito de 133 tabs que decía CLAUDE.md.
- Sin `force-dynamic` activo (hotfix bdb6f5f2 vigente). next/image AVIF/WebP OK.

## Mitos corregidos (actualizar CLAUDE.md)
- `lib/db` real = **194** clases (doc dice 90). Endpoints = **886** (doc dice 158).
- `page.tsx` ya modularizado, sacar de lista de monolitos.
- "63 `.parse()` Zod" eran `JSON.parse` → falso positivo.

## Detalle por frente
Ver `01-security.md`, `02-performance.md`, `03-database.md`, `04-code-quality.md`, `05-architecture.md`.
