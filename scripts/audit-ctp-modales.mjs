/**
 * audit-ctp-modales — abre los modales del Libro de Operaciones CTP y MIDE lo
 * que "se ve mal" en vez de opinarlo: padding del cuerpo, si el pie de acciones
 * vive dentro del scroll (hay que scrollear para guardar), y cuánto scroll
 * sobra. Saca screenshot light + dark de cada uno.
 *
 * Uso: node scripts/audit-ctp-modales.mjs [antes|despues]
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const FASE = process.argv[2] ?? "antes";
const OUT = `reports/ctp-modales/${FASE}`;

/** Cada objetivo: grupo + vista de la cabina, y qué botón abre el modal. */
const OBJETIVOS = [
  { id: "flete", grupo: "Gestión", vista: "Fletes", abrir: /Anotar viaje/i },
  { id: "parte", grupo: "Gestión", vista: "Directorio", abrir: /^Agregar /i },
  { id: "vehiculo", grupo: "Gestión", vista: "Directorio", pestaña: /Vehículos/i, abrir: /Agregar vehículo/i },
  { id: "ingreso-nuevo", grupo: "Operación", vista: "Ingresos", abrir: /Nuevo ingreso/i },
  { id: "produccion-nueva", grupo: "Operación", vista: "Producción", abrir: /Nueva producción|Nuevo registro|Registrar producción/i },
  { id: "simulador", grupo: "Operación", vista: "Producción", abrir: /Simulador/i },
  { id: "kardex", grupo: "Control", vista: "Saldos", abrir: /Kardex/i },
  { id: "planta-coordenadas", grupo: "Trazabilidad", vista: "Planta", abrir: /Coordenadas/i },
  { id: "retrozar", grupo: "Trazabilidad", vista: "Trozas", abrir: /Retrozar|Cortar/i },
  { id: "importar-libro", especial: "importar" },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.setItem("admin-last-tab-ctp-libro", "ingresos");
  } catch {
    /* modo privado */
  }
});
const page = await ctx.newPage();
const erroresJs = [];
page.on("pageerror", (e) => erroresJs.push(String(e)));

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) {
  console.error("login fail", login.status(), await login.text());
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=ctp-libro-operaciones`, {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
});
await page.getByRole("tab", { name: /Ingresos/i }).first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);

/** Mide el modal abierto: padding real, pie dentro del scroll, overflow. */
async function medir() {
  return page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;
    // El área scrolleable de AdminModal es el hijo con overflow-y-auto.
    const scroller = [...dlg.querySelectorAll("div")].find((d) =>
      getComputedStyle(d).overflowY === "auto" && d.parentElement === dlg,
    );
    const primero = scroller?.firstElementChild ?? null;
    const cs = primero ? getComputedStyle(primero) : null;
    const botones = [...dlg.querySelectorAll("button")].filter((b) =>
      /^(guardar|registrar|cargar|confirmar|aceptar)/i.test((b.textContent ?? "").trim()),
    );
    const pieEnScroll = botones.length > 0 && botones.every((b) => scroller?.contains(b));
    return {
      ancho: Math.round(dlg.getBoundingClientRect().width),
      alto: Math.round(dlg.getBoundingClientRect().height),
      padTop: cs ? parseFloat(cs.paddingTop) : null,
      padLeft: cs ? parseFloat(cs.paddingLeft) : null,
      scrollH: scroller?.scrollHeight ?? null,
      clientH: scroller?.clientHeight ?? null,
      sobra: scroller ? scroller.scrollHeight - scroller.clientHeight : null,
      pieEnScroll,
      accionMasBaja: botones.length ? Math.round(Math.max(...botones.map((b) => b.getBoundingClientRect().bottom))) : null,
      tieneIcono: Boolean(dlg.querySelector("header, [class*='border-b']")?.querySelector("span.grid")),
    };
  });
}

async function cerrar() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

const resultados = [];
for (const obj of OBJETIVOS) {
  try {
    if (obj.especial === "importar") {
      await page.getByRole("button", { name: /Más acciones|Acciones/i }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole("menuitem", { name: /Importar libro/i }).click();
    } else {
      if (obj.grupo) {
        await page.getByRole("tab", { name: new RegExp(`^${obj.grupo}`, "i") }).first().click();
        await page.waitForTimeout(1200);
      }
      if (obj.vista) {
        const tab = page.getByRole("tab", { name: new RegExp(obj.vista, "i") }).first();
        await tab.click();
        await page.waitForTimeout(2500);
      }
      if (obj.pestaña) {
        await page.getByRole("button", { name: obj.pestaña }).first().click();
        await page.waitForTimeout(900);
      }
      await page.getByRole("button", { name: obj.abrir }).first().click();
    }
    await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });
    await page.waitForTimeout(1800);
    const m = await medir();
    resultados.push({ id: obj.id, ...m });
    console.log(obj.id, JSON.stringify(m));
    await page.screenshot({ path: `${OUT}/${obj.id}-light.png` });
    // dark: el tema vive en sessionStorage (ver memoria forzar-dark-en-playwright)
    await page.evaluate(() => {
      try {
        sessionStorage.setItem("buleje-theme-session-v2", "dark");
      } catch {
        /* noop */
      }
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${obj.id}-dark.png` });
    await page.evaluate(() => {
      try {
        sessionStorage.setItem("buleje-theme-session-v2", "light");
      } catch {
        /* noop */
      }
      document.documentElement.classList.remove("dark");
    });
    await cerrar();
  } catch (e) {
    console.log(obj.id, "NO SE PUDO:", String(e).split("\n")[0]);
    resultados.push({ id: obj.id, error: String(e).split("\n")[0] });
    await cerrar();
  }
}

await writeFile(`${OUT}/medidas.json`, JSON.stringify({ resultados, erroresJs }, null, 2));
console.log("\nerrores JS:", erroresJs.length ? erroresJs : "ninguno");
console.log("salida:", OUT);
await browser.close();
