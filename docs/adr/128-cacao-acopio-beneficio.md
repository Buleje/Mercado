# ADR-128 — Cacao: Acopio, Beneficio, Mercado y Asesor

**Fecha:** 2026-05-29
**Estado:** Implementado
**Decisión:** Brandon
**Relacionado:** [ADR-124](124-especializaciones-forestal-ctp.md) (patrón especializaciones), spec `spec:agricola:cacao-acopio`

---

## Contexto

Especialización agrícola para un acopiador de cacao en Pucallpa: comprar grano a
productores, controlar calidad (NTP-ISO), pagar (liquidación), beneficiar
(fermentar + secar) y vender el grano seco. Necesita además entender el mercado
internacional para decidir cuándo vender o aguantar.

## Decisión

Módulo `cacao-acopio` (gating `spec:agricola:cacao-acopio`) con 7 sub-vistas en
`CacaoAcopio.tsx`. Patrón Buleje: `tenantId` 1er param, cache+invalidate, spec
guard, lógica pura en `lib/cacao/*` (testeable, sin prisma).

**Modelos** (`prisma/schema.prisma`): `CacaoProducer`, `CacaoLote` (acopio + cut
test NTP-ISO 1114 + liquidación), `CacaoBeneficio` (fermentación + secado + merma).

**Lógica pura** (`lib/cacao/`):
- `cacao-quality.ts` — grado (NTP-ISO 2451), índice de fermentación, liquidación,
  merma, proyección seco, rendimiento. Humedad meta ≤7% (NTP 208.040).
- `cacao-advisor.ts` — señal determinística vender/aguantar/neutral desde precio,
  posición 52sem, tendencia y volatilidad. NUNCA inventa cifras.
- `cacao-market.ts` (server-only) — precio ICE cocoa (Yahoo CC=F) + FX USD/PEN +
  noticias (Google News RSS). Cache TTL 20min en memoria. URLs hardcoded (sin SSRF).
- `cacao-recibo.ts` — recibo de liquidación imprimible (ventana print).

**Endpoints** (`app/api/admin/cacao/`):
- `route.ts` — CRUD lotes/productores/beneficios + views stats/inventory/trends/
  producer-detail/lote-detail + filtros (variedad/grado/fecha).
- `market/route.ts` — datos de mercado (precio+noticias).
- `advisor/route.ts` — señal + narrativa IA grounded (`callLLM` cheap, cache 2h) +
  comparación precio local vs internacional.

**Sub-vistas UI:**
1. **Acopio** — lotes, KPIs, filtros, export CSV, ficha drawer (calidad desglosada,
   liquidación, beneficio, recibo).
2. **Beneficio** — fermentación + secado + merma.
3. **Inventario** — kg seco disponible/proceso, valorización, rendimiento.
4. **Productores** — perfil drawer + historial + editar + activar/desactivar.
5. **Resumen** — kg/mes, top productores, distribución calidad, alerta humedad.
6. **Mercado** — precio en vivo + gráfico de flujo (recharts, rangos 1S–1A) +
   volatilidad + noticias.
7. **Asesor** — señal vender/aguantar + narrativa IA + checklist (cuándo/dónde/
   riesgos/acopio) + tu precio vs. internacional.

## Consecuencias

- (+) Cobertura end-to-end: compra → calidad → pago → beneficio → inventario →
  decisión de venta informada por el mercado real.
- (+) Lógica de dinero/calidad/consejo blindada con tests (`__tests__/cacao-*.test.ts`).
- (+) Datos de mercado gratis sin API key; degradan con gracia si la fuente falla.
- (−) Yahoo Finance es API no-oficial (riesgo de cambio); mitigado con fallback.
- (−) Narrativa IA depende de `callLLM` (Anthropic→Groq→OpenAI); best-effort.

## Alternativas consideradas

- **Precio vía API paga** (commodities con key) — descartado: Yahoo gratis basta.
- **Asesor 100% IA** — descartado por riesgo de alucinar cifras; se eligió híbrido
  (señal determinística + narrativa IA grounded).
- **Precio en chacra como feed** — no existe API pública; se usa referencia
  internacional + comparación con el precio de compra propio del tenant.

## Referencias

- NTP 208.040:2017, NTP-ISO 2451 / 1114 / 2291.
- Yahoo Finance `CC=F`, Google News RSS, ICCO, Investing, MIDAGRI.
