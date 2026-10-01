// Verifica uno por uno los hallazgos del reporte de QA del módulo Documentación.
//
// Cada bloque deja los datos como estaban. Lo que no se reproduce se dice
// explícitamente: un reporte puede equivocarse, pero hay que probarlo.
//
// Uso: node scripts/visual-verify-reporte-qa.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/qa-reporte";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const erroresJs = [];
page.on("pageerror", (e) => erroresJs.push(String(e)));

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(4000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

const patch = (id, body) => page.evaluate(async ({ id, body }) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify(body),
  });
}, { id, body });

const listar = () => page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=300", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name, favorite: d.favorite, expiresAt: d.expiresAt }));
});

const docs = await listar();
const original = docs.slice(0, 3).map((d) => ({ id: d.id, favorite: d.favorite, expiresAt: d.expiresAt }));

// ── Hallazgo: "Favoritos muestra TODOS los documentos" ────────────────────
await patch(docs[0].id, { favorite: true });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
await page.getByRole("button", { name: "Favoritos", exact: true }).click();
await page.waitForTimeout(3500);
const enFavoritos = await page.locator('button[aria-label^="Ver "]').count();
decir(enFavoritos === 1, `Favoritos muestra ${enFavoritos} documento(s); se marcó 1 como favorito`);
await page.screenshot({ path: `${OUT}/favoritos.png` });

// ── Hallazgo: "el Calendario dice 0 vencen aunque haya vencimientos" ──────
const en5dias = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
await patch(docs[1].id, { expiresAt: en5dias });
await patch(docs[2].id, { expiresAt: en5dias });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
await page.getByRole("button", { name: "Calendario", exact: true }).click();
await page.waitForTimeout(3500);
const cal = await page.evaluate(() => document.body.innerText);
const mConteo = cal.match(/(\d+)\s+vencen?/i);
decir(!!mConteo && Number(mConteo[1]) >= 2,
  `el Calendario cuenta ${mConteo?.[1] ?? "?"} vencimiento(s); se pusieron 2 para dentro de 5 días`);
await page.screenshot({ path: `${OUT}/calendario.png` });

// ── Hallazgo: "la barra de acciones masivas se superpone" ─────────────────
await page.getByRole("button", { name: "Todos", exact: true }).click();
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelectorAll('input[type="checkbox"]').forEach((c, i) => { if (i < 3 && !c.checked) c.click(); });
});
await page.waitForTimeout(1500);
const barra = await page.evaluate(() => {
  const b = [...document.querySelectorAll("div")].find((d) => /seleccionado/.test(d.textContent ?? "") && d.className.includes("sticky"));
  if (!b) return null;
  const hijos = [...b.children].map((c) => c.getBoundingClientRect());
  // ¿Algún par de elementos se pisa horizontalmente estando en la misma línea?
  let solapes = 0;
  for (let i = 0; i < hijos.length; i++) {
    for (let j = i + 1; j < hijos.length; j++) {
      const a = hijos[i], c = hijos[j];
      const mismaLinea = Math.abs(a.top - c.top) < 5;
      if (mismaLinea && a.right > c.left + 1 && a.left < c.right - 1) solapes++;
    }
  }
  return { solapes, elementos: hijos.length, alto: Math.round(b.getBoundingClientRect().height) };
});
decir(!!barra && barra.solapes === 0,
  `la barra de selección no se superpone (${barra?.solapes ?? "?"} solapes en ${barra?.elementos ?? "?"} controles, alto ${barra?.alto ?? "?"}px)`);
await page.screenshot({ path: `${OUT}/barra.png` });

// ── Hallazgo: "Analizar con IA no hace nada" ──────────────────────────────
const analiza = await page.evaluate(async (id) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  const t0 = Date.now();
  const r = await fetch(`/api/admin/documents/${id}/analyze`, {
    method: "POST", credentials: "include", headers: { "x-csrf-token": csrf },
  });
  return { estado: r.status, ms: Date.now() - t0 };
}, docs[0].id);
decir(analiza.estado === 200 || analiza.estado === 422,
  `"Analizar con IA" responde ${analiza.estado} en ${analiza.ms}ms (422 = el archivo no tiene texto, es una respuesta válida)`);

// ── Hallazgo: "el Asistente IA nunca responde" ────────────────────────────
const asist = await page.evaluate(async () => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  const t0 = Date.now();
  const r = await fetch("/api/admin/documents/assistant", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify({ question: "cuantos documentos tengo?" }),
  });
  const j = await r.json().catch(() => ({}));
  return { estado: r.status, ms: Date.now() - t0, respuesta: String(j.answer ?? j.error ?? "").slice(0, 80) };
});
decir(asist.estado === 200 && asist.respuesta.length > 0,
  `el Asistente IA responde (${asist.estado} en ${asist.ms}ms): "${asist.respuesta}"`);

// ── Hallazgo: "el modo IA del buscador no dispara nada" ───────────────────
const semantica = await page.evaluate(async () => {
  const t0 = Date.now();
  const r = await fetch("/api/admin/documents?q=documentos%20que%20vencen%20pronto&semantic=1", { credentials: "include" });
  const j = await r.json().catch(() => ({}));
  return { estado: r.status, ms: Date.now() - t0, fuente: j.source ?? null, cuantos: (j.documents ?? []).length };
});
decir(semantica.estado === 200,
  `la búsqueda con IA responde ${semantica.estado} en ${semantica.ms}ms (fuente: ${semantica.fuente ?? "—"}, ${semantica.cuantos} resultados)`);

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);
if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));

// ── Dejar todo como estaba ────────────────────────────────────────────────
for (const d of original) await patch(d.id, { favorite: !!d.favorite, expiresAt: d.expiresAt ?? null });
console.log("     datos restaurados");

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
