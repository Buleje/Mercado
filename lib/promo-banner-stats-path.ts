import "server-only";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Ruta del archivo de stats de banners (impresiones/clicks).
 *
 * Brandon 2026-06-12: ANTES vivía en `lib/data/promo-banner-stats.json` —
 * dentro del árbol que Turbopack vigila. Cada impresión (que ocurre en CADA
 * carga del home por el banner hero) reescribía ese archivo → Turbopack
 * disparaba un Fast Refresh → tormenta de recompilaciones que inflaba la RAM
 * del dev-server (vimos next-server a 7.5 GB) y CONGELABA WSL (terminal sin
 * scroll). Moviéndolo a `os.tmpdir()` el write deja de tocar el source tree:
 * cero Fast Refresh por analytics. Bonus: en Vercel `process.cwd()` es
 * read-only y `/tmp` sí es escribible, así que también es más correcto en prod
 * (sigue siendo MVP efímero; la migración a tabla con increment atómico está
 * anotada en project_banners_v2).
 */
export const PROMO_BANNER_STATS_PATH = join(tmpdir(), "buleje-promo-banner-stats.json");
