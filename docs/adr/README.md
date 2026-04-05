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
| 001 | Usar Prisma + Supabase PostgreSQL | ✅ Aceptada | 2024-01 |
| 002 | Next.js App Router sobre Pages Router | ✅ Aceptada | 2024-01 |
| 003 | DB classes en vez de Prisma directo | ✅ Aceptada | 2024-03 |
| 004 | Multi-tenant con tenantId por fila | ✅ Aceptada | 2024-03 |
| 005 | Groq API (Llama 3.3) para IA | ✅ Aceptada | 2025-06 |
| 006 | Strategy Pattern para descuentos | ✅ Aceptada | 2026-04 |
