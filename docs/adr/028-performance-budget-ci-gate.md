# ADR-028 — Performance Budget como Gate de CI

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-026 (Phase 3)

---

## 1. Contexto

485+ endpoints, 131 modelos Prisma, y el bundle JS crece sin control. Sin un gate automático, cada feature agrega KB que degradan Core Web Vitals. A $50/mes por bodega, un sitio lento = churn.

## 2. Decisión

Agregar **performance budget** al CI pipeline:

- Bundle inicial < 300KB gzip
- Route chunks < 100KB gzip
- Reporte automático en cada PR (GitHub Step Summary)
- Si bundle total > 500KB gzip → warning visible
- Conectar al `performance-engineer` agent para investigar

### Artefactos

- `.size-limit.json` — configuración de budgets
- `ci.yml` — step "Bundle size check" post-build
- Reporte en GitHub Step Summary con tabla de chunks

## 3. Consecuencias

✅ Bundle protegido sin pensar — crece = alerta visible
✅ Performance-engineer recibe datos para optimizar
⚠️ Umbrales iniciales son estimados — ajustar con datos reales
⚠️ El step no bloquea CI aún (solo warning) — endurecer después de baseline

## 4. Estado

- [x] `.size-limit.json` creado
- [x] CI step agregado
- [ ] Instalar `size-limit` como devDependency
- [ ] Calibrar umbrales con build real
- [ ] Endurecer a "fail CI" después de 2 semanas de data
