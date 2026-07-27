// Una carpeta de verdad (450 archivos, 60 subcarpetas): que el plan se arme
// sin trabar el modal y que avise que no entra en una sola tanda.
// NO sube nada — se queda en la vista previa y cancela.
//
// Uso: node scripts/visual-verify-import-grande.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Archivo 2026 QA";

// 410 subcarpetas con un archivo cada una: pasa los DOS topes de 400 (el del
// endpoint del árbol y el de archivos por tanda) en una sola prueba.
const ARBOL = [];
for (let i = 1; i <= 410; i++) {
  ARBOL.push(`${RAIZ}/expediente-${String(i).padStart(3, "0")}/doc-${i}.pdf`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: /Importar carpeta/i }).click();
await page.waitForTimeout(600);

const t0 = Date.now();
await page.evaluate((rs) => {
  const input = document.querySelector("input[webkitdirectory]");
  const dt = new DataTransfer();
  for (const r of rs) {
    const f = new File([new Uint8Array(1024)], r.split("/").pop(), { type: "application/pdf" });
    Object.defineProperty(f, "webkitRelativePath", { value: r });
    dt.items.add(f);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, ARBOL);
await page.getByText(/Importar \d+ archivos/).waitFor({ timeout: 30_000 });
const msPlan = Date.now() - t0;

await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/13-plan-grande.png` });

const datos = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const pie = d?.querySelector("span")?.textContent ?? "";
  return {
    filasEnDom: d?.querySelectorAll("li").length ?? 0,
    texto: (d?.innerText ?? "").split("\n").filter((l) => /archivos|tanda|carpeta/i.test(l)).slice(0, 6),
    pie,
  };
});

console.log(`archivos en el árbol: ${ARBOL.length}`);
console.log(`el plan tardó: ${msPlan} ms`);
console.log("filas en el DOM:", datos.filasEnDom);
console.log("líneas relevantes:\n  " + datos.texto.join("\n  "));

// ¿La lista scrollea fluido con tantas filas?
const scroll = await page.evaluate(() => {
  const ul = document.querySelector('[role="dialog"] ul');
  if (!ul) return null;
  const t = performance.now();
  for (let i = 0; i < 20; i++) { ul.scrollTop = i * 40; void ul.offsetHeight; }
  return Math.round(performance.now() - t);
});
console.log("20 scrolls forzados:", scroll, "ms");

// ── Import completo con la red SIMULADA ────────────────────────────────────
// 410 archivos de verdad serían 410 filas en la base y una hora de limpieza
// (borrar tiene rate limit). Con las dos rutas interceptadas se ejercita el
// cliente entero —troceo del árbol, tanda de 400, progreso— sin escribir nada.
let llamadasArbol = 0;
let rutasPorLlamada = [];
let subidas = 0;

await page.route("**/api/admin/documents/folders/tree", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  llamadasArbol++;
  rutasPorLlamada.push(body.rutas.length);
  const idPorRuta = Object.fromEntries(body.rutas.map((r, i) => [r, `fake-${llamadasArbol}-${i}`]));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idPorRuta, creadas: body.rutas.length }) });
});
await page.route("**/api/admin/documents", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  subidas++;
  await route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ document: { id: `d-${subidas}`, name: `d-${subidas}`, size: 1024, tags: [], aiTags: [], allowedRoles: [] } }),
  });
});
await page.route("**/api/admin/documents/existing", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ porCarpeta: {} }) }));

const t1 = Date.now();
await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/14-progreso-grande.png` });
await page.getByText("Importación terminada").waitFor({ timeout: 180_000 });
const msImport = Date.now() - t1;
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/15-listo-grande.png` });

console.log(`\nllamadas al árbol: ${llamadasArbol} (rutas por llamada: ${rutasPorLlamada.join(" + ")})`);
console.log(`subidas hechas: ${subidas} (de ${ARBOL.length} del árbol)`);
console.log(`import simulado en: ${(msImport / 1000).toFixed(1)} s`);
const final = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return (d?.innerText ?? "").split("\n").filter((l) => /%|archivos|tanda/i.test(l)).slice(0, 5);
});
console.log("cierre:\n  " + final.join("\n  "));

// ── Detener a mitad ────────────────────────────────────────────────────────
// Con 400 archivos, equivocarse de carpeta y no poder frenar es un castigo.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
subidas = 0;
await page.route("**/api/admin/documents/folders/tree", (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  const idPorRuta = Object.fromEntries(body.rutas.map((r, i) => [r, `fake-${i}`]));
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idPorRuta, creadas: 0 }) });
});
await page.route("**/api/admin/documents", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  subidas++;
  await new Promise((r) => setTimeout(r, 60)); // subida lenta, para poder frenar
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ document: { id: `d-${subidas}`, name: "x", size: 1024, tags: [], aiTags: [], allowedRoles: [] } }) });
});
await page.route("**/api/admin/documents/existing", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ porCarpeta: {} }) }));

await page.getByRole("button", { name: /Importar carpeta/i }).click();
await page.waitForTimeout(600);
await page.evaluate((rs) => {
  const input = document.querySelector("input[webkitdirectory]");
  const dt = new DataTransfer();
  for (const r of rs) {
    const f = new File([new Uint8Array(1024)], r.split("/").pop(), { type: "application/pdf" });
    Object.defineProperty(f, "webkitRelativePath", { value: r });
    dt.items.add(f);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, ARBOL);
await page.getByText(/Importar \d+ archivos/).waitFor({ timeout: 30_000 });
await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
await page.waitForTimeout(2500);
const antesDeFrenar = subidas;
await page.getByRole("button", { name: "Detener" }).click();
await page.getByText(/Lo detuviste/).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
const despues = subidas;
await page.screenshot({ path: `${OUT}/16-detenido.png` });
const cartel = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return (d?.innerText ?? "").split("\n").find((l) => l.includes("detuviste")) ?? "(sin cartel)";
});
console.log(`\nfrenado: ${antesDeFrenar} subidas al apretar, ${despues} al final (${despues - antesDeFrenar} en vuelo que ya no se pueden cortar)`);
console.log("cartel:", cartel);
console.log("¿siguió subiendo después de frenar?", despues - antesDeFrenar > 6 ? "SÍ — mal" : "no (correcto)");

const mensajes = [];
page.on("console", (m) => mensajes.push(`${m.type()}: ${m.text().slice(0, 160)}`));
page.on("pageerror", (e) => mensajes.push("pageerror: " + e.message.slice(0, 160)));

// ── Soltar una CARPETA en el drive abre el importador ──────────────────────
// El navegador no deja fabricar un drop de carpeta real, pero la app sólo usa
// `webkitGetAsEntry`: se falsifica esa API y se ejercita el camino entero.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const abrio = await page.evaluate(() => {
  const archivo = (nombre) => ({
    isFile: true, isDirectory: false, name: nombre,
    file: (cb) => cb(new File([new Uint8Array(2048)], nombre, { type: "application/pdf" })),
  });
  const hijos = [archivo("contrato-1.pdf"), archivo("contrato-2.pdf")];
  const carpeta = {
    isFile: false, isDirectory: true, name: "Soltada QA",
    createReader: () => {
      let dado = false;
      // OJO: marcar la tanda ANTES de llamar al callback. El lector reentra en
      // readEntries desde el propio callback; al revés es recursión infinita.
      return {
        readEntries: (cb) => {
          const tanda = dado ? [] : hijos;
          dado = true;
          cb(tanda);
        },
      };
    },
  };
  const dataTransfer = { items: [{ kind: "file", webkitGetAsEntry: () => carpeta }], files: [], types: ["Files"] };
  // El onDrop vive en el contenedor del módulo; hay que disparar DENTRO (los
  // eventos suben, no bajan). Los KPIs siempre están adentro.
  // El texto del KPI va en minúsculas en el DOM (la mayúscula es CSS).
  const destino = [...document.querySelectorAll("p, span, div")]
    .reverse()
    .find((d) => /total archivos/i.test(d.textContent ?? "") && d.children.length === 0)
    ?? document.body;
  const ev = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
  // ¿Alguien lo escuchó? Un listener propio confirma que el evento llega al
  // contenedor del módulo (si no, el problema es el destino, no la app).
  let llego = false;
  const espia = () => { llego = true; };
  destino.addEventListener("drop", espia);
  destino.dispatchEvent(ev);
  destino.removeEventListener("drop", espia);
  return { llego, destino: destino.className.slice(0, 40) };
});

await page.waitForTimeout(2000);
const trasSoltar = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return d ? d.innerText.split("\n").filter(Boolean).slice(0, 8) : ["(no abrió el modal)"];
});
await page.screenshot({ path: `${OUT}/17-carpeta-soltada.png` });
console.log(`\ndrop de carpeta (llegó al DOM: ${abrio.llego}, destino: ${abrio.destino}):\n  ` + trasSoltar.join("\n  "));
console.log("consola durante el drop:\n  " + mensajes.filter((m) => !m.includes("Failed to load")).slice(-6).join("\n  "));

await browser.close();
