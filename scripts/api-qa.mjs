#!/usr/bin/env node
/**
 * Llamar a un endpoint admin con sesión real, sin navegador (memoria de agente
 * `probar-endpoint-admin-sin-chromium`: se repitió 3 veces a mano).
 *
 *   node scripts/api-qa.mjs GET  "/api/admin/forestal/cubicaciones-trozas"
 *   node scripts/api-qa.mjs POST "/api/admin/x" '{"a":1}'
 *   node scripts/api-qa.mjs --pasos '[{"m":"GET","u":"/api/a"},{"m":"DELETE","u":"/api/a/1"}]'
 *   --tenant <slug> (default main → http://localhost:3000; otro → http://<slug>.localhost:3000)
 *   --max <n>  caracteres de cada respuesta que se imprimen (default 1500)
 *
 * Login: GET /login deja la cookie `csrf-token`; POST /api/auth/login con `username`
 * (NO `email`), `x-csrf-token` y `x-tenant-id`. QA: qaadmin / Qa-admin-1234 (QA_USER / QA_PASS).
 * Nunca contra Blas: es para el tenant de QA.
 */
import { request } from "playwright";

const args = process.argv.slice(2);
const opt = (k, def) => {
  const i = args.indexOf(k);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const tenant = opt("--tenant", "main");
const max = Number(opt("--max", "1500"));
const pasosJson = opt("--pasos", null);
if (/inversiones-agroforestales-blas-sociedad-anonima|cmpxiv6p4000bohvzwl6bnfpv/.test(tenant)) {
  console.error("[api-qa] Blas es solo lectura: usa main o el tenant de QA.");
  process.exit(2);
}
const pasos = pasosJson ? JSON.parse(pasosJson) : [{ m: args[0] ?? "GET", u: args[1], b: args[2] ? JSON.parse(args[2]) : undefined }];
if (!pasos.every((p) => typeof p.u === "string" && p.u.startsWith("/"))) {
  console.error("Uso: node scripts/api-qa.mjs <METHOD> </ruta> [json] | --pasos '[{\"m\",\"u\",\"b\"}]'");
  process.exit(2);
}

const baseURL = tenant === "main" ? "http://localhost:3000" : `http://${tenant}.localhost:3000`;
const ctx = await request.newContext({ baseURL });
try {
  await ctx.get("/login");
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === "csrf-token")?.value ?? "";
  const headers = { "x-csrf-token": csrf, "x-tenant-id": tenant, "content-type": "application/json" };
  const login = await ctx.post("/api/auth/login", {
    headers,
    data: { username: process.env.QA_USER ?? "qaadmin", password: process.env.QA_PASS ?? "Qa-admin-1234", tenantSlug: tenant },
  });
  if (!login.ok()) {
    console.error(`[api-qa] login ${login.status()}: ${(await login.text()).slice(0, 300)}`);
    process.exit(1);
  }
  for (const p of pasos) {
    const r = await ctx.fetch(p.u, { method: p.m ?? "GET", headers, ...(p.b !== undefined ? { data: p.b } : {}) });
    const texto = await r.text();
    console.log(`${p.m ?? "GET"} ${p.u} → ${r.status()}${texto ? `\n${texto.slice(0, max)}${texto.length > max ? " …" : ""}` : ""}`);
  }
} finally {
  await ctx.dispose();
}
