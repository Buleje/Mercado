#!/usr/bin/env node
/**
 * superadmin-auth — login de superadmin + CSRF en 1 paso (gemelo de admin-auth).
 *
 * Lee SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD de .env.local (nunca los
 * imprime), hace POST /api/superadmin/auth y suma un par csrf-token
 * cookie = encabezado (el CSRF de doble envío acepta cualquier par igual).
 *
 * Uso:
 *   node scripts/dev-helpers/superadmin-auth.mjs            → guarda /tmp/bsm-sa-auth.env
 *   FLAGS=$(node scripts/dev-helpers/superadmin-auth.mjs --flags)
 *   eval "curl http://localhost:3000/api/superadmin/candado $FLAGS"
 *   node scripts/dev-helpers/superadmin-auth.mjs --json     → { cookieHeader, csrf, cookies[], userAgent }
 *     (Playwright: newContext({ userAgent }) + addCookies(cookies); sin el mismo UA la sesión no vale)
 *
 * Nació en la sesión del candado (11-10): tres agentes rehicieron este login a mano.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
// La sesión de superadmin queda atada al User-Agent del login (`uaHash`): curl y
// Playwright tienen que mandar EL MISMO (`-A` va en las flags; `userAgent` en el JSON).
const UA = process.env.BSM_UA || "bsm-dev-helper/1.0";

function leerEnv(clave) {
  if (process.env[clave]) return process.env[clave];
  try {
    const linea = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${clave}=`));
    return linea ? linea.slice(clave.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const username = leerEnv("SUPERADMIN_USERNAME") || "platform";
  const password = leerEnv("SUPERADMIN_PASSWORD");
  if (!password) {
    process.stderr.write("Falta SUPERADMIN_PASSWORD en .env.local\n");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/api/superadmin/auth`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    process.stderr.write(`Login de superadmin falló ${res.status}: ${(await res.text()).slice(0, 200)}\n`);
    process.exit(1);
  }
  const csrf = randomBytes(16).toString("hex");
  const pares = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).filter(Boolean);
  pares.push(`csrf-token=${csrf}`);
  const cookieHeader = pares.join("; ");
  const flags = `-A "${UA}" -H "Cookie: ${cookieHeader}" -H "x-csrf-token: ${csrf}"`;
  const host = new URL(BASE).hostname;
  const cookies = pares.map((p) => {
    const i = p.indexOf("=");
    return { name: p.slice(0, i), value: p.slice(i + 1), domain: host, path: "/" };
  });

  if (args.includes("--flags")) return void process.stdout.write(flags);
  if (args.includes("--json")) return void process.stdout.write(JSON.stringify({ cookieHeader, csrf, cookies, userAgent: UA }));
  writeFileSync(
    "/tmp/bsm-sa-auth.env",
    `SA_COOKIE='${cookieHeader}'\nSA_CSRF='${csrf}'\nSA_FLAGS='${flags.replace(/'/g, "")}'\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`✅ sesión de superadmin (${pares.length - 1} cookies) → /tmp/bsm-sa-auth.env\n`);
}

main().catch((err) => {
  process.stderr.write(`superadmin-auth: ${String(err)}\n`);
  process.exit(1);
});
