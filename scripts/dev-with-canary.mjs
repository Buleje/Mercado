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
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const KEY = "BULEJE_APP_DATABASE_URL";

// ── Pre-flight: caché de Turbopack a medias ────────────────────────────────
// Si el dev anterior murió mientras emitía chunks, `app-paths-manifest.json`
// puede declarar una ruta como YA compilada sin que exista su `route.js`.
// Turbopack entonces no la recompila, no encuentra el chunk y Next cae al
// `not-found` → **404 silencioso** en algunas rutas /api mientras otras andan
// (bloqueó el login del panel el 2026-09-05). No aparece en ningún log y los
// gates estáticos pasan verdes, así que el único arreglo es detectarlo acá.
const DEV_SERVER_DIR = ".next/dev/server";
const APP_PATHS_MANIFEST = join(DEV_SERVER_DIR, "app-paths-manifest.json");

function purgeStaleDevCache() {
  if (!existsSync(APP_PATHS_MANIFEST)) return;

  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(APP_PATHS_MANIFEST, "utf8"));
  } catch {
    manifest = null; // manifest ilegible = caché a medias igual
  }

  const missing = [];
  if (manifest && typeof manifest === "object") {
    for (const [route, file] of Object.entries(manifest)) {
      if (typeof file !== "string") continue;
      if (!existsSync(join(DEV_SERVER_DIR, file))) missing.push(route);
    }
  }

  if (manifest && missing.length === 0) return;

  const detalle = manifest
    ? `${missing.length} ruta(s) sin chunk (ej. ${missing.slice(0, 3).join(", ")})`
    : "app-paths-manifest.json ilegible";
  console.log(`\x1b[33m[dev] ⚠️  Caché Turbopack stale: ${detalle}.\x1b[0m`);
  try {
    rmSync(".next/dev", { recursive: true, force: true });
    console.log("\x1b[33m[dev] 🧹 .next/dev limpiado — el primer compile va a tardar más.\x1b[0m");
  } catch (err) {
    console.log(`\x1b[31m[dev] no pude limpiar .next/dev: ${err.message}\x1b[0m`);
  }
}

purgeStaleDevCache();

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
