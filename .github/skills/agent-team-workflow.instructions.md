---
applyTo: "**/*"
---

# Agent Team Workflow — Flujo de Trabajo Permanente

Este proyecto tiene habilitado **Agent Teams** (experimental de Anthropic).
Para tareas complejas que involucren 2+ áreas, SIEMPRE proponer crear un Agent Team.

## Cuándo proponer Agent Team

| Situación | Acción |
|-----------|--------|
| Tarea toca 1 archivo/área | Subagent normal (Agent tool) |
| Tarea toca 2-3 archivos independientes | Agent Team con 2-3 teammates |
| Feature nueva completa (API + UI + tests) | Agent Team con 3-5 teammates |
| Debugging con múltiples hipótesis | Agent Team con 3 investigadores |
| Code review multi-perspectiva | Agent Team con 3 reviewers |

## Estructura estándar del equipo

```
Team Lead (tú) — coordina, no implementa
├── Teammate backend — API, DB, auth
├── Teammate frontend — UI, componentes, estilos
├── Teammate qa — tests, verificación
├── Teammate [especialista] — según necesidad
└── Task list compartida — 5-6 tareas por teammate
```

## Reglas de coordinación

1. **No hacer el trabajo tú mismo** — delega a teammates
2. **Archivos separados** — cada teammate trabaja en archivos diferentes
3. **Contexto completo** — incluir rutas, patrones, y reglas del proyecto en el prompt de spawn
4. **Esperar resultados** — no avanzar hasta que teammates terminen
5. **Sintetizar** — resumen ejecutivo al final

## Prompt template para teammates

Siempre incluir en el prompt de cada teammate:
- Ruta del proyecto: `c:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2/buleje`
- Reglas: safeParse, tenantId, lib/db/, force-dynamic
- Archivos específicos que debe tocar
- Patrón a seguir (archivo de referencia existente)
- Entregable esperado

## Comando rápido

El usuario puede invocar `/agent-team [descripción de la tarea]` para iniciar un equipo.

## Fallback a subagentes

Si Agent Teams no está disponible o la tarea es simple, usar el sistema de subagentes (Agent tool) con los 18 agentes definidos en `.claude/agents/`.
