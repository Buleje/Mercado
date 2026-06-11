#!/usr/bin/env node
/**
 * dev-with-canary.mjs — lanza `next dev` y, si encuentra la credencial del rol
 * runtime `buleje_app` (RLS sin BYPASSRLS, TD-116), hace que SOLO el dev server
 * conecte con ese rol. Las políticas RLS quedan así activas en desarrollo
 * (canary fijo, Brandon 2026-06-10).
 *
 * Importante: el override es LOCAL al proceso del dev server. NO cambia
 * DATABASE_URL para el resto del sistema (db:seed, prisma migrate, scripts) —
 * esos siguen conectando como `postgres` (con BYPASSRLS), que es lo correcto
 * para sembrar/migrar viendo todas las filas.
 *
 * Orden de búsqueda de la credencial (`BULEJE_APP_DATABASE_URL`):
 *   1. variable de entorno del shell
 *   2. .env.local            (persistente, gitignored — recomendado)
 *   3. /tmp/buleje_app.env   (fallback de sesión; se pierde al reiniciar la máquina)
 *
 * Para hacerlo 100% persistente (sobrevive reinicios de WSL), agregá la línea
 * `BULEJE_APP_DATABASE_URL=...` a .env.local. Para DESACTIVAR el canary, borrá
 * esa línea (y el archivo /tmp/buleje_app.env) → el dev vuelve a `postgres`.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const KEY = "BULEJE_APP_DATABASE_URL";

function fromFile(path) {
  if (!existsSync(path)) return null;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const m = raw.match(new RegExp(`^\\s*${KEY}\\s*=\\s*(.+?)\\s*$`));
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) return v;
  }
  return null;
}

const env = { ...process.env };
const canaryUrl =
  process.env[KEY] || fromFile(".env.local") || fromFile("/tmp/buleje_app.env");

if (canaryUrl) {
  env.DATABASE_URL = canaryUrl;
  const role = (canaryUrl.match(/\/\/([^:]+):/) || [])[1] ?? "?";
  console.log(`\x1b[36m[dev] 🔒 Canary RLS activo — dev server conecta como '${role}' (sin BYPASSRLS).\x1b[0m`);
} else {
  console.log("[dev] DATABASE_URL normal (sin canary). Para activar: BULEJE_APP_DATABASE_URL en .env.local.");
}

const bin = process.platform === "win32" ? "node_modules\\.bin\\next.cmd" : "node_modules/.bin/next";
const child = spawn(bin, ["dev", "--turbopack"], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
