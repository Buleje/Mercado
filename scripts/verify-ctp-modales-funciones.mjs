/**
 * verify-ctp-modales-funciones — comprueba en el navegador las funciones que
 * ganaron los modales del Libro CTP: aviso de placa duplicada, Ctrl+Enter,
 * confirmación al cerrar con cambios y aviso de sobrecarga del vehículo.
 *
 * Uso: node scripts/verify-ctp-modales-funciones.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/ctp-modales/funciones";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
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
  console.error("login fail", login.status());
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=ctp-libro-operaciones`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("tab", { name: /Ingresos/i }).first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);

let fallas = 0;
const decir = (ok, txt) => {
  if (!ok) fallas++;
  console.log(`${ok ? "OK  " : "MAL "} ${txt}`);
};

async function irA(grupo, vista) {
  await page.getByRole("tab", { name: new RegExp(`^${grupo}`, "i") }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("tab", { name: new RegExp(vista, "i") }).first().click();
  await page.waitForTimeout(2500);
}

/**
 * El tenant de QA no tiene camiones cargados, así que los dos casos que
 * importan —placa repetida y carga que no entra— no se podrían ejercitar. Se
 * siembra uno con capacidad y se da de baja al terminar.
 */
const PLACA_TEST = "QAT-901";
const CAP_TEST = 30;
const sembrado = await page.evaluate(async ({ placa, cap }) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
  const r = await fetch("/api/admin/forestal/directorio/vehiculos", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(csrf) },
    credentials: "include",
    body: JSON.stringify({ placa, marca: "QA", capacidadM3: cap }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, id: j?.vehiculo?.id ?? null };
}, { placa: PLACA_TEST, cap: CAP_TEST });
console.log("vehículo de prueba:", sembrado.status, sembrado.id ?? "");

// ── 1. Directorio · vehículos ───────────────────────────────────────────────
await irA("Gestión", "Directorio");
await page.getByRole("button", { name: /Vehículos/i }).first().click();
await page.waitForTimeout(1500);

const placaExistente = sembrado.id ? PLACA_TEST : null;
console.log("placa existente detectada:", placaExistente ?? "ninguna");

await page.getByRole("button", { name: /Agregar vehículo/i }).first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });
await page.waitForTimeout(900);

// El foco arranca en la placa (antes caía en el botón de cerrar).
const focoInicial = await page.evaluate(() => document.activeElement?.getAttribute("class")?.includes("font-mono") ?? false);
decir(focoInicial, "el foco arranca en el campo Placa");

if (placaExistente) {
  await page.keyboard.type(placaExistente);
  await page.waitForTimeout(700);
  const estado = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const guardar = [...dlg.querySelectorAll("button")].find((b) => /^Guardar/.test(b.textContent?.trim() ?? ""));
    return {
      deshabilitado: guardar?.disabled ?? null,
      aviso: dlg.textContent?.includes("ya está en el directorio") || dlg.textContent?.includes("Ya existe"),
    };
  });
  decir(estado.deshabilitado === true, "con placa repetida, Guardar queda deshabilitado");
  decir(estado.aviso === true, "y el pie dice que esa placa ya está en el directorio");
  await page.screenshot({ path: `${OUT}/vehiculo-duplicado.png` });
}

// Cerrar con cambios pide confirmación.
let preguntó = false;
page.on("dialog", async (d) => {
  preguntó = /sin guardar/i.test(d.message());
  await d.dismiss();
});
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
decir(preguntó, "Escape con cambios sin guardar pide confirmación");
const sigueAbierto = (await page.locator('[role="dialog"]').count()) > 0;
decir(sigueAbierto, "y al cancelar la confirmación el modal NO se cierra");

// Al descartar el aviso, el modal sigue: ahora se limpia y se cierra derecho.
await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const inp = dlg?.querySelector("input");
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(inp, "");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
decir((await page.locator('[role="dialog"]').count()) === 0, "sin cambios, Escape cierra sin preguntar");

