#!/usr/bin/env node
/**
 * Corre cualquier comando de Prisma contra el **SESSION pooler** de Supabase.
 *
 * Por qué existe (medido 2026-09-20):
 *
 * 1. `DIRECT_URL` (`db.<proj>.supabase.co:5432`) **no resuelve por DNS** desde
 *    esta red: `ENOTFOUND` en 111 ms. Todo el flujo documentado que dependía de
 *    él está muerto acá.
 * 2. `DATABASE_URL` apunta al pooler en **:6543 (modo transaction)**. Ahí el
 *    schema engine muere con `prepared statement "s0" does not exist`.
 * 3. El **mismo host** del pooler en **:5432 es modo session**: es IPv4 (o sea
 *    resuelve) y sí sostiene prepared statements. Probado reusando un statement
 *    con nombre dos veces + `prisma migrate status` completo.
 *
 * O sea: no hacía falta DIRECT_URL, hacía falta el puerto correcto.
 *
 * No se usa `eval $(export …)`: la contraseña trae caracteres que bash expande
 * dentro de comillas dobles y sale `P1013: invalid port number`. Por eso se
 * carga con dotenv y se pasa por `env` a un `spawnSync`. Y tiene que vivir
 * DENTRO del repo, si no `dotenv` no resuelve.
 *
 * Uso:
 *   node scripts/prisma-session.mjs migrate status
 *   node scripts/prisma-session.mjs migrate resolve --applied <timestamp>_<nombre>
 *   node scripts/prisma-session.mjs migrate deploy
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(repo, ".env.local"), quiet: true });
config({ path: resolve(repo, ".env"), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("[prisma-session] falta DATABASE_URL en .env.local");
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
if (!url.host.includes("pooler.supabase.com")) {
  console.error(
    `[prisma-session] DATABASE_URL no apunta al pooler de Supabase (${url.host}).\n` +
      "Este wrapper existe para forzar el puerto de sesión del pooler; revisá el .env.",
  );
  process.exit(1);
}
url.port = "5432"; // session mode: prepared statements OK
url.searchParams.delete("pgbouncer");
url.searchParams.delete("connection_limit");

process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = url.toString();

console.error(`[prisma-session] ${url.host} (session pooler) · prisma ${process.argv.slice(2).join(" ")}`);
const r = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  cwd: repo,
});
process.exit(r.status ?? 1);
