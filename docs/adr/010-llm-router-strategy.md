# ADR-010: Router LLM mixto (Groq + Claude/OpenAI fallback)

## Estado
Propuesta

## Fecha
2026-04-06

## Contexto

El Excel Agentes IA (práctica #23 "Modelo mixto rápido + potente") recomienda:

> Groq/Llama-3.1-70B para uso normal; Claude/GPT-4o solo para decisiones críticas. Router inteligente según complejidad: keywords + longitud de query. Beneficio: costo bajo y respuestas rápidas incluso con muchos usuarios simultáneos.

Hoy **todos los endpoints LLM del proyecto usan el mismo modelo** (`llama-3.3-70b-versatile` en Groq), sin importar si la query es trivial ("¿cuánto cuesta el arroz?") o crítica ("¿debería comprar 500 kg de yuca o 300 kg de plátano esta semana?"). Esto:

1. **Gasta dinero en queries triviales** que podrían resolverse con un modelo 10x más barato.
2. **Subutiliza la calidad** en queries críticas que podrían beneficiarse de un modelo más potente (Claude Sonnet 4.5, GPT-5).
3. **No tiene fallback** si Groq cae — el único fallback es la respuesta rule-based en cada route handler.

El estado actual tiene `lib/circuit-breaker.ts` + `recordAIFailure()` + `returnRuleBased()` como red de seguridad, pero eso degrada a rule-based. Un router correcto degradaría primero a **otro LLM provider**, y solo después a rule-based.

## Opciones consideradas

### Opción A: Router por keywords + longitud (propuesta del Excel)
- ✅ Simple de implementar — un `switch` con regex.
- ✅ Predecible y debugeable.
- ❌ Frágil ante queries nuevas que no matchean keywords.
- ❌ No considera carga actual del tenant ni presupuesto de tokens.

### Opción B: Router por categoría semántica de endpoint (cada route handler declara su tier)
- ✅ Explícito y auditable — cada endpoint declara `tier: "cheap" | "balanced" | "premium"`.
- ✅ Desarrolladores razonan sobre el costo cuando escriben el endpoint.
- ✅ Alineado con la constante `AI_TEMPERATURES` creada en esta sesión — mismo patrón de "roles canónicos".
- ❌ Decisión estática — no se adapta si la query es anómala.

### Opción C: Router basado en ML (classifier pequeño que predice complejidad)
- ✅ Preciso.
- ❌ Over-engineering absoluto para un proyecto de 1 bodega.
- ❌ Requiere datos de entrenamiento + pipeline + monitoring.
- **Descartada** (YAGNI).

### Opción D: Router híbrido — tier por endpoint (default) + override por keywords de criticidad
- ✅ Combina simplicidad de B con flexibilidad de A.
- ✅ El endpoint declara default, pero keywords como "aprobar", "comprar", "eliminar", "urgente" pueden escalar al tier superior.
- ❌ Más complejidad que B puro.

## Decisión

**Opción B (router por tier declarado en el endpoint)** como v1. **Opción D (híbrido con keywords de escalada)** como v2 **si** después de 3 meses de uso vemos queries críticas que se procesan con modelo barato.

### Tiers propuestos

| Tier | Modelo default | Modelo fallback | Provider | Costo relativo | Uso |
|---|---|---|---|---|---|
| `cheap` | `llama-3.1-8b-instant` | `llama-3.3-70b-versatile` | Groq | 1× | Chat con clientes, auto-reply, voice interpret, OCR simple |
| `balanced` | `llama-3.3-70b-versatile` | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq | 3× | ai-assistant, coach, promotions creative, demand prediction |
| `premium` | `claude-sonnet-4-6` | `llama-3.3-70b-versatile` | Anthropic + Groq fallback | 30× | Decisiones críticas: aprobación de compras grandes, análisis financiero mensual |

### Criterio por endpoint existente

| Endpoint | Tier propuesto | Razón |
|---|---|---|
| `app/api/chat/auto-reply/route.ts` | cheap | Respuestas simples al cliente, alto volumen |
| `lib/whatsapp-ai.ts` | cheap | Mismo — WhatsApp chat al cliente |
| `app/api/pos/voice-interpret/route.ts` | cheap | Intent parsing simple, el fuzzy match local cubre fallos |
| `app/api/ocr/invoice/route.ts` | cheap | Extracción, tolerante a fallos con reintentos |
| `app/api/ai-assistant/route.ts` | balanced | Admin consulting con tool calling — necesita razonamiento |
| `app/api/ai-assistant/coach/route.ts` | balanced | Business coach, consejos estratégicos |
| `app/api/demand-prediction/route.ts` | balanced | Forecasting con múltiples variables |
| `app/api/promotions/ai-suggest/route.ts` | balanced | Creative generation con contexto |
| `app/api/promotions/[id]/route.ts` | balanced | Similar a ai-suggest |
| *(ninguno actual)* | premium | Futuro: endpoint "aprobar compra >$500" si existiera |

## Consecuencias

### Positivas
- **Reducción de costo proyectada: 40-60%** en queries de bajo volumen × alta cantidad (chat al cliente).
- **Capa de fallback real** — si Groq cae, ai-assistant degrada a claude/otro model antes de rule-based.
- **Observabilidad por tier** — se puede medir costo/latencia/calidad por cada uno con `lib/ai-usage-tracker.ts`.
- **Mueve práctica #23 del Excel Agentes IA** de ❌ a ✅ cuando se implemente (+1 práctica → 62.5% sólido).

### Negativas
- **2 providers = 2 sets de credenciales** (GROQ_API_KEY ya existe, agregar ANTHROPIC_API_KEY).
- **Primera sesión de implementación debe auditar cada endpoint** para asignar tier y testear la calidad del modelo barato.
- **`llama-3.1-8b-instant` puede alucinar más** que `llama-3.3-70b-versatile` en queries triviales — requiere testing.

### Riesgos
- **Drift de tier:** un desarrollador agrega un endpoint nuevo sin declarar tier → router usa default `balanced`. Mitigación: test unitario que verifique que todos los endpoints LLM tienen tier declarado.
- **Fallback circular:** si Groq cae completamente, los tiers `cheap` y `balanced` no tienen Groq fallback. Necesitamos que el fallback de esos dos tiers sea también Claude o un tier superior de otro provider.

## Implementación pendiente (próxima sesión dedicada)

1. Crear `lib/llm-providers/` con:
   - `types.ts` — interfaz `LLMProvider { chat(messages, opts): Response }`
   - `groq.ts` — wrapper sobre `fetchGroqWithRetry`
   - `anthropic.ts` — wrapper sobre `@anthropic-ai/sdk`
   - `index.ts` — exports
2. Crear `lib/llm-router.ts` con:
   - `AI_TIERS = { cheap, balanced, premium }` (igual pattern que `AI_TEMPERATURES`)
   - `pickProvider(tier): LLMProvider` con lógica de fallback
   - `callLLM(tier, messages, opts)` — entry point único
3. Agregar `ANTHROPIC_API_KEY` a `lib/env.ts` como productionOnly
4. Migrar los 9 endpoints identificados arriba para usar `callLLM(tier, ...)` en vez de `fetchGroqWithRetry` directo
5. Extender `lib/ai-usage-tracker.ts` para separar costo por tier y provider
6. Dashboard simple en `/superadmin/ai-costs` mostrando costo por tier (futuro)
7. Actualizar `docs/TECH-DEBT.md` TD-024 con estado final
8. Mover práctica #23 del Excel Agentes IA de ❌ a ✅

## Referencias

- Excel: `Mejores_Practicas_Agentes_IA.xlsx` práctica #23 "Modelo mixto rápido + potente"
- TECH-DEBT: TD-024
- Constante relacionada: `lib/ai-temperatures.ts` (mismo pattern de roles canónicos)
- Complementa ADR-009 (structured output) — ambos son gates para que Excel Agentes IA llegue a ~65% sólido