// ── 1b. Ctrl+Enter guarda sin ir al botón ───────────────────────────────────
const PLACA_ATAJO = "QAT-902";
await page.getByRole("button", { name: /Agregar vehículo/i }).first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });
await page.waitForTimeout(800);
await page.keyboard.type(PLACA_ATAJO);
await page.waitForTimeout(400);
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(2500);
const guardadoPorAtajo = await page.evaluate(async (placa) => {
  const r = await fetch("/api/admin/forestal/directorio", { credentials: "include" });
  const j = await r.json();
  const norm = placa.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return (j.vehiculos ?? []).find((v) => v.placa === norm)?.id ?? null;
}, PLACA_ATAJO);
decir(Boolean(guardadoPorAtajo), "Ctrl+Enter guarda el formulario sin tocar el botón");
decir((await page.locator('[role="dialog"]').count()) === 0, "y el modal se cierra al guardar");
if (guardadoPorAtajo) {
  await page.evaluate(async (id) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
    await fetch(`/api/admin/forestal/directorio/vehiculos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-csrf-token": decodeURIComponent(csrf) },
      credentials: "include",
    });
  }, guardadoPorAtajo);
}

// ── 2. Flete · aviso de sobrecarga ──────────────────────────────────────────
await irA("Gestión", "Fletes");
await page.getByRole("button", { name: /Anotar viaje/i }).first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });
await page.waitForTimeout(1200);

/** Un vehículo con capacidad declarada; si no hay, el caso no se puede probar. */
const capacidad = await page.evaluate(async () => {
  const r = await fetch("/api/admin/forestal/directorio", { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  const v = (j.vehiculos ?? []).find((x) => x.capacidadM3 != null && Number(x.capacidadM3) > 0);
  return v ? { id: v.id, cap: Number(v.capacidadM3), placa: v.placa } : null;
});
console.log("vehículo con capacidad:", capacidad ? `${capacidad.placa} · ${capacidad.cap} m³` : "ninguno");

if (capacidad) {
  // El selector de vehículo NO es el primer <select> del modal (antes está
  // "Qué movió"): se busca el que tiene la placa entre sus opciones.
  const elegido = await page.evaluate((id) => {
    const sel = [...document.querySelectorAll('[role="dialog"] select')].find((s) =>
      [...s.options].some((o) => o.value === id),
    );
    if (!sel) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(sel, id);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, capacidad.id);
  decir(elegido, "la placa sembrada aparece en el selector de vehículo");
  await page.waitForTimeout(700);
  const volumen = page.locator('[role="dialog"] input[type="number"]').first();
  await volumen.fill(String(capacidad.cap + 10));
  await page.waitForTimeout(700);
  const avisa = await page.evaluate(
    (cap) => document.querySelector('[role="dialog"]')?.textContent?.includes(`declara ${cap} m³`) ?? false,
    capacidad.cap,
  );
  decir(avisa, `el pie avisa que el viaje supera los ${capacidad.cap} m³ del camión`);
  await page.screenshot({ path: `${OUT}/flete-sobrecarga.png` });
} else {
  console.log("(sin vehículo con capacidad en el tenant: el aviso de sobrecarga no se pudo ejercitar)");
}

// El pie fijo se ve sin scrollear, con el formulario largo abierto.
const pieVisible = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const guardar = [...dlg.querySelectorAll("button")].find((b) => /Anotar el viaje|^Guardar/.test(b.textContent?.trim() ?? ""));
  if (!guardar) return null;
  const r = guardar.getBoundingClientRect();
  return r.bottom <= window.innerHeight && r.top >= 0;
});
decir(pieVisible === true, "la acción principal se ve sin scrollear el formulario");

await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  dlg?.querySelectorAll("input").forEach((i) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(i, i.type === "date" ? i.value : "");
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

// Limpieza: el camión de prueba no se queda en el directorio del tenant.
if (sembrado.id) {
  const baja = await page.evaluate(async (id) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
    const r = await fetch(`/api/admin/forestal/directorio/vehiculos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-csrf-token": decodeURIComponent(csrf) },
      credentials: "include",
    });
    return r.status;
  }, sembrado.id);
  console.log("baja del vehículo de prueba:", baja);
}

console.log("\nerrores JS:", erroresJs.length ? erroresJs : "ninguno");
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} chequeo(s) fallaron`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
