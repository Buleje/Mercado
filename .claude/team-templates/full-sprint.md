# Team Template: Full Sprint
# Tier: INITIATIVE (5+ archivos, 2+ areas)
# Pipeline: Director -> BUILD Hub -> QUALITY Hub -> OPS Hub
# Gates: Completos entre cada Hub
# Uso: Modulos nuevos, refactors mayores, features cross-layer

## Pipeline Streaming
1. BUILD: architect -> (backend + frontend + database + integrator en paralelo)
2. Gate: npm run lint && npx tsc --noEmit
3. QUALITY: reviewer + tester + security + data-qa
4. Gate: npm run test && npm run build
5. OPS: deployer (canary 5%->25%->100%)
6. Gate: CWV + cost check

## Reglas
- Features individuales avanzan al siguiente Hub sin esperar batch
- Fallo en gate -> healer intenta 3x -> back to BUILD si falla
- Director Opus coordina, NO implementa
