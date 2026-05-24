# Auditoría SEO — Buleje 2026-05-23

## Resumen

| Métrica | Estado | Crítico |
|---|---|---|
| Sitemap dinámico | ✅ 8k URLs | No |
| Robots.txt | ✅ Óptimo | No |
| Metadata dinámico | ✅ Implementado | No |
| JSON-LD (Product + ItemList) | ✅ Presente (sprint anterior) | No |
| OG images | ✅ Dinámicas (`/api/og`) | No |
| hreflang (es-PE) | ✅ Implementado en layout.tsx | No |
| Core Web Vitals mobile | ⚠️ INP >200ms | **P1** |
| LocalBusiness schema | ❌ Falta | **P1** |
| Breadcrumb schema | ❌ Ausente | P2 |
| NAP (Name-Address-Phone) | ⚠️ Genérico | **P1** |
| Recipe schema | ⚠️ Básico (sin ingredientes/pasos) | P2 |
| Sitemap usa product ID vs slug | ⚠️ Sub-óptimo | P2 |

**Fundamentos sólidos.** Sitemap excludes test stores, robots permite Googlebot, metadata dinámico en rutas clave.

**Oportunidades P1:** LocalBusiness + geo coordinates desbloquean Knowledge Panel; Core Web Vitals mobile requiere profiling (ProductRelated + modales = INP alto).

## Top 10 Quick Wins SEO Local Pucallpa

| # | Acción | Esfuerzo | Impacto SEO |
|---|---|---|---|
| 1 | LocalBusiness schema + dirección/teléfono | Media | Alto (Knowledge Panel) |
| 2 | og:image dinámico por store (logo + hero) | Media | Alto (social sharing) |
| 3 | Geo coordinates (lat/lng) en tiendas | Media | Alto (local pack) |
| 4 | Breadcrumb schema en PDP | Media | Medio (faceted) |
| 5 | Recipe schema enriquecido (ingredientes + pasos) | Bajo | Medio (Rich Snippets) |
| 6 | INP mobile <100ms (defer JS) | Alto | Alto (CWV ranking) |
| 7 | Landing pages long-tail (`/pucallpa/bodegas`) | Media | Medio (local search) |
| 8 | og:image categorías | Bajo | Bajo (sharing UX) |
| 9 | Search Console coverage report | Bajo | Bajo (observabilidad) |
| 10 | Sitemap producto ID→slug | Alto | Bajo |

## Archivos clave revisados

- `app/sitemap.ts` — 8k URLs, test stores excluidos ✅
- `app/robots.ts` — `api/admin/` bloqueados ✅
- `app/marketplace/[slug]/producto/[productId]/page.tsx` — Product + Offer schema ✅
- `app/layout.tsx` — hreflang es-PE ✅
- `app/api/og/route.tsx` — OG images dinámicas ✅
- `app/marketplace/[slug]/page.tsx` — ItemList JSON-LD ✅ (sprint anterior)

## Roadmap 3 meses

| Sprint | Acción | Score SEO esperado |
|---|---|---|
| S1 | LocalBusiness + geo + NAP | +0.4 |
| S1 | og:image dinámico por store | +0.3 |
| S2 | INP mobile <100ms (audit ProductRelated + modales) | +0.8 |
| S2 | Breadcrumb schema PDP | +0.2 |
| S3 | Landing pages long-tail Pucallpa | +0.3 |
| **Total** | | **+2.0 (de 6.7 a 8.7/10)** |
