---
name: ajustes-por-persona-sin-schema
description: Dónde guardar preferencias POR USUARIO del panel sin tocar schema (no hay tabla UserSetting); admin_prefs con subclave por persona
metadata:
  type: project
---

No existe tabla de ajustes por usuario. Lo por-persona del panel va en `Settings.featureFlagsJson.admin_prefs`
(por negocio) con una subclave por persona: Drive usa `driveFijados:<usuario>`; recientes y vistas guardadas
(17-10) usan `panel:<encodeURIComponent(usuario)>:<clave>` vía `/api/admin/preferences/panel` + cliente
`lib/admin/guardado-servidor.ts` (`leerDelServidor` / `subirAlServidor(quien, clave, lista, demoraMs)`).

**Why:** la noche 17-10 prohibía schema; `AdminPreferencesDB.write` mezcla por subclave en una sentencia, así que
dos pantallas/personas no se pisan. `MODERATE` (20 cada 5 min) se queda corto para algo que sube al navegar: GENEROUS.

**How to apply:** para «que me siga a otra computadora», sumar una clave al regex de la ruta y llamar al cliente;
no inventar tabla. Pendiente: `components/admin/einvoice/use-vistas-guardadas.ts` (Comprobantes) sigue sólo en
localStorage; «borrar recientes» en una PC lo revive la otra al unir (no hay marca de borrado).
