---
description: Resumen ejecutivo del estado actual del worktree (cambios sin commit, branch, último commit, tests pendientes)
allowed-tools: Bash(git status), Bash(git log:*), Bash(git diff:*), Bash(wc:*), Bash(grep:*)
---

Ejecutá en paralelo y armá una tabla compacta:

1. `git status --short` — listado de archivos dirty
2. `git log -5 --oneline` — últimos 5 commits
3. `git diff --stat` y `git diff --stat --cached` — resumen de líneas cambiadas (unstaged + staged)
4. `git rev-list --count HEAD..@{u} 2>/dev/null || echo 0` — commits pendientes de push (si hay upstream)
5. Conteo de archivos por tipo: `git status --short | awk '{print $NF}' | grep -oE '\.[a-z]+$' | sort | uniq -c`

**Output**: ≤120 palabras + tabla. Indicá riesgos (zona peligrosa tocada → schema.prisma, lib/db/orders.db.ts, lib/auth/role-permissions.ts, components/checkout/**) en rojo.

Si hay >50 archivos dirty: sugerí `/commit` o agrupar en commits semánticos.
