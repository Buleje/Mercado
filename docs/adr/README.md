# Architecture Decision Records (ADR)

Aquí documentamos las decisiones técnicas importantes del proyecto.
Cada vez que tomamos una decisión que afecta la arquitectura, creamos un ADR.

## ¿Para qué sirve?

Como un diario de decisiones — cuando alguien pregunta "¿por qué se hizo así?",
la respuesta está en un ADR en vez de perderse en la memoria de alguien.

## Formato

Cada ADR sigue esta estructura:
1. **Contexto** — ¿Cuál era el problema?
2. **Opciones** — ¿Qué alternativas consideramos?
3. **Decisión** — ¿Qué elegimos y por qué?
4. **Consecuencias** — ¿Qué implica esta decisión?

## Lista de ADRs

| # | Decisión | Estado | Fecha |
|---|----------|--------|-------|
| 001 | Multi-tenancy con tenantId por fila | ✅ Aceptada | 2024 |
| 002 | JWT stateless con HMAC-SHA256 | ✅ Aceptada | 2024 |
| 003 | Migración de fire-and-forget a BullMQ | ✅ Aceptada | 2026-04 |
| 004 | Dual tenant resolution (server + client) | ✅ Aceptada | 2025 |
| 005 | Feature flags via env vars | ✅ Aceptada | 2026-04 |
| 006 | Strategy Pattern para descuentos | ✅ Aceptada | 2026-04 |
