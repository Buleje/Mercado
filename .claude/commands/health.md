---
description: Smoke check rápido del dev server (rutas + logs + N+1) en 1 paso
allowed-tools: Bash(node scripts/dev-helpers/health.mjs)
---

Ejecutá `node scripts/dev-helpers/health.mjs` y reportá la salida. Si hay errores o rutas en rojo, propóné el siguiente paso (revisar log completo, reiniciar dev, fixear queries N+1). Si todo verde, una línea: "✅ Healthy" + N+1 count si > 0.
