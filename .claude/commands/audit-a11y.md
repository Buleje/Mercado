---
description: Audit a11y WCAG 2.1 AA con axe-core sobre rutas críticas (storefront, marketplace, ofertas). Uso "/audit-a11y" o "/audit-a11y /admin"
allowed-tools: Bash(node scripts/dev-helpers/audit-a11y.mjs:*), Read(reports/a11y/*)
argument-hint: "[<rutas...>]"
---

Ejecutá `node scripts/dev-helpers/audit-a11y.mjs $ARGUMENTS` y reportá la tabla.

Si encontrás violaciones 🔴 critical o 🟡 serious:
1. Mostrar top 5 issues con `helpUrl` para que el usuario lea contexto
2. Sugerir invocar el agente `frontend` para fix automático sobre el componente afectado
3. Si hay >10 violaciones del mismo `id`, sugerir un codemod
