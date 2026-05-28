# Rubrics — calificaciones verificables para outcome-evaluator

Cada `.json` define criterios bash-verificables para una capa de la app.

| Archivo | Aplica a | Skills que lo usan |
|---|---|---|
| `api-endpoint.json` | `app/api/**/route.ts` | outcome-evaluator, verify |
| `db-class.json` | `lib/db/**/*.db.ts` | outcome-evaluator |
| `prisma-migration.json` | `prisma/migrations/**/migration.sql` | outcome-evaluator, migration-planner |
| `ui-component.json` | `components/**/*.tsx` | outcome-evaluator, bsm-typography-rules |

## Formato

```jsonc
{
  "name": "...",
  "version": 1,
  "applies_to": "<glob>",
  "criteria": [
    {
      "id": "<slug>",
      "weight": "critical | high | medium | low",
      "check_bash": "<comando que devuelve 0 si pasa, 1 si falla>",
      "fail_msg": "<explicación + cómo arreglar>"
    }
  ],
  "pass_threshold": {
    "critical_pct": 100,   // 100% críticos deben pasar
    "high_pct": 80,
    "medium_pct": 60
  }
}
```

## Reglas

1. `check_bash` debe ser **idempotente** y **no destructivo** (solo lectura/grep).
2. `$FILE` es la variable inyectada con el path del archivo evaluado.
3. `weight: critical` = bloquea pass aunque pase todo lo demás.
4. `fail_msg` debe incluir **cómo arreglar**, no solo "está mal".

## Generación automática (idea futura)

Hook `post-edit-rubric-check.mjs` que corre la rubric correspondiente cada vez que se edita un archivo cubierto. Reporta inline si falla algo crítico.
