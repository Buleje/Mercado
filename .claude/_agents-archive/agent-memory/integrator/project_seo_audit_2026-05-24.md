---
name: seo-audit-2026-05-24
description: Re-auditoría SEO Buleje 2026-05-24 — score 81/100 tras fixes hreflang zona/, revisión sitemap/t-slug/tienda-slug/sameAs
metadata:
  type: project
---

Score global: **81/100** (subió de 74 en auditoría anterior)

Sub-scores verificados con código real:
- Metadata: 19/20 — cobertura casi total en páginas públicas. Gaps: mis-pedidos y cuenta/pedidos (autenticadas, aceptable con noindex implícito)
- OG/Twitter: 17/20 — og:image dinámica /api/og en marketplace/[slug] ✓, t/[slug] con ogImage condicional ✓. Gap menor: solo fallback estático en home /api/og sin parámetros
- JSON-LD: 16/20 — LocalBusiness+GeoCoordinates ✓, Organization ✓, StoreJsonLd LocalBusiness/Restaurant dinámico ✓, ProductJsonLd en marketplace PDP ✓ (fix previo), ItemListJsonLd ✓, FAQPageLD + SoftwareApplicationLD + ZoneLandingLD en zona/* ✓, BreadcrumbSchema ✓. Gap menor: sameAs vacío en LocalBusinessJsonLd (sin Google Business Profile URL)
- Sitemap/robots: 13/15 — muy completo. Gap: zonePages + districtPages en sitemap.ts NO tienen alternates.languages (solo staticPages y categoryPages lo tienen — consistencia incompleta)
- Semántica HTML: 8/10 — H1 confirmado en todas las rutas programáticas zona/, marketplace home, store home, tienda/[slug], t/[slug]. Estructura semántica correcta
- Local SEO Pucallpa: 8/15 — GeoCoordinates (-8.3791, -74.5539) ✓, NAP con streetAddress condicional ✓, hreflang es-PE + x-default en las 5 rutas zona/* ✓ (fix aplicado). GAPS: (1) t/[slug] alternates solo tiene canonical, falta languages es-PE. (2) tienda/[slug] alternates solo tiene canonical, falta languages. (3) sitemap zona/district entries sin alternates.languages. (4) sameAs[] vacío en LocalBusinessJsonLd

Top hallazgos post-fix:
1. sitemap.ts — zonePages y districtPages sin alternates.languages (100s de URLs programáticas sin señal hreflang)
2. app/t/[slug]/page.tsx — alternates solo canonical, falta `languages: { "es-PE": url, "x-default": url }`
3. app/(store)/tienda/[slug]/page.tsx — mismo gap que t/[slug]
4. LocalBusinessJsonLd.tsx — sameAs: [] vacío debilita Knowledge Panel de Google
5. Sitemap estático: /recetas, /buscar, /about, /ayuda sin alternates.languages

**Why:** memoria para continuidad entre sesiones SEO.
**How to apply:** próximas tareas: priorizar (1) sitemap alternates zona/district, (2) t/slug + tienda/slug hreflang, (3) sameAs con URL Google Business Profile cuando Brandon la registre.
