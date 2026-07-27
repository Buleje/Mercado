// Verifica el importador de carpetas del drive de Documentos, de punta a punta:
//   1. el módulo compila y el modal abre (era un build error + un crash),
//   2. el plan se arma desde un <input webkitdirectory>,
//   3. la importación REAL crea el árbol y sube los archivos,
//   4. reimportar lo mismo marca "ya existe" y no duplica nada,
//   5. limpia todo lo que creó (borra docs y carpetas de prueba).
//
// Uso: node scripts/visual-verify-importar-carpeta.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Prueba importador QA";

// Archivos de ~300 KB y unos cuantos: con 5 de 2 KB la subida termina antes de
// que se pueda ver el progreso, que es justo lo que hay que verificar.
const ARBOL = [
  `${RAIZ}/Contratos/2026/alquiler-local.pdf`,
  `${RAIZ}/Contratos/2026/proveedor-abarrotes.pdf`,
  `${RAIZ}/Contratos/2026/servicio-internet.pdf`,
  `${RAIZ}/Contratos/2026/mantenimiento-equipos.pdf`,
  `${RAIZ}/Contratos/2025/alquiler-local.pdf`,
  `${RAIZ}/Contratos/2025/proveedor-gaseosas.pdf`,
  `${RAIZ}/Boletas/enero/b-0001.pdf`,
  `${RAIZ}/Boletas/enero/b-0002.pdf`,
  `${RAIZ}/Boletas/enero/b-0003.pdf`,
  `${RAIZ}/Boletas/febrero/b-0004.pdf`,
  `${RAIZ}/Boletas/febrero/b-0005.pdf`,
  `${RAIZ}/Boletas/.DS_Store`,
  `${RAIZ}/leeme.txt`,
];
const PESO_ARCHIVO = 300 * 1024;

/** Simula el <input webkitdirectory>: File con webkitRelativePath a mano. */
async function elegirCarpeta(page, rutas, peso = PESO_ARCHIVO) {
  await page.evaluate(({ rs, peso }) => {
    const input = document.querySelector("input[webkitdirectory]");
    if (!input) throw new Error("no encontré el input de carpeta");
    const dt = new DataTransfer();
    for (const r of rs) {
      const f = new File([new Uint8Array(peso)], r.split("/").pop(), { type: "application/pdf" });
      Object.defineProperty(f, "webkitRelativePath", { value: r });
      dt.items.add(f);
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { rs: rutas, peso });
  await page.waitForTimeout(600);
}

/**
 * En WSL el dev server a veces contesta el CSS con ERR_NETWORK_CHANGED y la
 * captura sale sin estilos. Si el body quedó transparente, recargar.
 */
async function asegurarEstilos(page) {
  for (let i = 0; i < 3; i++) {
    const conEstilos = await page.evaluate(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)");
    if (conEstilos) return true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
  }
  console.log("⚠️  la página sigue sin estilos: las capturas no sirven");
  return false;
}

const textoModal = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? d.innerText.replace(/\n{2,}/g, "\n") : "(sin modal)";
  });

/** Borra el árbol de prueba (docs y carpetas) — corre antes y después. */
async function limpiar(page, raiz) {
  return page.evaluate(async (r) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
    const h = { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) };
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
    // Borrar 20+ docs seguidos agota el rate limit (MODERATE, y borrar en masa
    // NO es un flujo real de usuario): reintentar respetando el Retry-After.
    const j = async (u, init) => {
      for (let i = 0; i < 6; i++) {
        const res = await fetch(u, { credentials: "include", headers: h, ...init });
        if (res.ok) return res.json();
        if (res.status !== 429) return { error: res.status };
        const cuerpo = await res.json().catch(() => ({}));
        await dormir(Math.min(20, (cuerpo.retryAfter ?? 5) + 1) * 1000);
      }
      return { error: 429 };
    };
    // Las carpetas viven en SU endpoint; el listado de documentos no las trae.
    const { folders = [] } = await j("/api/admin/documents/folders");
    const raizF = folders.find((f) => f.name === r && !f.parentId);
    if (!raizF) return { carpetas: 0, docs: 0 };

    const bajo = [raizF];
    for (let i = 0; i < bajo.length; i++) bajo.push(...folders.filter((f) => f.parentId === bajo[i].id));

    const docs = [];
    for (const f of bajo) {
      const res = await j(`/api/admin/documents?folderId=${f.id}&limit=500`);
      docs.push(...(res.documents ?? []));
    }
    for (const d of docs) await j(`/api/admin/documents/${d.id}?purge=1`, { method: "DELETE" });
    for (const f of [...bajo].reverse()) await j(`/api/admin/documents/folders/${f.id}`, { method: "DELETE" });
    return { carpetas: bajo.length, docs: docs.length };
  }, raiz);
}

