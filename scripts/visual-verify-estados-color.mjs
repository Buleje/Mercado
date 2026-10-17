// Marcar documentos con un estado y que se VEA en la tarjeta.
//
// Comprueba lo que se pidió: seleccionar varios, marcarlos de una (verde =
// está bien, rojo = hay que corregir) y que la tarjeta quede resaltada con ese
// color, para poder barrer la carpeta con la vista. Mide el color real de los
// bordes (getComputedStyle), no lo juzga por el PNG. Deja todo como estaba.
//
// Uso: node scripts/visual-verify-estados-color.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/estados-color";

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

/** Estado original de cada documento, para dejarlo como estaba. */
const original = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=100", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name, status: d.status ?? "none" }));
});
if (original.length < 3) { console.error("hacen falta al menos 3 documentos"); process.exit(1); }

/** El borde que pinta el navegador para la tarjeta de un documento. */
async function bordeDe(nombre) {
  return await page.evaluate((n) => {
    const btn = document.querySelector(`button[aria-label="Ver ${n}"]`);
    const card = btn?.closest("div.group");
    if (!card) return null;
    const cs = getComputedStyle(card);
    const franja = card.querySelector("span[aria-hidden].absolute");
    return {
      borde: cs.borderTopColor,
      franja: franja ? getComputedStyle(franja).backgroundColor : null,
    };
  }, nombre);
}

// ── 1. Marcar dos como "hay que corregir" ─────────────────────────────────
const aCorregir = original.slice(0, 2);
for (const d of aCorregir) {
  await page.locator(`input[aria-label="Seleccionar ${d.name}"], input[type="checkbox"]`).first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.evaluate((n) => {
    const btn = document.querySelector(`button[aria-label="Ver ${n}"]`);
    const card = btn?.closest("div.group");
    const chk = card?.querySelector('input[type="checkbox"]');
    if (chk && !chk.checked) chk.click();
  }, d.name);
  await page.waitForTimeout(400);
}
await page.getByRole("button", { name: /Hay que corregir/i }).click();
await page.waitForTimeout(4000);

const rojo1 = await bordeDe(aCorregir[0].name);
const rojo2 = await bordeDe(aCorregir[1].name);
// Los tokens del design system se computan como oklch(L C H): el tono está en
// el tercer número (H). Rojo ≈ 25, verde ≈ 150. Parsear "los dígitos" no sirve.
const matiz = (c) => {
  const ok = c?.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
  if (ok) return Number(ok[1]);
  const rgb = c?.match(/\d+/g)?.map(Number);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return r > g && r > b ? 25 : g > r ? 150 : null;
};
const esRojizo = (c) => { const h = matiz(c); return h !== null && (h < 45 || h > 340); };
decir(esRojizo(rojo1?.borde), `"${aCorregir[0].name}" quedó con borde rojo (${rojo1?.borde})`);
decir(esRojizo(rojo2?.borde), `"${aCorregir[1].name}" también (${rojo2?.borde})`);
decir(esRojizo(rojo1?.franja), `y con la franja de color arriba (${rojo1?.franja})`);

// ── 2. Marcar otro como "está bien" ───────────────────────────────────────
const aprobado = original[2];
await page.evaluate((n) => {
  const btn = document.querySelector(`button[aria-label="Ver ${n}"]`);
  const chk = btn?.closest("div.group")?.querySelector('input[type="checkbox"]');
  if (chk && !chk.checked) chk.click();
}, aprobado.name);
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Está bien/i }).click();
await page.waitForTimeout(4000);

const verde = await bordeDe(aprobado.name);
const esVerdoso = (c) => { const h = matiz(c); return h !== null && h > 100 && h < 220; };
decir(esVerdoso(verde?.borde), `"${aprobado.name}" quedó con borde de aprobado (${verde?.borde})`);
decir(verde?.borde !== rojo1?.borde, "el verde y el rojo se distinguen entre sí");

await page.screenshot({ path: `${OUT}/grilla-marcada.png` });

// ── 3. El filtro por estado los encuentra ─────────────────────────────────
// El chip vive en la barra "Estado"; se lo ubica por ahí para no confundirlo
// con el botón de la barra de selección. Si no estuviera, es una FALLA: saltar
// el chequeo en silencio haría que el test mienta.
const barraEstado = page.locator('div').filter({ has: page.getByText("Estado", { exact: true }) }).last();
const chip = barraEstado.getByRole("button", { name: /Hay que corregir/ }).first();
if (await chip.count() === 0) {
  decir(false, "no se encontró el chip de filtro «Hay que corregir»");
} else {
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await page.waitForTimeout(3000);
  const visibles = await page.locator('button[aria-label^="Ver "]').count();
  decir(visibles === aCorregir.length, `el filtro deja ${visibles} tarjeta(s) — se esperaban ${aCorregir.length}`);
  await page.screenshot({ path: `${OUT}/filtrado.png` });
  await chip.click();
  await page.waitForTimeout(1500);
}

// ── 4. Guardado de verdad (no sólo en pantalla) ───────────────────────────
const guardado = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=100", { credentials: "include" });
  const { documents = [] } = await r.json();
  return Object.fromEntries(documents.map((d) => [d.id, d.status ?? "none"]));
});
decir(guardado[aCorregir[0].id] === "observado", `en la base quedó "${guardado[aCorregir[0].id]}" (esperado: observado)`);
decir(guardado[aprobado.id] === "approved", `y "${guardado[aprobado.id]}" (esperado: approved)`);

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);

// ── Dejar todo como estaba ────────────────────────────────────────────────
for (const d of [...aCorregir, aprobado]) {
  await page.evaluate(async ({ id, status }) => {
    const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
    await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ status }),
    });
  }, d);
  await page.waitForTimeout(400);
}
console.log("     estados restaurados");

if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
