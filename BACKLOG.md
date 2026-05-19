# BACKLOG — Post Sprint Final Producción

> **Branch activa:** `chore/production-ready-final`
> **Sprint:** Cierre 100% — código, seguridad, optimización, leyes
> **Inicio:** 2026-05-18
> **Duración objetivo:** 14 días
> **Score objetivo al cerrar:** 18-20/20 production-ready

## Regla de oro del sprint

> **CERO features nuevas durante el sprint.** Cada idea que aparezca → este archivo.
> Después del sprint se prioriza y se ejecuta lo que tenga ROI claro.

## Mapa del sprint (14 días)

| Día | Eje | Tarea | Gate |
|:--:|---|---|---|
| 1-2 | 🔒 Leyes | ADR-115 ConsentEvent (Ley 29733) + endpoints export/delete + UI privacidad | Cliente puede borrar/exportar |
| 3-5 | 🔒 Seguridad | ADR-114 RLS Postgres Fase 1-2 (5 tablas críticas + policies) | Cross-tenant test verde |
| 6-7 | 🔒 Seguridad | ADR-114 Fase 3-5 (migrar callers + crons + rollback) | Sentry 0 errors 24h |
| 8 | 🔒 Seguridad | Pentest interno final + cierre hallazgos | 0 P0/P1 |
| 9 | ⚡ Perf | N+1 fix (review.findMany 3× + tenant.findFirst 3× + dataloader) | Latencia p95 -30% |
| 10 | ⚡ Perf | DB índices missing + EXPLAIN ANALYZE | 0 sequential scans hot path |
| 11 | ⚡ Perf | Bundle + CWV (lazy load top-10 + image optimization) | LCP <2.5s, INP <200ms |
| 12 | 🧪 Código | Tests E2E Playwright 8 happy paths | 8/8 verde |
| 13 | 🧪 Código | tsc strict + dead code (knip) + design tokens | 0 errors |
| 14 | 🚀 Final | DR drill + canary deploy + handoff memoria | Producción ready 18/20 |

## Backlog post-sprint (NO tocar hasta cerrar sprint)

### Features cosméticas pendientes

- [ ] Otras opciones de rediseño AddedToCartDrawer (B, C que se descartaron)
- [ ] Rediseño modal modifier — más iteraciones visuales
- [ ] Card mobile — variantes adicionales (vertical XL, FAB)
- [ ] Sticky bar mobile en /tiendas
- [ ] Eyebrow más editorial en otras pages

### Funcional pendiente

- [ ] OCR Yape comprobante automático
- [ ] Block-list de opCodes Yape fraude
- [ ] Capgo OTA mobile setup (2h)
- [ ] Sharding tenant-per-schema (a 500+ tenants)
- [ ] Read replica Supabase (a 200+ tenants)
- [ ] Multi-region failover

### Marketing / comercial

- [ ] Outreach manual a los 4 trials antes de 2026-06-12
- [ ] Pitch deck para potenciales compradores
- [ ] Ads FB/TikTok (sólo POST cierre sprint)
- [ ] Pentest profesional externo certificado

### Schema drift pendiente

- [ ] ProductAnalytics ADR-081
- [ ] Otras columnas via raw SQL que deberían pasar a schema.prisma

## Reglas estrictas del sprint

1. Branch única `chore/production-ready-final` hasta cerrar
2. CERO features nuevas — cualquier pedido va al BACKLOG arriba
3. Commit por día mínimo
4. tsc + vitest + lint GREEN antes de cerrar día
5. Cada eje cierra con gate explícito; no avanzo sin gate verde
6. Si encuentro hallazgo P0 mid-sprint, paro y arreglo
7. Memoria viva actualizada fin del día