async function abrirModal(page) {
  await asegurarEstilos(page);
  const btn = page.getByRole("button", { name: /Importar carpeta/i });
  await btn.waitFor({ timeout: 20_000 });
  await btn.click();
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  // Los 4xx/5xx con su URL: "Failed to load resource" a secas no dice qué falló.
  const fallidas = [];
  page.on("response", (r) => {
    if (r.status() >= 400) fallidas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  const login = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
  });
  if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

  await page.addInitScript(() => {
    try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
  });
  await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3500);

  // Arrancar limpio: si una corrida anterior murió a mitad, el árbol sigue ahí.
  console.log("limpieza previa:", JSON.stringify(await limpiar(page, RAIZ)));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // ── 1 · Plan ───────────────────────────────────────────────────────────────
  await abrirModal(page);
  await page.screenshot({ path: `${OUT}/01-elegir.png` });
  await elegirCarpeta(page, ARBOL);
  await page.screenshot({ path: `${OUT}/02-plan-light.png` });
  console.log("=== PLAN (1ra vez) ===\n" + (await textoModal(page)));

  // ── 2 · Importación real ───────────────────────────────────────────────────
  await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
  // Frames DURANTE la subida: el progreso archivo-por-archivo sólo existe acá.
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(i === 1 ? 500 : 1100);
    const vivo = await page.getByText("Importación terminada").count();
    if (vivo) break;
    await page.screenshot({ path: `${OUT}/02b-progreso-${i}.png` });
    if (i === 1) console.log("\n=== PROGRESO EN VIVO ===\n" + (await textoModal(page)));
  }
  await page.getByText("Importación terminada").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/03-listo.png` });
  console.log("\n=== RESULTADO ===\n" + (await textoModal(page)));
  await page.getByRole("button", { name: "Cerrar", exact: true }).and(page.locator("button:not([aria-label])")).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-drive-post-import.png` });

  // ── 3 · Reimportar: "ya existe" en carpetas y NADA para subir ──────────────
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await abrirModal(page);
  await elegirCarpeta(page, ARBOL);
  await page.waitForTimeout(1500); // la consulta de duplicados
  await page.screenshot({ path: `${OUT}/05-reimport-light.png` });
  console.log("\n=== PLAN (2da vez, mismo árbol) ===\n" + (await textoModal(page)));

  // Diagnóstico: qué ve el servidor vs qué omitió el modal.
  const enServidor = await page.evaluate(async (raiz) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
    const h = { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) };
    const { folders = [] } = await (await fetch("/api/admin/documents/folders", { headers: h, credentials: "include" })).json();
    const r0 = folders.find((f) => f.name === raiz && !f.parentId);
    if (!r0) return ["(la carpeta raíz de prueba no está en el drive)"];
    const bajo = [r0];
    for (let i = 0; i < bajo.length; i++) bajo.push(...folders.filter((f) => f.parentId === bajo[i].id));
    const nombre = new Map(bajo.map((f) => [f.id, f.name]));
    const res = await fetch("/api/admin/documents/existing", {
      method: "POST", headers: h, credentials: "include",
      body: JSON.stringify({ folderIds: bajo.map((f) => f.id) }),
    });
    const { porCarpeta = {} } = await res.json();
    return Object.entries(porCarpeta).map(([id, docs]) => `${nombre.get(id) ?? id}: ${docs.map((d) => d.name + ":" + d.size).join(", ")}`);
  }, RAIZ);
  console.log("\n=== LO QUE EL SERVIDOR DICE QUE YA ESTÁ ===\n" + enServidor.join("\n"));

  // ── 3b · Con un archivo NUEVO: sólo ése se sube ────────────────────────────
  // El input sólo existe en la fase "elegir": volver ahí con "Elegir otra".
  await page.getByRole("button", { name: "Elegir otra" }).click();
  await page.waitForTimeout(400);
  await elegirCarpeta(page, [...ARBOL, `${RAIZ}/Contratos/2026/nuevo-de-hoy.pdf`]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05b-reimport-con-uno-nuevo.png` });
  console.log("\n=== PLAN (mismo árbol + 1 archivo nuevo) ===\n" + (await textoModal(page)));

  // Dark + mobile sobre la vista más densa. El tema vive en sessionStorage
  // (contexts/theme-context.tsx): hay que setearlo y RECARGAR — pegarle la
  // clase al <html> ya renderizado no alcanza para el modal, que va por portal.
  // OJO: la clave real es `buleje-theme-session-v2` (contexts/theme-context.tsx),
  // no "theme" — con la clave vieja la captura "dark" sale en light.
  await page.evaluate(() => sessionStorage.setItem("buleje-theme-session-v2", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await abrirModal(page);
  // Con 3 archivos nuevos, para que en dark también haya algo que subir.
  const NUEVOS = ["marzo/b-0006.pdf", "marzo/b-0007.pdf", "marzo/b-0008.pdf"].map((r) => `${RAIZ}/Boletas/${r}`);
  await elegirCarpeta(page, [...ARBOL, ...NUEVOS]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-reimport-dark.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/07-reimport-mobile-dark.png` });

  // ── 3c · El progreso en dark y en celular ──────────────────────────────────
  await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/08-progreso-mobile-dark.png` });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-progreso-dark.png` });
  await page.getByText("Importación terminada").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/10-listo-dark.png` });
  console.log("\n=== RESULTADO (dark, 3 nuevos) ===\n" + (await textoModal(page)));
  await page.getByRole("button", { name: "Cerrar", exact: true }).and(page.locator("button:not([aria-label])")).click();
  await page.waitForTimeout(1200);

  // ── 3d · Un archivo que falla: el resumen NO debe decir 100% ───────────────
  await abrirModal(page);
  const FALLA = ["f-1.pdf", "f-2.pdf", "f-3.pdf"].map((n) => `${RAIZ}/Fallidos/${n}`);
  await elegirCarpeta(page, FALLA);
  await page.waitForTimeout(1200);
  let subidas = 0;
  await page.route("**/api/admin/documents", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    subidas++;
    // El segundo se cae: así se ve una subida parcial, no un todo-o-nada.
    if (subidas === 2) return route.fulfill({ status: 500, body: '{"error":"boom"}' });
    return route.continue();
  });
  await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
  await page.getByText(/Subieron \d+ de \d+|archivos subidos/).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/11-con-un-error-dark.png` });
  console.log("\n=== SUBIDA PARCIAL ===\n" + (await textoModal(page)));
  await page.unroute("**/api/admin/documents");
  await page.getByRole("button", { name: "Cerrar", exact: true }).and(page.locator("button:not([aria-label])")).click();
  await page.waitForTimeout(1000);

  // ── 4 · Limpieza: nada de basura de QA en el drive ─────────────────────────
  console.log("\n=== LIMPIEZA ===", JSON.stringify(await limpiar(page, RAIZ)));

  console.log("\n=== REQUESTS FALLIDAS (" + fallidas.length + ") ===");
  for (const [f, n] of Object.entries(fallidas.reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {}))) {
    console.log(`- ${f} ×${n}`);
  }
  console.log("\n=== ERRORES DE CONSOLA (" + errores.length + ") ===");
  for (const e of errores.slice(0, 12)) console.log("- " + e.slice(0, 250));

  await browser.close();
  console.log("\nScreenshots en", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
