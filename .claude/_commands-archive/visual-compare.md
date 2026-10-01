---
description: Compara la captura actual de una ruta contra el baseline persistido. Uso "/visual-compare /marketplace/main"
allowed-tools: Bash(node scripts/dev-helpers/browse.mjs:*), Bash(node scripts/visual-diff.mjs:*), Bash(mkdir -p reports/visual-baselines/*), Read(*)
argument-hint: "<ruta> [--auth]"
---

## Flujo

1. Parsear `$ARGUMENTS` igual que `/preview`.
2. Slug de la ruta = sanitización de `/` y `?` a `-`. Ej: `/admin?tab=marketplace` → `admin-tab-marketplace`.
3. Path del baseline: `reports/visual-baselines/<slug>-<theme>.png` (light + dark).
4. Para cada theme (light, dark):
   a. Si NO existe baseline → tomar screenshot y guardarlo como baseline. Reportar "baseline created".
   b. Si EXISTE baseline → tomar screenshot a `/tmp/current-<theme>.png` y correr `node scripts/visual-diff.mjs <baseline> <current> /tmp/diff-<theme>.png`. Parsear el JSON de salida (verdict / pct).
5. Reportar tabla:

| Theme | Verdict | Pct cambio | Diff path |
|---|---|---|---|
| light | ok / minor-change / major-change | X.XXX% | reports/.../diff-light.png |
| dark  | ... | ... | ... |

Si verdict ≠ "ok", mostrar el PNG diff con Read tool.

Si el usuario quiere "actualizar baseline": ejecutar `cp /tmp/current-<theme>.png reports/visual-baselines/<slug>-<theme>.png` para cada theme.

Cerrar sesión browse al final.
