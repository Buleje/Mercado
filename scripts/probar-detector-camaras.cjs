#!/usr/bin/env node
/**
 * probar-detector-camaras — recorre el mosaico «Ver todas en vivo» en `main`
 * con un reproductor falso que pasa CUADROS REALES (ADR-475, 2026-10-08) y
 * reporta lo que el detector marcó: chips, avisos, fotos (interceptadas: no se
 * guarda nada en el Drive) y el motor con que miró.
 *
 * Uso: node scripts/probar-detector-camaras.cjs <carpeta-de-cuadros> [espera_ms=60000]
 *   La carpeta trae `<cámaraA>-r0.jpg … -r3.jpg` y `<cámaraB>-r0.jpg …` (cada
 *   cámara del mosaico falso pasa los suyos, 1 s cada uno). Los cuadros de Blas
 *   se sacan con `sacarFoto` (sólo lectura): ver memoria camaras-detector-dfine.
 *   Deja `mosaico.png` en la misma carpeta.
 */
const path = require("path"), fs = require("fs");
const { chromium } = require(path.join(process.cwd(), "node_modules", "playwright"));
const B = "http://localhost:3000", SP = process.argv[2], ESPERA = Number(process.argv[3] ?? 30000);
const preset = JSON.parse(fs.readFileSync("scripts/qa-pasos/mosaico-nube-falso.json", "utf8"));
const camaras = [...new Set(fs.readdirSync(SP).filter((f) => /-r\d+\.jpg$/.test(f)).map((f) => f.replace(/-r\d+\.jpg$/, "")))].sort();
if (camaras.length < 2) throw new Error("hacen falta cuadros de 2 cámaras: <cam>-r0.jpg … en " + SP);
const frames = (cam) => [0, 1, 2, 3].map((r) => "data:image/jpeg;base64," + fs.readFileSync(`${SP}/${cam}-r${r}.jpg`).toString("base64"));
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("active-tenant-slug", "main"); localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => { const t = m.text(); if (/camaras|D-FINE|onnx|ort|worker|Worker/i.test(t) || m.type() === "error") logs.push(m.type() + ": " + t.slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("PAGEERROR " + e.message.slice(0, 200)));
  let fotos = 0;
  await page.route("**/api/admin/camaras/*/persona", (r) => { fotos++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "qa", url: "" }) }); });
  const reqs = [];
  ctx.on("response", (r) => { if (r.status() >= 400) reqs.push("HTTP " + r.status() + " " + r.url().replace(B, "")); });
  ctx.on("requestfailed", (r) => reqs.push("FALLÓ " + r.url().replace(B, "") + " " + (r.failure()?.errorText ?? "")));
  page.on("requestfinished", async (r) => { const u = r.url(); if (/onnxruntime|modelos|worker/.test(u)) reqs.push(u.replace(B, "") + " " + ((await r.response())?.status() ?? "?")); });
  await page.request.get(B + "/api/health", { timeout: 60000 });
  const csrf = (await ctx.cookies()).find((c) => c.name === "csrf-token")?.value ?? "";
  await page.request.post(B + "/api/auth/login", { headers: { "content-type": "application/json", "x-tenant-id": "main", "x-csrf-token": csrf }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" } });
  await page.goto(B + "/admin?tab=inicio", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(3000);
  // Cuadros reales: cámara 1 = patio, cámara QA 2 = aserradero; cambian cada 1 s.
  await page.evaluate(({ a, b }) => { window.__framesQa = [a, b].map((l) => l.map((src) => { const i = new Image(); i.src = src; return i; })); }, { a: frames(camaras[0]), b: frames(camaras[1]) });
  const evalCode = preset[1].eval.replace(
    "this.t = setInterval(() => { n++; ctx.fillStyle = 'hsl(' + (n * 7 % 360) + ',40%,30%)'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = 'white'; ctx.font = '28px sans-serif'; ctx.fillText('QA vivo ' + n, 24, 48); c.dataset.cuadros = String(n); }, 250);",
    "c.width = 768; c.height = 432; c.style.width = '100%'; c.style.height = '100%'; window.__camQa = (window.__camQa || 0) + 1; const lista = window.__framesQa[(window.__camQa - 1) % 2]; this.t = setInterval(() => { n++; ctx.drawImage(lista[Math.floor(n / 4) % 4], 0, 0, 768, 432); c.dataset.cuadros = String(n); }, 250);");
  if (evalCode === preset[1].eval) throw new Error("no se pudo parchear el preset");
  console.log(await page.evaluate(evalCode));
  await page.waitForSelector("[data-mosaico-boton]", { timeout: 120000 });
  await page.click("[data-mosaico-boton]");
  const t0 = Date.now();
  const avisos = new Set();
  const fin = Date.now() + ESPERA;
  while (Date.now() < fin) {
    await page.waitForTimeout(1000);
    for (const t of await page.locator("[data-sonner-toast]").allTextContents()) avisos.add(Math.round((Date.now() - t0) / 1000) + "s " + t.slice(0, 80));
  }
  console.log("avisos:", JSON.stringify([...avisos].slice(0, 6)));
  console.log("motor:", await page.evaluate(() => [...document.querySelectorAll("span[title]")].map((x) => x.title).find((t) => /D-FINE|liviano/.test(t)) ?? "?"));
  const chips = await page.evaluate(() => [...document.querySelectorAll("[data-cuadro-mosaico]")].map((li) => li.querySelector("span[title*='Personas en cuadro'], span[title*='persona']")?.textContent ?? li.textContent.slice(0, 80)));
  console.log("chips:", JSON.stringify(chips));
  console.log("fotos subidas (interceptadas):", fotos, "· espera", Math.round((Date.now() - t0) / 1000), "s");
  console.log("pedidos:", JSON.stringify([...new Set(reqs)].filter((x) => /HTTP|FALL/.test(x)).slice(0, 10)));
  console.log("logs:", JSON.stringify(logs.slice(-12), null, 0));
  await page.screenshot({ path: SP + "/mosaico.png" });
  await browser.close();
})().catch((e) => { console.error("FALLÓ", e.message); process.exit(1); });
