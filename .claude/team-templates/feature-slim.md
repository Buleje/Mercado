# Team Template: Feature Slim
# Tier: FEATURE (2-5 archivos, 1 area)
# Agentes: backend + frontend + tester
# Gates: lint + tsc + test (NO SLO pre-deploy para preview)
# Uso: Features tipicas de 1 sola area

## Dispatch (paralelo)
- backend O frontend (segun dominio): implementar
- tester: escribir tests DESPUES de implementacion

## Gates
- Post-impl: npm run lint && npx tsc --noEmit
- Post-test: npm run test (solo archivos tocados)
- NO canary para preview deploys
