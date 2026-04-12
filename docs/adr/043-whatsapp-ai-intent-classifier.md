# ADR 043 — WhatsApp AI Intent Classifier

**Estado:** Implementado + test cobertura
**Fecha:** 2026-04-10
**Autor:** Claude (ingeniero-jefe) — sesion `luis` modo maximo
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #6 — ROI "doblar GMV teorico" via compradores frecuentes

---

## Contexto

`lib/whatsapp/conversation-engine.ts` existe y maneja una state machine determinista con palabras clave (CATALOGO, PRECIO, QUIERO, CONFIRMO). Funciona, pero el cliente promedio escribe frases naturales como:

- "Buenas, me mandas 2 kilos de arroz y 3 aceites"
- "Hola y cuanto cuesta el atun gloria?"
- "Ya llego mi pedido?"
- "Prefiero hablar con alguien"

El parser por palabras clave cae en esos casos y el cliente termina en "no entendi, escribe AYUDA".

## Decision

Agregar una capa LLM **orthogonal** al state machine, NO un reemplazo. El clasificador LLM:

1. Recibe el mensaje en texto libre
2. Devuelve un JSON estructurado: `{ intent, confidence, items?, productQuery? }`
3. Si `confidence >= 0.6` y `intent != "desconocido"` -> el caller enruta al handler adecuado
4. Si no -> cae al state machine existente, **sin regresion**

### Archivos creados

| Archivo | Proposito |
|---------|-----------|
| `lib/whatsapp/ai-intent.ts` | `classifyWhatsappIntent` + `shouldTrustAi` + zod schema |
| `__tests__/whatsapp-ai-intent.test.ts` | 8 tests (valido, sin JSON, schema fail, throw, limites) |

### Modelo usado

`chatModel` (Haiku 4.5 via lib/ai/provider.ts) — la clasificacion es una tarea simple + alto volumen, asi que usamos el modelo mas barato. Presupuesto: `maxOutputTokens: 300`.

### Fallback garantizado

Si cualquier cosa falla (network, JSON invalido, schema mismatch, throw) la funcion retorna `{ intent: "desconocido", confidence: 0 }`. El `conversation-engine` ve "desconocido" y cae al handler `formatWelcomeMenu` existente. Zero downtime risk.

### Integracion futura (siguiente sesion)

Ampliar `conversation-engine.ts` para llamar `classifyWhatsappIntent` como primer paso cuando el mensaje no matchea ninguna palabra clave existente. Pseudo:

```ts
if (matchesKeyword(msg)) return handleKeyword(msg);
const ai = await classifyWhatsappIntent(msg);
if (shouldTrustAi(ai)) return handleIntent(ai);
return handleUnknown(msg);
```

Esta integracion se deja para un commit separado — este ADR solo instala la capa LLM y su test suite.

## Alternativas evaluadas

1. **Reemplazar el state machine entero** — descartado: risk enorme y el state machine ya funciona para 80% de casos.
2. **Regex + ML ligero (fastText)** — descartado: requiere entrenar y mantener un modelo local. El LLM con un prompt de 20 lineas alcanza sin infra.
3. **Usar Dialogflow / Rasa** — descartado: dependencia externa, costo, y no tenemos grounding al catalogo del tenant.

## Consecuencias

### Positivas
- Cliente puede escribir en lenguaje natural
- Zero regresion: el state machine sigue intacto
- El LLM se llama solo cuando el state machine no reconoce -> costo contenido
- Facil extender intents (agregar al enum zod)

### Negativas / riesgos
- Costo: ~$0.0001 por mensaje clasificado (Haiku 4.5). A 10k mensajes/mes por tenant = ~$1/mes
- Latencia: ~400ms extra cuando se llama el LLM
- Dependencia de `ANTHROPIC_API_KEY` — fallback a "desconocido" si falta

### Seguridad
- `maxOutputTokens: 300` previene prompt injection que infle la respuesta
- Zod schema valida estricto — intents fuera del enum caen a "desconocido"
- Limite de 500 chars en el mensaje input — mensajes mas largos rechazados sin llamar al LLM

## Referencias

- `lib/whatsapp/conversation-engine.ts` — state machine existente (no tocado)
- `lib/whatsapp/message-templates.ts` — formatters de respuestas
- ADR 016 — plan maestro 24 semanas (Tier S item #6)
- ADR 041 — Sprint 2 kickoff
- CLAUDE.md regla #2 (safeParse obligatorio), regla #7 (fire-and-forget para no bloquear)
