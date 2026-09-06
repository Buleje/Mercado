---
name: rag-search
description: Búsqueda semántica del repo Buleje vía Qdrant local. Activar cuando Brandon pregunte "donde está X funcional", "qué archivos hacen Y", "encontrame todo lo de Z", "busca semántico", "rag search". Mejor que grep para queries conceptuales (no keyword exacto).
model: sonnet
argument-hint: "[query semántica]"
allowed-tools: Bash, Read, Grep, Glob
---

# RAG Search — Búsqueda semántica local

Vector DB Qdrant + embeddings `Xenova/all-MiniLM-L6-v2` (384 dim, CPU).
Collection `buleje-code` con todos los .ts/.tsx/.js/.md del repo.

---

## Cuándo usar (trigger automático)

Brandon dice cualquiera de estas:
- "donde está X funcional"
- "qué archivos hacen Y"
- "encontrame todo lo de Z"
- "busca semántico"
- "donde manejamos checkout/auth/multi-tenant/etc"
- "rag search"

Responder con: una llamada a search.mjs + presentar resultados en tabla.

---

## Cuándo NO usar (preferir grep/rg)

- Búsqueda de keyword exacto (`tenantId`, `function checkout`)
- Búsqueda de import específico
- Búsqueda de typo o string literal
- Para esos casos: `rg "patrón"` es 10x más rápido y exacto

---

## Workflow

```bash
# 1. Qdrant está APAGADO por default (2026-09-03: 337 MB de RAM por 1 uso al mes).
#    Se prende a demanda con el unit de systemd (sudo sin password en esta WSL):
curl -s http://127.0.0.1:6333/healthz || sudo systemctl start qdrant
#    Al terminar la ronda de búsquedas, apagarlo de nuevo: sudo systemctl stop qdrant

# 2. Búsqueda
node ~/.local/qdrant/rag/search.mjs "query semantic" 10
```

Output JSON:
```json
[
  { "rank": 1, "score": 0.78, "path": "lib/checkout/...", "chunk": 0, "preview": "..." },
  ...
]
```

---

## Re-indexar (cuando el repo cambia mucho)

```bash
cd ~/.local/qdrant/rag && nohup node index.mjs > /tmp/rag-index.log 2>&1 &
# Tail del progreso:
tail -f /tmp/rag-index.log
```

Tarda 5-10 min en CPU. Idempotente: usa hash del path como point ID.

---

## Buenas prácticas

- **Combinar con grep**: RAG da archivos relacionados, grep confirma keyword exacto.
- **TopK típico**: 5-10. Más resultados = más ruido.
- **Score interpretation**: >0.7 muy relevante, 0.5-0.7 ok, <0.5 ruido.
- **Re-index**: si tocamos >50 archivos en una sesión, re-index al final.

---

## Ejemplos reales para Buleje

| Query | Lo que probablemente devuelve |
|---|---|
| `"how to handle multi-tenant in queries"` | `lib/db/*.db.ts` files con `tenantId` first arg |
| `"checkout flow with cart"` | `components/checkout/*`, `lib/db/orders.db.ts` |
| `"WhatsApp AI handler"` | `lib/whatsapp/concierge/*` |
| `"Yape vision payment approval"` | `lib/ai/yape-vision.ts`, `app/api/whatsapp/yape-capture` |
| `"sidebar reorder admin"` | `SettingsModule.tsx`, `SidebarReorderPanel.tsx` |

---

## Anti-patterns

| ❌ NO hacer | ✅ En su lugar |
|---|---|
| Usar RAG para `git grep` | `rg "pattern"` directo |
| Ignorar score | Filtrar resultados con score < 0.5 |
| Indexar node_modules | Ya está en SKIP_DIRS |
| Re-index en cada sesión | Solo si Brandon dice "re-index" o si hay >50 archivos cambiados |
