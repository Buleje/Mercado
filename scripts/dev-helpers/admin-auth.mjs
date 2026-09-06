#!/usr/bin/env node
/**
 * admin-auth — login + CSRF en 1 paso.
 *
 * Output (JSON):
 *   {
 *     ok: true,
 *     cookieHeader: "csrf-token=...; active-tenant=main; ...",
 *     csrf: "...",
 *     curlFlags: "-H 'Cookie: ...' -H 'x-csrf-token: ...' -H 'x-tenant-id: main'"
 *   }
 *
 * Uso:
 *   node scripts/dev-helpers/admin-auth.mjs                 → login default qaadmin/main
 *   node scripts/dev-helpers/admin-auth.mjs --json          → solo JSON sin pretty-print
 *   FLAGS=$(node scripts/dev-helpers/admin-auth.mjs --flags)  → flags para meter directo en curl
 *   eval "curl http://localhost:3000/api/admin/X $FLAGS"
 *
 * Ahorra: 5 líneas + 2 turns por session manual.
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const TENANT = process.env.BSM_TENANT || "main";
const USER = process.env.BSM_USER || "qaadmin";
const PASS = process.env.BSM_PASS || "Qa-admin-1234";

async function main() {
  const args = process.argv.slice(2);
  const wantFlags = args.includes("--flags");
  const wantJson = args.includes("--json") || wantFlags;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    // `tenantSlug` es obligatorio para usuarios que existen en varias tiendas:
    // sin él, el login responde el selector y NO devuelve la cookie de sesión
    // (solo el csrf), y todo curl posterior sale 401.
    body: JSON.stringify({ username: USER, password: PASS, tenantSlug: TENANT }),
  });
  if (!res.ok) {
    const txt = await res.text();
    process.stderr.write(`Login failed ${res.status}: ${txt.slice(0, 200)}\n`);
    process.exit(1);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  // Fallback for runtimes without getSetCookie
  const rawCookies = setCookie.length > 0 ? setCookie : [res.headers.get("set-cookie") ?? ""];
  const pairs = rawCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean);
  const cookieHeader = pairs.join("; ");
  const csrfMatch = cookieHeader.match(/csrf-token=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : "";

  // Persist netrc-style file for shell reuse
  const out = {
    ok: true,
    base: BASE,
    tenant: TENANT,
    user: USER,
    cookieHeader,
    csrf,
    curlFlags: `-H "Cookie: ${cookieHeader}" -H "x-csrf-token: ${csrf}" -H "x-tenant-id: ${TENANT}"`,
  };

  if (wantFlags) {
    process.stdout.write(out.curlFlags);
    return;
  }
  if (wantJson) {
    process.stdout.write(JSON.stringify(out));
    return;
  }

  // Pretty + persist a /tmp/bsm-auth.env so otros scripts pueden source-arlo
  try {
    writeFileSync(
      "/tmp/bsm-auth.env",
      [
        `export BSM_COOKIE='${cookieHeader}'`,
        `export BSM_CSRF='${csrf}'`,
        `export BSM_TENANT='${TENANT}'`,
        `export BSM_BASE='${BASE}'`,
        `export BSM_CURL_FLAGS='${out.curlFlags}'`,
      ].join("\n"),
    );
  } catch {}

  console.log("✅ Login OK · " + USER + "@" + TENANT);
  console.log("CSRF:        " + csrf.slice(0, 16) + "...");
  console.log("Persisted:   /tmp/bsm-auth.env");
  console.log("");
  console.log("Para usar en bash:");
  console.log("  source /tmp/bsm-auth.env");
  console.log('  curl $BSM_BASE/api/admin/X $BSM_CURL_FLAGS');
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
