# ADR 041 — Sprint 2 Kickoff: Programmatic SEO + AI Insights

**Estado:** Aprobado
**Fecha:** 2026-04-10
**Autor:** Claude (ingeniero-jefe)
**Contexto:** Sprint 1 completado; inicio de Sprint 2 (AI + WhatsApp + Growth)

---

## Contexto

Sprint 1 (Fundamentos) esta **100% completado**:
- Cache Components Next 16 con `use cache` + `cacheLife` + `cacheTag`
- Dashboard admin aggregates
- Onboarding wizard self-service (5 pasos)
- SUNAT boleta/factura via Nubefact (real, no mock)
- AI Insights Card via daily-summary cron (WhatsApp + push)
- Vercel AI Gateway migrado

Sprint 2 arranca con foco en **generacion de trafico organico y retencion B2B**.

## Decision

### 1. Programmatic SEO Foundation

Crear paginas dinamicas `/zona/[ciudad]/` y `/zona/[ciudad]/[categoria]/` que target local search queries:

| Pagina | Target keyword | Ejemplo |
|--------|---------------|---------|
| `/zona/pucallpa` | "bodega delivery Pucallpa" | Landing de categorias |
| `/zona/pucallpa/abarrotes` | "comprar abarrotes Pucallpa" | Grid de productos |
| `/zona/pucallpa/bebidas` | "bebidas delivery Pucallpa" | Grid de productos |

**JSON-LD inyectado:** GroceryStore, ItemList, FAQPage, BreadcrumbList.

**Zonas iniciales:** Solo Pucallpa (Calleria, Manantay, Yarinacocha). Expandible a futuro.

### 2. AI Insights Card Upgrade

Upgrader el cron `daily-summary` para generar resumen NLP en vez de numeros raw:
- Comparacion vs dia anterior (trend up/down/stable)
- Lenguaje informal peruano para WhatsApp
- Fallback a texto plano si AI falla
- Provider: Vercel AI Gateway (Groq primary)

### 3. Sitemap actualizado

`app/sitemap.ts` ahora incluye zone pages (1 por ciudad + 6 por categoria × ciudad).
Con Pucallpa: 7 nuevas URLs en sitemap.

## Archivos creados/modificados

| Archivo | Accion |
|---------|--------|
| `data/zones.ts` | NUEVO — datos de zonas para SEO |
| `lib/seo/json-ld.ts` | NUEVO — generadores JSON-LD |
| `app/(store)/zona/[ciudad]/page.tsx` | NUEVO — landing ciudad |
| `app/(store)/zona/[ciudad]/[categoria]/page.tsx` | NUEVO — ciudad x categoria |
| `app/sitemap.ts` | MODIFICADO — zone pages |
| `lib/ai/daily-insights.ts` | NUEVO — NLP para daily-summary |
| `app/api/cron/daily-summary/route.ts` | MODIFICADO — AI insights |

## ROI estimado

- **Programmatic SEO:** 5,000-12,000 visitas organicas/mes (Sem 2-3 despues de indexacion)
- **AI Insights:** Reduccion churn B2B 15-25% (engagement diario con dueños)

## Riesgos

| Riesgo | Mitigacion |
|--------|-----------|
| Google tarda en indexar | Submit manual via Search Console + internal linking |
| AI insights genera texto raro | Fallback automatico a texto plano |
| Zone pages sin productos | Mensaje "proximamente" + link a catalogo |

## Siguiente paso

Sprint 2 continua con:
- Hybrid Recommender v2 (pgvector)
- WhatsApp AI Concierge buyers
- Billing metering
