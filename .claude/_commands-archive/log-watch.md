---
description: Monitor en tiempo real del dev server log buscando errores, warnings, y N+1. Brandon recibe notificación por cada evento crítico.
allowed-tools: Bash(tail:*), Bash(grep:*)
---

Lanzá un Monitor con esta config:

```
description: "Errores y warnings en dev server log"
timeout_ms: 1800000  (30 min)
persistent: false
command: |
  tail -F /tmp/dev-server.log 2>&1 | grep --line-buffered -E "\\[ERROR\\]|⨯|❌|TypeError|SyntaxError|Cannot find|N\\+1 DETECTED|\\[WARN\\]|HTTP 5[0-9][0-9]|HTTP 4[0-9][0-9].*proxy"
```

Cada línea coincidente llega como notificación al chat sin que el usuario tenga que pedir nada. Cuando detectes una nueva línea:
1. Si es `[ERROR]` / `TypeError` / `SyntaxError` → mostrar y proponer acción inmediata.
2. Si es `N+1 DETECTED` → agregar a `project_n1_known_patterns.md` si no está ya.
3. Si es `HTTP 5xx` → invocar `/health` para confirmar y diagnosticar.

El Monitor NO se reinvoca solo. Cuando termine (timeout o stop), reportar resumen.
