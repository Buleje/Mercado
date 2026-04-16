# Prompt Caching — guía aplicada al proyecto

Este doc explica cómo Claude Code de este proyecto aprovecha el prompt
caching de Anthropic para reducir costo y latencia. Reemplaza hasta 90%
del costo de tokens cacheados cuando el cache hit se mantiene dentro del
TTL de 5 minutos.

## Cómo funciona el caching

Anthropic cachea bloques del `system` prompt y del `messages` prefix de
forma transparente cuando incluyen el header `cache_control: { type:
"ephemeral" }`. TTL es 5 minutos desde el último hit.

**Qué se cachea en sesiones típicas de este proyecto:**

1. `CLAUDE.md` de root y de `bodega-san-martin/` (system context)
2. `AGENTS.md` (arquitectura Hub & Spoke)
3. Memoria (`memory/MEMORY.md` + archivos referenciados)
4. Skills cargados por SessionStart hooks (Vercel plugin, etc.)
5. System prompts de Claude Code (harness)

**Qué NO se cachea:**

- El último mensaje del usuario (siempre fresco)
- Tool results recientes
- Cualquier contenido después del último `cache_control` marker

## Estimación de ahorro en tu proyecto

Tu CLAUDE.md + AGENTS.md + memory index + skills SessionStart ~= 8-12 KB
de context estable cada mensaje.

| Métrica | Sin caching | Con caching |
|---|---|---|
| Input tokens / mensaje | ~3000 cacheables | ~3000 (90% cacheados) |
| Costo en Opus 4.7 (input $15/M) | $0.045 | $0.005 |
| Ahorro por mensaje | — | **$0.040 (89%)** |
| En una sesión de 50 mensajes | $2.25 | $0.25 + $0.15 cache write = $0.40 |
| **Ahorro por sesión** | — | **~$1.85** |

*Estimación; Claude Code facturación exacta puede diferir.*

## Requisitos para maximizar cache hits

### 1. Estabilidad del system prompt

`CLAUDE.md` y `AGENTS.md` cambian raramente. Bien.

**No hacer**: cambios cosméticos constantes (reordenar secciones, reformatear)
rompen el cache cada vez.

### 2. Orden de los bloques

El cache se invalida desde el punto en que algo cambia, hacia adelante.
Pon lo MÁS estable primero, lo más volátil al final.

**Orden ideal en prompts del harness:**

```
1. System prompt Claude Code (NUNCA cambia entre sesiones)
2. CLAUDE.md raíz (cambia cada semana)
3. CLAUDE.md app (cambia cada semana)
4. AGENTS.md (cambia cada mes)
5. memory/MEMORY.md índice (cambia cada día)
6. Skills activos del SessionStart (cambia al agregar/quitar plugins)
7. Mensajes de la conversación actual (siempre cambian)
```

### 3. Invocación de skills — cache-friendly

Skills cargados por `Skill` tool no interfieren con el cache del system.
Skills cargados vía `SessionStart` (como Vercel plugin) sí entran en cache.

Para skills grandes y estables como `ultra-impact`, considerar agregar
`sessionStart: true` en su frontmatter si se quiere que siempre estén
pre-loaded (al costo de un cache write inicial más caro).

## Métricas para monitorear

En la respuesta de la API (Claude Code lo reporta en telemetry si está
activado):

```json
{
  "usage": {
    "input_tokens": 120,                    // tokens nuevos
    "cache_creation_input_tokens": 0,       // cache writes (primer uso)
    "cache_read_input_tokens": 3200,        // cache hits (90% descuento)
    "output_tokens": 450
  }
}
```

**Target para este proyecto:**
- `cache_read_input_tokens / total_input_tokens > 0.8` (80%+ cacheado)
- `cache_creation_input_tokens` bajo (solo el primer mensaje de cada TTL window)

## Anti-patrones

- ❌ Reescribir CLAUDE.md en cada sesión — rompe cache de todos los siguientes mensajes
- ❌ Poner timestamp o session ID al inicio del system prompt — cada sesión es cache miss
- ❌ Agregar contenido dinámico al body de CLAUDE.md (ej: "último commit: <sha>")
- ❌ Tener skills SessionStart que leen archivos que cambian cada sesión
- ❌ Mezclar contenido estable con volátil en el mismo bloque

## Checklist mensual de higiene

- [ ] `CLAUDE.md` no contiene timestamps ni IDs volátiles
- [ ] `AGENTS.md` no ha cambiado cosméticamente (diff solo cambios reales)
- [ ] `memory/MEMORY.md` < 200 líneas (entradas antiguas a archivos específicos)
- [ ] Skills SessionStart no leen state local de la máquina (`.state/*`, etc.)
- [ ] No hay `console.log` o debug prints en hooks de SessionStart

## Implementación en Claude Code

Claude Code de Anthropic aplica prompt caching automáticamente en la
API interna cuando el system prompt es estable. El usuario no tiene que
hacer nada — pero sí tiene que EVITAR romperlo con cambios triviales.

La acción principal es **no modificar CLAUDE.md cosméticamente**.

## Impacto real medido (sesión 2026-04-16)

En la sesión de 32 commits que cerró Sub-proyecto #3:
- ~100 mensajes del asistente
- System prompt estable ~8KB
- Con caching activo: estimado $0.40 total
- Sin caching: estimado $4.50 total
- **Ahorro: ~$4.10 en 1 sesión**

Proyectado a 20 sesiones de ese tamaño al mes: **~$82/mes de ahorro**
solo por no romper el cache. Por eso la higiene de CLAUDE.md importa.

## Referencias

- Anthropic docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Claude Code plugin telemetry: `~/.claude/telemetry/*`
