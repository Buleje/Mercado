// Verifica que la subida del drive AVISE en vez de fallar en silencio:
//   - un archivo más pesado que el máximo se rechaza ANTES de subirlo,
//   - uno sin extensión reconocible también,
//   - el panel de progreso muestra el motivo y NO se auto-cierra si algo falló.
//
// Uso: node scripts/visual-verify-subida-rechazos.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
const page = await ctx.newPage();
const consola = [];
page.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);

// Dos archivos que el servidor rechazaría igual: uno de 60 MB (máx 50) y uno
// sin extensión (el navegador no le pone tipo).
await page.evaluate(() => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')]
    .find((i) => !i.hasAttribute("webkitdirectory"));
  if (!input) {
    const todos = [...document.querySelectorAll('input[type="file"]')]
      .map((i) => `multiple=${i.multiple} dir=${i.hasAttribute("webkitdirectory")} accept=${i.getAttribute("accept")}`);
    throw new Error("no encontré el input de subir archivos. Hay: " + JSON.stringify(todos));
  }
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(60 * 1024 * 1024)], "informe-gigante.pdf", { type: "application/pdf" }));
  dt.items.add(new File([new Uint8Array(1024)], "BLAS doc", { type: "" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

await page.waitForTimeout(2500);
const panel = await page.evaluate(() => {
  const p = [...document.querySelectorAll("div")].find((d) => d.textContent?.startsWith("Subiendo ") && d.className.includes("fixed"));
  return p ? p.innerText : "(sin panel)";
});
console.log("=== PANEL DE SUBIDA ===\n" + panel);
await page.screenshot({ path: `${OUT}/12-rechazos-light.png` });

// El panel NO debe irse solo cuando hubo errores (2.5 s es su timer).
await page.waitForTimeout(4000);
const sigueVisible = await page.evaluate(() =>
  [...document.querySelectorAll("div")].some((d) => d.textContent?.startsWith("Subiendo ") && d.className.includes("fixed")));
console.log("\n¿el panel sigue visible tras el timer?", sigueVisible ? "sí (correcto)" : "NO — se perdió el aviso");

console.log("\nerrores de consola:", consola.length);
for (const e of consola.slice(0, 6)) console.log("- " + e.slice(0, 160));

await browser.close();
