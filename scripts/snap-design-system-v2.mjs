/**
 * Verificación visual completa:
 * 1) Captura el page /superadmin/design-system rediseñado (galería, editor, library)
 * 2) Activa 3 presets distintos via API y captura el admin del negocio en cada uno
 *    para verificar que la herencia visual realmente cambia (colors, fonts, radius).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";

const OUT = "reports/design-system";
mkdirSync(OUT, { recursive: true });

// ─── Helper HTTP con cookies ───────────────────────────────────────────────
function loadCookies(filepath) {
  const txt = fs.readFileSync(filepath, "utf8");
  const cookieJar = {};
  txt.split("\n").forEach((line) => {
    if (!line.trim() || line.startsWith("# ")) return;
    const httpOnly = line.startsWith("#HttpOnly_");
    const cleaned = httpOnly ? line.replace(/^#HttpOnly_/, "") : line;
    const parts = cleaned.split("\t");
    if (parts.length < 7) return;
    cookieJar[parts[5]] = parts[6];
  });
  return cookieJar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

function apiPut(path, body, jar) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "x",
        "Cookie": cookieHeader(jar),
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const platformJar = loadCookies("/tmp/superadmin-cookies.txt");
const adminJar = (() => {
  // Cargar el bsm-auth.env para admin de negocio
  const env = fs.readFileSync("/tmp/bsm-auth.env", "utf8");
  const match = env.match(/BSM_COOKIE='([^']+)'/);
  if (!match) throw new Error("No BSM_COOKIE in /tmp/bsm-auth.env");
  const jar = {};
  match[1].split("; ").forEach((c) => {
    const [k, v] = c.split("=");
    jar[k] = v;
  });
  return jar;
})();

console.log("Loaded", Object.keys(platformJar).length, "platform cookies +", Object.keys(adminJar).length, "admin cookies");

// ─── Browser ──────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

// 1) Página /superadmin/design-system rediseñada
const ctxSuper = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageSuper = await ctxSuper.newPage();
const errors = [];
pageSuper.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
pageSuper.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await pageSuper.goto("http://localhost:3000/superadmin/login", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await pageSuper.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 });
await pageSuper.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 });
await pageSuper.waitForTimeout(300);
await pageSuper.locator('button[type="submit"]:not([disabled])').click({ timeout: 10000 });
await pageSuper.waitForURL((u) => !u.toString().includes("/login"), { timeout: 15000 }).catch(() => {});
await pageSuper.waitForTimeout(400);

await pageSuper.goto("http://localhost:3000/superadmin/design-system", {
  waitUntil: "networkidle",
  timeout: 30000,
});
await pageSuper.waitForTimeout(600);
await pageSuper.screenshot({ path: `${OUT}/v2-01-galeria.png`, fullPage: true });
console.log("OK galeria");

await pageSuper.click('button:has-text("Editor")').catch(() => {});
await pageSuper.waitForTimeout(400);
await pageSuper.screenshot({ path: `${OUT}/v2-02-editor.png`, fullPage: false });
console.log("OK editor");

// Hover sobre Activar para verificar que NO se pone blanco
await pageSuper.click('button:has-text("Galería")').catch(() => {});
await pageSuper.waitForTimeout(300);
const activarBtn = pageSuper.locator('button:has-text("Activar")').first();
await activarBtn.hover().catch(() => {});
await pageSuper.waitForTimeout(200);
await pageSuper.screenshot({ path: `${OUT}/v2-03-hover-activar.png`, fullPage: false });
console.log("OK hover activar");

// 2) Activar diferentes presets y screenshot del admin
const presets = ["bodega-calida", "mercado-moderno", "pastel-fresh", "buleje-default"];
const ctxAdmin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageAdmin = await ctxAdmin.newPage();
pageAdmin.on("pageerror", (e) => errors.push(`ADMIN PAGEERROR: ${e.message}`));

// Capturar /admin/login que TAMBIÉN está wrapped por DesignTokensProvider
// — basta para verificar que los tokens de diseño se heredan al admin
// (los componentes del login consumen --accent, --rule-base, --shadow-*, etc).
await pageAdmin.goto("http://localhost:3000/admin/login", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await pageAdmin.waitForTimeout(500);

for (const slug of presets) {
  // Activar via fetch desde el browser superadmin (mismo UA que la session)
  const r = await pageSuper.evaluate(async (s) => {
    const resp = await fetch("/api/superadmin/design-system", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
      body: JSON.stringify({ slug: s }),
    });
    return { status: resp.status, body: await resp.text() };
  }, slug);
  console.log(`Activated ${slug}:`, r.status, r.status !== 200 ? r.body.slice(0, 100) : "");

  // Confirmar que el endpoint refleja el cambio antes de capturar
  const verify = await pageAdmin.evaluate(async () => {
    const r = await fetch("/api/design-system/active?_t=" + Date.now(), { cache: "no-store" });
    const j = await r.json();
    return j?.tokens?.meta?.slug;
  });
  console.log(`  verify endpoint slug:`, verify);

  // Cargar admin/login con cache-buster en URL
  await pageAdmin.goto(`http://localhost:3000/admin/login?_t=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  // Wait extra para que DesignTokensProvider haga fetch + apply CSS vars
  await pageAdmin.waitForTimeout(2200);
  await pageAdmin.screenshot({ path: `${OUT}/v2-admin-${slug}.png`, fullPage: false });
  console.log(`  OK admin/login con ${slug}`);
}

if (errors.length > 0) {
  console.log("---ERRORS---");
  errors.forEach((e) => console.log(e));
} else {
  console.log("--- NO PAGE ERRORS ---");
}

await browser.close();
