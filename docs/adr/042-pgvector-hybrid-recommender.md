# ADR 042 — pgvector Hybrid Recommender v2

**Estado:** Scaffolding listo — migracion SQL propuesta, aplicacion manual pendiente
**Fecha:** 2026-04-10
**Autor:** Claude (ingeniero-jefe) — sesion `luis` modo maximo
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #4 — ROI estimado S/3,600-6,750 por mes por tienda

---

## Contexto

El recommender actual (`lib/ai/recommender.ts`) llama al LLM una vez por pedido para elegir productos complementarios. Tres problemas:

1. **Latencia:** ~1.5s por request (Claude Sonnet + 50 productos serializados)
2. **Costo:** cada "ver detalle de producto" consume tokens — no escala
3. **Calidad:** no aprende del historial de compras real de la tienda

El roadmap de 24 semanas marca este item como multiplicador transversal (resuelve tambien iniciativas 12 y 45: product search semantico + anti-dead-stock).

## Decision

Implementar un recommender hibrido que blend dos senales:

1. **Similitud semantica (70%)** via pgvector + embeddings OpenAI `text-embedding-3-small` (1536 dims)
2. **Co-compra real (30%)** via query SQL agregada sobre `OrderItem` × `Order` de los ultimos 90 dias

El LLM existente (`lib/ai/recommender.ts`) queda como ultimo fallback cuando ambas fuentes estan vacias (tienda nueva, sin embeddings, sin historial).

### Archivos creados en esta sesion

| Archivo | Proposito |
|---------|-----------|
| `lib/recommender/embeddings.ts` | `generateEmbedding` + utilidades cosine + pgvector literal |
| `lib/recommender/hybrid.ts` | `getHybridRecommendations` con degradacion automatica |
| `app/api/recommender/hybrid/route.ts` | GET publico rate-limited por tenant |
| `prisma/migrations/proposed-pgvector.sql` | DDL con `CREATE EXTENSION` + column + index IVFFlat |

### Por que `$queryRawUnsafe` con parametros posicionales

El tipo `vector(1536)` es `Unsupported` en Prisma — no hay una Query Builder para `<=>`. Usamos `$queryRawUnsafe` con parametros **posicionales** (`$1`, `$2`, `$3`, `$4`) respetando la regla #11 de CLAUDE.md: nunca string interpolation.

### Degradacion graceful

El flujo nunca tira excepciones — siempre retorna `{ recommendations, source }`:

| Estado del tenant | Fuente efectiva | UX |
|-------------------|-----------------|-----|
| pgvector + embeddings + ordenes 90d | `hybrid` | Perfecto |
| pgvector instalado pero embeddings vacios | `copurchase` | OK |
| pgvector no instalado | `copurchase` | OK |
| Tienda nueva sin ordenes | `empty` -> cliente llama LLM recommender | Slower pero funciona |

## Alternativas evaluadas

1. **Pinecone / Qdrant externo** — descartado por costo fijo mensual + dependencia extra. pgvector es gratis dentro del plan Supabase existente.
2. **Solo co-purchase** — descartado: tiendas nuevas (mayoria del roadmap a 50 tiendas) no tienen historial.
3. **Mantener LLM puro** — descartado: costo escalaria linealmente con trafico.

## Consecuencias

### Positivas
- Latencia de recomendaciones: 1500ms -> ~80ms (p95 esperado)
- Costo por request: ~$0.003 (LLM) -> ~$0.00002 (embedding cacheado + SQL)
- El embedding se genera una sola vez por producto (backfill via script)
- El LLM se reserva para casos dificiles -> ahorro estimado 80-90%

### Negativas / riesgos
- Requiere migration manual (no auto-aplicable por `prisma migrate deploy`) hasta que haya campo en schema.prisma
- El indice IVFFlat con 100 lists asume catalogo < 100k productos — rebuild si crece
- El embedding model depende de `OPENAI_API_KEY` — si falta, degrade a copurchase

### Seguridad
- `embedding` solo se expone en endpoints server-side — nunca en payload cliente
- Raw SQL usa parametros posicionales (regla #11 CLAUDE.md)
- Tenant isolation intacto via `WHERE "tenantId" = $2`

## Pasos de activacion (para Brandon, 10 minutos)

```bash
cd bodega-san-martin

# 1. Aplicar la migracion en Supabase (requiere DIRECT_URL configurada)
psql "$DIRECT_URL" -f prisma/migrations/proposed-pgvector.sql

# 2. Agregar la columna al schema.prisma:
#    embedding Unsupported("vector(1536)")?
#    en el model Product

# 3. Regenerar cliente
npx prisma generate

# 4. Backfill (script a crear siguiente sesion):
#    npx tsx scripts/embed-products.ts --tenant main
```

## Referencias

- pgvector: https://github.com/pgvector/pgvector
- Supabase Vector: https://supabase.com/docs/guides/ai/vector-columns
- ADR 016 — plan maestro 24 semanas (Tier S item #4)
- ADR 041 — Sprint 2 kickoff
- CLAUDE.md reglas #3 (tenantId), #11 (raw SQL posicional)
