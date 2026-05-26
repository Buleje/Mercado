# ADR-122 — SEO para búsqueda IA + enriquecimiento de /tiendas

**Estado:** Aceptado · **Fecha:** 2026-05-25 · **Autor:** Buleje + Claude

## Contexto

El SEO de Buleje ya es fuerte (sitemap dinámico exhaustivo, robots con detección
de prod, llms.txt, JSON-LD en páginas clave). Objetivo nuevo de Brandon: **ser
referente en búsqueda IA** (Google AI Overviews/Gemini, Perplexity, ChatGPT).

Hallazgo: `robots.ts` **bloqueaba Google-Extended** (el crawler que alimenta las
AI Overviews de Google y Gemini) junto con GPTBot/anthropic-ai/CCBot — contrario
al objetivo. La retrieval en vivo (ChatGPT-User, PerplexityBot) ya estaba
permitida.

## Decisión

1. **robots.ts** — permitir **Google-Extended** (Google sí cita la fuente y es lo
   más usado en Perú). GPTBot/anthropic-ai/CCBot/Bytespider siguen bloqueados
   (training puro sin atribución ni tráfico de retorno). Decisión de Brandon.
2. **/tiendas** — enriquecer JSON-LD: ItemList 12→24 tiendas; por tienda agregar
   `priceRange`, `currenciesAccepted`, `paymentAccepted` (Yape/Plin/efectivo/
   tarjeta), `areaServed`. Agregar **FAQPage** (5 preguntas reales del comprador
   de Pucallpa) → rich result de Google + respuestas extraíbles por IA.
3. **llms.txt** — agregar sección Marketplace (lado consumidor: delivery, pagos,
   zonas) + FAQ. Antes solo describía el SaaS para dueños.

No se tocó Organization (ya en `SchemaMarkup`) ni WebSite+SearchAction (ya en
`app/(store)/page.tsx`) — duplicarlos rompió antes (audit v10 P0).

## Consecuencias

**+** Google AI Overviews/Gemini pueden indexar y citar Buleje. **+** /tiendas
elegible para rich results (FAQ, listing). **+** IA entiende el doble rol
(SaaS + marketplace). **−** Google-Extended usa el contenido para mejorar
respuestas (aceptado: cita la fuente). GPTBot/Claude siguen sin "conocer" Buleje
desde training (solo retrieval en vivo).

## Verificación
- tsc 0, lint 0. `/tiendas` emite FAQPage + CollectionPage + ItemList +
  priceRange + paymentAccepted (verificado en HTML). robots Google-Extended
  activo en producción (en dev devuelve Disallow:/ por diseño).

## Referencias
- `app/robots.ts`, `app/tiendas/page.tsx`, `public/llms.txt`
- `components/SchemaMarkup.tsx` (Organization), `app/(store)/page.tsx` (WebSite+SearchAction)
