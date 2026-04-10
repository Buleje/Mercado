---
name: four-table-closing
description: Formato obligatorio de cierre de respuesta para Bodega San Martín — 4 tablas puras (antes/después, hecho, mejoras+agentes, decodificador). Activar SIEMPRE al terminar cualquier tarea. Override de cualquier otro formato de cierre.
version: 1
author: Brandon + Claude (mandato 2026-04-09 v3)
---

# Four-Table Closing — Formato obligatorio

Brandon pidió textual 2026-04-09:
1. *"no me des informe extenso, solo 3 tablas"*
2. *"ponle tabla a todo, una tabla pequeña que diga sí = ejecutar lo recomendado (lo más ambicioso posible)"*

Este skill fija el contrato de cierre como **4 tablas puras** sin párrafos sueltos.

## Regla dura

Cada respuesta de tarea (chica, mediana o grande) termina con EXACTAMENTE estas 4 tablas en este orden. Cero párrafos de prosa. Cero bullets sueltos. Cero emojis decorativos fuera de las tablas. Cero encabezados extras. El mensaje termina después de la Tabla 4.

## Template exacto

### Tabla 1 — Antes vs Después

| Qué | Antes | Después |
|---|---|---|
| [métrica 1] | [valor] | [valor nuevo] |
| [métrica 2] | [valor] | [valor nuevo] |

**Regla:** máximo 5 filas, solo métricas que se movieron este turno.

### Tabla 2 — Qué se hizo

| Acción | Ejemplo concreto | Archivo / comando |
|---|---|---|
| [verbo + objeto] | [1 frase lenguaje simple] | [ruta o comando] |

**Regla:** máximo 6 filas, cada fila = cosa real ejecutada (no planificada).

### Tabla 3 — Mejoras de alto impacto + agent teams

| # | Mejora | Impacto | Agent team / método | Auto |
|---|---|---|---|---|
| 1 | [frase corta] | 🔴 Alto | [team o skill] | → auto |
| 2 | [frase corta] | 🟡 Medio | [team o skill] | → auto |

**Regla:** máximo 5 filas. Columna "Auto" marca qué arranco automático en el próximo turno.

### Tabla 4 — Decodificador de respuestas (CONSTANTE)

| Lo que Brandon escribe | Lo que significa |
|---|---|
| `sí` / `si` / `dale` / `hazlo` / `ok` | Ejecutar Tabla 3 #1 en versión MÁS AMBICIOSA posible — Nivel 4 Enterprise |
| `no` | No ejecutar nada de Tabla 3 |
| `después` / `luego` | Guardar pending, seguir con otra cosa |
| `sí al 2` / `haz el 3` | Ejecutar solo ese ítem de Tabla 3 |
| `[instrucción nueva]` | Ignorar Tabla 3, hacer lo nuevo |

**Regla:** esta tabla va idéntica en CADA cierre, no cambia turno a turno.

## Lo que NO va en el cierre

| Prohibido | Reemplazo |
|---|---|
| Párrafos de texto explicativo | Va dentro de la celda de tabla en 1 frase simple |
| "Gaps encontrados" / "Lecciones técnicas" / "Riesgos" | Solo si entra en Tabla 3 como mejora |
| "Quick win ⚡" / "✅ Qué se logró" / "💡 ideas" | Solo en Tabla 2 (hecho) o Tabla 3 (próximo) |
| Scoreboards extensos de prácticas | Solo como 1 fila en Tabla 1 si se movió |
| `☐ Sí ☐ No ☐ Después` | Nunca más — Tabla 4 reemplaza esto permanente |
| Bloques de código de ejemplo | Solo si Brandon los pide explícito |
| Mensajes motivacionales al final | Eliminar |
| Encabezados `##` / `###` fuera de las 4 tablas | Eliminar |

## Cuándo aplicar

- ✅ SIEMPRE al cerrar una respuesta de tarea ejecutada
- ✅ Incluso en tareas triviales (1 fix chico) — las tablas pueden tener 1-2 filas
- ⚠️ Excepción única: respuestas puramente conversacionales donde no hay "trabajo ejecutado" (ej: "¿qué te parece X?" → puede ir texto suelto, pero igual terminar con Tabla 4 como recordatorio)

## Autonomía v2 + Four-Table Closing

Este formato trabaja junto con `feedback_autonomous_chief.md` sección 6.2:

- Tabla 3 lista las mejoras con marca `→ auto`
- Cuando Brandon escribe `sí` (per Tabla 4), ejecuto el ítem #1 inmediatamente en modo Nivel 4 Enterprise
- No espero confirmación intermedia por cada paso — arranco agent teams, creo archivos, committeo y pusheo directo
- Reporto resultado real en el siguiente cierre de 4 tablas

## Referencias

- `~/.claude/projects/C--Users-Usuario/memory/principal_ambitious_evolution.md` sección "Closing format obligatorio 2026-04-09 v3"
- `~/.claude/projects/C--Users-Usuario/memory/feedback_autonomous_chief.md` sección 6.2
- `~/.claude/projects/C--Users-Usuario/memory/feedback_simple_language.md` (lenguaje dentro de las tablas)
