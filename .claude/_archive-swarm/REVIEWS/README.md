# REVIEWS/ — Peer reviews cruzados (reviewer output)

El agente `reviewer` genera un review por frente al cerrar cada ola.
El merge a main se bloquea si hay hallazgos BLOCKER.

## Formato

```
REVIEWS/ola-{N}-{frente}-review.md
```

Ejemplo: `ola2-frente-back-review.md`

## Severidades

| Nivel | Accion |
|-------|--------|
| BLOCKER | Merge bloqueado hasta fix |
| MAJOR | Fix requerido antes de merge |
| MINOR | Opcional, documentar |
| NOTE | Solo informativo |

## Veredictos posibles

- **APPROVE** — sin blockers ni majors, safe to merge
- **CHANGES_REQUESTED** — majors presentes, fix y re-review
- **BLOCK** — blockers presentes, no mergear bajo ningun concepto
