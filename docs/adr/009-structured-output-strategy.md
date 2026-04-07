# ADR-009: Estrategia de structured output para endpoints LLM

## Estado
Propuesta (basada en spike ejecutado 2026-04-06)

## Fecha
2026-04-06

## Contexto

El Excel Agentes IA (`Mejores_Practicas_Agentes_IA.xlsx`, práctica #9) exige **salida estructurada (JSON/YAML)** en todas las respuestas del LLM para que el frontend consuma los datos sin parsing frágil de texto.

Hoy el proyecto usa **Groq** (`llama-3.3-70b-versatile`) para casi todas las llamadas LLM (`app/api/ai-assistant/*`, `lib/whatsapp-ai.ts`, `app/api/chat/auto-reply/*`, `app/api/promotions/ai-*`, `app/api/demand-prediction/*`, `app/api/ocr/invoice/*`, `app/api/pos/voice-interpret/*`). Ninguno usa `response_format: {type: "json_object"}`.

La pregunta es: ¿cómo implementamos la práctica #9 sin romper los endpoints que usan `tools` (function calling) ni los que usan streaming?

## Hallazgos del spike (2026-04-06)

Se ejecutó un script (`scripts/spike-llama4-scout.ts`, ya eliminado) contra la API real de Groq con `meta-llama/llama-4-scout-17b-16e-instruct`:

| Test | Resultado |
|---|---|
| A. Tools solo | ✅ 559ms, tool_calls devueltos correctamente |
| B. `response_format: json_object` solo | ✅ 328ms, JSON válido |
| **C. Tools + `response_format: json_object`** | ❌ **HTTP 400:** `"json mode cannot be combined with tool/function calling"` |
| D. Tools + streaming | ✅ (llama-4-scout habilita esto, llama-3.3 no) |

**Conclusión del spike:** la incompatibilidad `tools + json_object` es una **limitación arquitectónica de Groq como plataforma**, no del modelo. Migrar de llama-3.3 a llama-4-scout, gpt-oss-20b, o cualquier otro modelo de Groq **no desbloquea** la combinación.

Memoria guardada: `~/.claude/memory/reference_groq_platform_limits.md` con la tabla de compatibilidad verificada.

## Opciones consideradas

### Opción A: Migrar modelo de tool-calling a llama-4-scout para habilitar json_object
- ❌ **DESCARTADA por el spike.** Groq devuelve HTTP 400 en cualquier modelo cuando `tools` y `response_format` coexisten.
- ✅ Beneficio lateral: llama-4-scout sí habilita `tools + streaming` (mejora UX independiente, ver ADR futuro).

### Opción B: Prompt-based JSON enforcement + parsing robusto con fallback
- ✅ Costo cero — solo cambia el system prompt y agrega un `try/catch JSON.parse` con fallback.
- ✅ Funciona con Groq + tools sin cambios de API.
- ✅ ~80% efectivo en producción (validado por patrones como OpenAI GPT-3.5 antes de que tuvieran JSON mode).
- ❌ No es 100% garantizado — el LLM puede devolver texto malformado en queries edge.
- ❌ Requiere wrapper de parsing en cada consumer.

**Patrón propuesto:**
```ts
// En el system prompt:
"Responde SIEMPRE en JSON válido con este schema: {status, message, data?}. No añadas markdown ni texto fuera del JSON."

// En el consumer:
function safeParseJSON<T>(raw: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; raw: string } {
  try {
    // Strip markdown code fences si aparecen
    const clean = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(clean);
    const result = schema.safeParse(parsed);
    return result.success ? { ok: true, data: result.data } : { ok: false, raw };
  } catch {
    return { ok: false, raw };
  }
}
```

### Opción C: Migrar endpoints que necesiten JSON 100% garantizado a Claude/OpenAI directo
- ✅ Structured outputs 100% garantizados (Claude y OpenAI tienen `strict: true` con schemas Zod/JSON).
- ✅ No toca el tooling de Groq (que se mantiene como default barato).
- ❌ Alto costo operativo: nuevo SDK, nueva API key, nuevo rate limiting, nueva tracking de costo.
- ❌ ~10x más caro por llamada que Groq en los mismos modelos.
- ❌ Solo justifica para endpoints donde el JSON garantizado es correctness crítica (ej: parser de facturación SUNAT, API pública con schema estricto).

### Opción D: Segundo pass — primer call con tools, segundo call con json_object
- ✅ Ambas capacidades simultáneas sin cambiar provider.
- ❌ +50-100% latencia (dos llamadas en secuencia).
- ❌ +40% costo.
- ❌ Complejidad en el orchestrator.

## Decisión

**Opción B (prompt-based JSON enforcement) como default para TODOS los endpoints Groq con tools.** Utilizar Opción C (Claude/OpenAI directo) **solo cuando aparezca un endpoint donde el JSON garantizado sea correctness crítica**, no para endpoints exploratorios o conversacionales.

### Criterio explícito para justificar Opción C
Un endpoint califica para migración a Claude/OpenAI si cumple **al menos 2** de estos 3 requisitos:
1. La respuesta se consume programáticamente (no se muestra al usuario como texto)
2. Un JSON malformado causa una falla funcional del sistema (no solo una UI fea)
3. El endpoint tiene >1000 req/día y el costo adicional del provider externo se justifica por el valor del JSON garantizado

**Ningún endpoint actual califica.** Todos los endpoints de `ai-assistant/*` devuelven texto al usuario final. `ocr/invoice` y `pos/voice-interpret` ya devuelven JSON pero el parser tolera fallos con fallback.

## Consecuencias

### Positivas
- **Desbloquea la práctica #9** del Excel Agentes IA en 80% con cero costo de provider nuevo.
- Permite mantener Groq como default (rápido y barato).
- Pattern reutilizable (`safeParseJSON` helper) en cualquier endpoint futuro.
- Cuando aparezca un endpoint crítico, el criterio para escalar a Opción C está escrito.

### Negativas
- 80% de efectividad significa que ~1 de cada 5 respuestas en casos edge puede fallar el parse. El fallback debe ser visible (logear + mostrar texto raw al usuario como última opción).
- No mueve la práctica #9 a ✅ perfecto, la mueve a ⚠️ parcial en el Excel Agentes IA (+0.5 práctica, de 55.4% → 57.1% sólido).

### Riesgos
- **Prompt injection + JSON malformation:** un usuario podría forzar respuesta no-JSON con inputs especiales. Mitigación: `buildInjectionGuard()` ya existe + validación Zod en el parse.
- **Drift silencioso:** si alguien cambia el system prompt y elimina la instrucción JSON, el parse falla en prod. Mitigación: agregar un test unitario que verifique que el prompt incluye "Responde SIEMPRE en JSON".

## Implementación pendiente (no ejecutada en este ADR)

Este ADR es estrategia, no código. La implementación concreta requiere una sesión dedicada:

1. Crear `lib/ai-json-parser.ts` con el helper `safeParseJSON<T>` tipado con Zod.
2. Actualizar los system prompts de los endpoints que necesiten JSON (decidir cuáles en función de si su respuesta se renderiza como texto o se parsea).
3. Candidatos prioritarios (endpoints que devuelven datos estructurados, no chat):
   - `app/api/demand-prediction/route.ts` — ya retorna JSON en el prompt, formalizar
   - `app/api/promotions/ai-suggest/route.ts` — retorna 5 promos, formalizar schema
   - `app/api/ocr/invoice/route.ts` — retorna campos estructurados, formalizar
4. Agregar test unitario que valide el system prompt contiene "JSON válido".
5. Actualizar `TD-022` en `docs/TECH-DEBT.md` con estado final.
6. Mover práctica #9 del Excel Agentes IA de ❌ a ⚠️ en el scoreboard del superadmin.

## Referencias

- Spike script: eliminado post-spike, hallazgos en `~/.claude/memory/reference_groq_platform_limits.md`
- Groq docs structured outputs: https://console.groq.com/docs/structured-outputs
- Excel: `Mejores_Practicas_Agentes_IA.xlsx` práctica #9 "Salida estructurada (JSON/YAML)"
- TECH-DEBT: TD-022
