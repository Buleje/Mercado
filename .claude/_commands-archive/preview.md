---
description: Captura screenshot light + dark de cualquier ruta. Uso "/preview /marketplace/main" o "/preview /admin?tab=marketplace --auth"
allowed-tools: Bash(node scripts/dev-helpers/browse.mjs:*), Bash(mkdir -p reports/visual-verify/*), Read(*)
argument-hint: "<ruta> [--auth]"
---

## Flujo

1. Parsear `$ARGUMENTS`:
   - Primer token = ruta (ej. `/marketplace/main`)
   - Si contiene `--auth` → usar bandera (login qaadmin/main para rutas admin)
2. Crear directorio `reports/visual-verify/<timestamp-iso>/` con `mkdir -p`.
3. Capturar dos screenshots en paralelo (ambos `node scripts/dev-helpers/browse.mjs`):
   - `navigate <ruta>` + `screenshot light.png`
   - `navigate <ruta>` + `screenshot dark.png --dark`
4. Cerrar sesión: `node scripts/dev-helpers/browse.mjs close`.
5. Leer ambos PNGs con la herramienta Read y mostrarlos al usuario.
6. Reportar tabla:

| Theme | Tamaño | Path |
|---|---|---|
| light | XXX KB | reports/visual-verify/.../light.png |
| dark  | XXX KB | reports/visual-verify/.../dark.png |

Si falla, indicar fallback: `/health` para verificar que la ruta responde 200.
