---
name: optimize-context
description: |
  Escanea los 20+ archivos de memoria actual y consolida información
  redundante para liberar ventana de contexto. Detecta memorias
  obsoletas, duplicadas o que pueden fusionarse.
  Usar cuando Brandon diga "optimiza memorias", "limpiá memoria",
  "optimize context", "reduce memorias", "consolida memorias".
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob
argument-hint: "[scan | consolidate | prune | report]"
model: sonnet
---

# Optimize Context — Consolidación de memorias

Escanea y optimiza el sistema de memorias persistentes para maximizar
la ventana de contexto disponible.

## Subcomandos

### `/optimize-context scan` (default)

```
1. Leer MEMORY.md (índice)
2. Leer CADA archivo de memoria referenciado
3. Para cada memoria calcular:
   - Tamaño en líneas
   - Fecha de última actualización (frontmatter o git blame)
   - Tipo (user/feedback/project/reference)
   - ¿Sigue siendo relevante? (verificar contra estado actual)
4. Detectar:
   a. Memorias duplicadas (>70% contenido similar)
   b. Memorias obsoletas (info ya no válida)
   c. Memorias que pueden fusionarse (mismo tema)
   d. Memorias demasiado largas (>50 líneas)
5. Reportar con recomendaciones
```

### `/optimize-context consolidate`

```
1. Ejecutar scan
2. Para cada par de memorias duplicadas/fusionables:
   a. Crear versión consolidada
   b. Eliminar la redundante
   c. Actualizar MEMORY.md
3. Para memorias demasiado largas:
   a. Extraer las líneas esenciales
   b. Reescribir versión compacta
4. Reportar cambios realizados
```

### `/optimize-context prune`

```
1. Ejecutar scan
2. Para cada memoria marcada como obsoleta:
   a. Verificar que info ya no es relevante (leer archivo/code actual)
   b. Si confirmado obsoleto → eliminar archivo + entrada en MEMORY.md
   c. Si parcialmente obsoleto → actualizar contenido
3. Reportar memorias eliminadas/actualizadas
```

### `/optimize-context report`

```
1. Contar memorias por tipo
2. Calcular tamaño total (líneas + chars estimados como tokens)
3. Estimar % de ventana de contexto que ocupan las memorias
4. Reportar en tabla
```

## Formato de salida

```markdown
## 🧠 Memory Optimization Report — [fecha]

### Estado actual
| Tipo | Cantidad | Líneas totales | Tokens aprox |
|---|---|---|---|
| user | N | X | ~Y |
| feedback | N | X | ~Y |
| project | N | X | ~Y |
| reference | N | X | ~Y |
| **Total** | **N** | **X** | **~Y** |

### Hallazgos
| Tipo | Memoria | Problema | Acción recomendada |
|---|---|---|---|
| 🔴 Obsoleta | project_X.md | Info de sprint pasado | Eliminar |
| 🟡 Duplicada | feedback_A + feedback_B | 80% overlap | Fusionar |
| 🟡 Larga | principal_ambitious.md | 29KB | Compactar |

### Ahorro estimado
- Líneas eliminables: X
- Tokens liberados: ~Y
- % de contexto recuperado: Z%
```

## Reglas

1. **Nunca eliminar sin verificar** — leer el archivo real antes de declarar obsoleto.
2. **Conservar memorias de feedback** — son las más valiosas (cómo trabaja Brandon).
3. **No perder información única** — si una memoria tiene 1 dato único, mantenerlo.
4. **Actualizar MEMORY.md** después de cada cambio.
5. **Preferir consolidar sobre eliminar** — fusionar > borrar.

## Referencia

- Directorio de memorias: `~/.claude/projects/C--Users-Usuario/memory/`
- Índice: `MEMORY.md`
- Skill complementario: `/token-optimizer` — optimiza contexto de sesión (no memorias)
