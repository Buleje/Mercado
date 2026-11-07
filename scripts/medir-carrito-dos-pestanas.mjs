// Mide el carrito con 2 pestañas reales (mismo contexto = mismo localStorage y BroadcastChannel).
// Uso: node scripts/medir-carrito-dos-pestanas.mjs [ruta]  (dev server en :3000; ruta por defecto /t/main/tienda)
// 28-10: con HEAD viejo 202-578 escrituras de [] al montar y el producto se perdía en las dos; con el arreglo, 0.
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const { resolverChromium } = await import("./dev-helpers/chromium-path.mjs");

const BASE = "http://localhost:3000";
const RUTA = process.argv[2] ?? "/t/main/tienda";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, executablePath: resolverChromium() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  const w = window;
  w.__m = { esc: 0, vacias: 0, dif: 0, primeras: [] };
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (/-cart$/.test(k)) {
      w.__m.esc++;
      if (v === "[]") w.__m.vacias++;
      if (w.__m.primeras.length < 6) w.__m.primeras.push(`${Math.round(performance.now())}ms ${k} ${v.slice(0, 40)} @ ${(new Error().stack || "").split("\n").slice(2, 5).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, "").slice(0, 90)).join(" < ")}`);
    }
    return setItem.call(this, k, v);
  };
  const post = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (d) {
    if (d && d.type === "CART_UPDATE") w.__m.dif++;
    return post.call(this, d);
  };
});

const a = await ctx.newPage();
const b = await ctx.newPage();
const errores = [];
for (const [n, p] of [["A", a], ["B", b]]) p.on("pageerror", (e) => errores.push(`${n}: ${e.message.slice(0, 120)}`));

const leer = (p) => p.evaluate(() => {
  const btn = document.querySelector('[aria-label^="Abrir tu bolsa"]');
  const m = btn?.getAttribute("aria-label")?.match(/\d+/);
  const clave = Object.keys(localStorage).find((k) => /-cart$/.test(k) && localStorage.getItem(k) !== "[]") ?? Object.keys(localStorage).find((k) => /-cart$/.test(k));
  let guardado = null;
  try { guardado = clave ? JSON.parse(localStorage.getItem(clave)).map((i) => `${i.id}x${i.quantity}`).join(",") : null; } catch { guardado = "?"; }
  return { badge: m ? Number(m[0]) : null, esc: window.__m.esc, vacias: window.__m.vacias, dif: window.__m.dif, guardado, clave, primeras: window.__m.primeras };
});
const reset = (p) => p.evaluate(() => { window.__m.esc = 0; window.__m.vacias = 0; window.__m.dif = 0; window.__m.primeras = []; });

const out = {};
await a.goto(BASE + RUTA, { waitUntil: "domcontentloaded" });
await a.evaluate(() => { for (const k of Object.keys(localStorage)) if (/-cart|-pending/.test(k)) localStorage.removeItem(k); });
await a.reload({ waitUntil: "domcontentloaded" });
await b.goto(BASE + RUTA, { waitUntil: "domcontentloaded" });
await espera(6000);
out.montaje = { A: await leer(a), B: await leer(b) }; console.error("PASO montaje", JSON.stringify(out.montaje));

// 1) quietas 2 s sin tocar nada
await reset(a); await reset(b);
await espera(2000);
out.quietas2s = { A: await leer(a), B: await leer(b) }; console.error("PASO quietas2s", JSON.stringify(out.quietas2s));

// 2) agregar en A (primer botón «Agregar … al carrito»), 2 s
await reset(a); await reset(b);
const boton = a.locator("button:not([disabled])", { hasText: /^\s*Agregar\s*$/ }).first();
out.producto = await boton.evaluate((el) => el.closest("article,li,div")?.textContent?.slice(0, 50)).catch(() => null);
await boton.click({ timeout: 15000 });
await espera(2000);
out.trasAgregar2s = { A: await leer(a), B: await leer(b) }; console.error("PASO trasAgregar2s", JSON.stringify(out.trasAgregar2s));

// 3) recargar ambas a la vez, 6 s
await Promise.all([a.reload({ waitUntil: "domcontentloaded" }), b.reload({ waitUntil: "domcontentloaded" })]);
await espera(6000);
out.trasRecargarAmbas = { A: await leer(a), B: await leer(b) }; console.error("PASO trasRecargarAmbas", JSON.stringify(out.trasRecargarAmbas));

// 4) recargar sólo A, 6 s
await a.reload({ waitUntil: "domcontentloaded" });
await espera(6000);
out.trasRecargarA = { A: await leer(a), B: await leer(b) }; console.error("PASO trasRecargarA", JSON.stringify(out.trasRecargarA));

out.errores = errores.slice(0, 5);
console.log(JSON.stringify(out, null, 1));
await browser.close();
