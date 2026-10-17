/**
 * El Chromium de Playwright más nuevo que haya en la caché, o `null`.
 *
 * El build estaba clavado en `chromium-1208`: cuando el repo movió
 * `playwright-core`, la caché quedó con 1223/1226 y TODO screenshot empezó a
 * fallar con "executable doesn't exist" — el skill `/preview` dejó de servir
 * sin que nada lo avisara. Una ruta con número de versión adentro es una bomba
 * de tiempo: se resuelve el directorio, no se escribe.
 *
 * Lo usan `browse.mjs` y `qa-capturas.mjs`.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export function resolverChromium() {
  const base = path.join(process.env.HOME ?? "", ".cache/ms-playwright");
  const candidatos = ["chrome-linux64/chrome", "chrome-linux/chrome"];
  let dirs = [];
  try {
    dirs = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  } catch {
    dirs = [];
  }
  for (const d of dirs) {
    for (const c of candidatos) {
      const p = path.join(base, d, c);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
