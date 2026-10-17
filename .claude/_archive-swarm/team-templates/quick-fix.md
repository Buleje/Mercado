# Team Template: Quick Fix
# Tier: HOTFIX (1 archivo, <20 lineas)
# Agentes: healer solo
# Gates: lint + tsc only (NO SLO, NO canary, NO DR)
# Uso: Errores de lint, tsc, test failures simples

## Dispatch
- healer: fix directo, max 3 intentos
- Si falla 3x: escalar a Brandon

## Skip
- NO Agent Team (subagente directo)
- NO Hub pipeline
- NO pre-deploy gates
- NO Director overhead
