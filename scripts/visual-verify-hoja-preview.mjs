// Vista previa de planillas del drive: que se vea CON el formato del archivo
// (monedas, colores, combinadas, anchos, congelado) y que un 429 salga como
// aviso y NO dibujado como si fuera el contenido del archivo.
//
// Sube un .xlsx real, lo mira en el modal, mide lo que se ve de verdad
// (getComputedStyle, no a ojo), fuerza el 429 con page.route y limpia.
//
// Uso: node scripts/visual-verify-hoja-preview.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/hoja-preview";
const NOMBRE = "presupuesto-qa.xlsx";

/** Una planilla como las de verdad: título combinado, encabezado con relleno,
 *  moneda, porcentaje, fecha, una fórmula, fila congelada y 300 filas. */
async function planilla() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Presupuesto");
  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.columns = [
    { width: 32 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 },
  ];

  ws.mergeCells("A1:E1");
  const titulo = ws.getCell("A1");
  titulo.value = "Presupuesto de obra — julio 2026";
  titulo.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A0A0" } };
  titulo.alignment = { horizontal: "center" };

  const cab = ws.addRow(["Descripción", "Cantidad", "Precio unitario", "Subtotal", "IGV"]);
  cab.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
    c.border = { bottom: { style: "thin" } };
  });

  const items = [
    ["Cemento Sol 42.5 kg", 120, 28.9],
    ["Fierro corrugado 1/2\"", 80, 41.5],
    ["Arena gruesa (m³)", 14, 65],
    ["Ladrillo King Kong (millar)", 6, 780],
  ];
  for (const [desc, cant, precio] of items) {
    const f = ws.addRow([desc, cant, precio, { formula: `B${ws.rowCount + 1}*C${ws.rowCount + 1}` }, 0.18]);
    f.getCell(3).numFmt = '"S/ "#,##0.00';
    f.getCell(4).numFmt = '"S/ "#,##0.00';
    f.getCell(5).numFmt = "0.00%";
  }
  ws.addRow(["Entrega estimada", new Date(2026, 7, 15)]).getCell(2).numFmt = "dd/mm/yyyy";
  // Relleno hasta 300 filas: sirve para probar las tandas ("mostrar más").
  for (let i = ws.rowCount; i < 300; i++) ws.addRow([`Partida ${i}`, i, i * 3.5]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);

const buf = await planilla();
await page.evaluate(async (bytes) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(bytes)], "presupuesto-qa.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, [...buf]);
await page.waitForTimeout(7000);

const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});
const mio = docs.find((d) => d.name === NOMBRE);
if (!mio) { console.error("MAL: no se subió la planilla"); await browser.close(); process.exit(1); }

/** Espera a que la tabla de la vista previa tenga contenido. */
async function abrirPreview() {
  await page.getByRole("button", { name: `Ver ${NOMBRE}` }).first().click();
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
    if (!d) return false;
    return !!d.querySelector("table tbody td") || /No se pudo|Reintento/i.test(d.textContent ?? "");
  }, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function cerrarPreview() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    ![...document.querySelectorAll("div")].some((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa")),
    { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// ── 1 · El formato del archivo, medido ───────────────────────────────────────
await abrirPreview();
const medido = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const tabla = modal?.querySelector("table");
  if (!tabla) return { falta: true, muestra: (modal?.textContent ?? "").slice(0, 200) };
  const tds = [...tabla.querySelectorAll("tbody td")];
  const textos = tds.map((td) => td.textContent?.trim() ?? "");
  const titulo = tds.find((td) => (td.textContent ?? "").includes("Presupuesto de obra"));
  const cab = tds.find((td) => (td.textContent ?? "").trim() === "Descripción");
  const anchos = [...tabla.querySelectorAll("colgroup col")].map((c) => c.style.width);
  return {
    moneda: textos.filter((t) => t.startsWith("S/")).slice(0, 3),
    porcentaje: textos.filter((t) => /^\d+\.\d+%$/.test(t)).slice(0, 2),
    fecha: textos.filter((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)).slice(0, 2),
    combinada: titulo ? Number(titulo.getAttribute("colspan") ?? 1) : 0,
    fondoTitulo: titulo ? getComputedStyle(titulo).backgroundColor : null,
    negritaCabecera: cab ? getComputedStyle(cab).fontWeight : null,
    anchos: anchos.slice(0, 5),
    filasDibujadas: tabla.querySelectorAll("tbody tr").length,
    estado: (modal.textContent ?? "").match(/\d+ filas × \d+ columnas/)?.[0] ?? null,
  };
});
console.log("\n=== FORMATO DEL ARCHIVO EN LA VISTA PREVIA ===");
if (medido.falta) console.log("  MAL no se dibujó la tabla:", medido.muestra);
else {
  console.log(`  ${medido.moneda.length ? "ok " : "MAL"} moneda            ${medido.moneda.join(" · ") || "(ninguna)"}`);
  console.log(`  ${medido.porcentaje.length ? "ok " : "MAL"} porcentaje        ${medido.porcentaje.join(" · ") || "(ninguno)"}`);
  console.log(`  ${medido.fecha.length ? "ok " : "MAL"} fecha              ${medido.fecha.join(" · ") || "(ninguna)"}`);
  console.log(`  ${medido.combinada > 1 ? "ok " : "MAL"} celda combinada    colspan=${medido.combinada}`);
  console.log(`  ${medido.fondoTitulo && medido.fondoTitulo !== "rgba(0, 0, 0, 0)" ? "ok " : "MAL"} relleno del título ${medido.fondoTitulo}`);
  console.log(`  ${Number(medido.negritaCabecera) >= 700 ? "ok " : "MAL"} encabezado negrita font-weight=${medido.negritaCabecera}`);
  console.log(`  ${new Set(medido.anchos).size > 1 ? "ok " : "MAL"} anchos del archivo ${medido.anchos.join(" | ")}`);
  console.log(`  ${medido.filasDibujadas > 60 ? "ok " : "MAL"} filas dibujadas    ${medido.filasDibujadas} · ${medido.estado}`);
}

// ── 2 · Buscar y totalizar (lo que se hace apenas se abre una planilla) ──────
await page.getByPlaceholder("Buscar en la hoja").fill("Cemento");
await page.waitForTimeout(500);
const busqueda = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  return (modal?.textContent ?? "").match(/\d+\/\d+/)?.[0] ?? null;
});
await page.getByPlaceholder("Buscar en la hoja").fill("");
await page.waitForTimeout(300);

// Clic en la cabecera de la columna C (precio unitario) → total de la columna.
await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const ths = [...(modal?.querySelectorAll("thead th") ?? [])];
  ths.find((t) => t.textContent?.trim() === "C")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(400);
const barra = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const txt = (modal?.textContent ?? "").replace(/\s+/g, " ");
  return {
    rango: txt.match(/C1:C\d+/)?.[0] ?? null,
    promedio: txt.match(/Promedio [\d.,]+/)?.[0] ?? null,
  };
});
// Los totales de las columnas de plata, sin tener que pedirlos.
const chips = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const botones = [...(modal?.querySelectorAll("button") ?? [])]
    .filter((b) => /^(Descripción|Cantidad|Precio unitario|Subtotal|IGV)/.test(b.textContent?.trim() ?? ""));
  return {
    lista: botones.map((b) => b.textContent?.trim()).slice(0, 4),
    imprimir: !!modal?.querySelector('button[title*="Imprimir"]'),
    enviar: !!modal?.querySelector('button[title*="WhatsApp"]'),
  };
});

console.log("\n=== BUSCAR Y TOTALIZAR ===");
console.log(`  ${chips.lista.length > 0 ? "ok " : "MAL"} totales automáticos: ${chips.lista.join(" | ") || "(ninguno)"}`);
console.log(`  ${chips.imprimir ? "ok " : "MAL"} botón de imprimir/PDF`);
console.log(`  ${chips.enviar ? "ok " : "MAL"} botón de mandar por WhatsApp`);
console.log(`  ${busqueda ? "ok " : "MAL"} buscar "Cemento"   ${busqueda ?? "(sin contador)"}`);
console.log(`  ${barra.rango ? "ok " : "MAL"} columna clickeada  ${barra.rango ?? "(sin rango)"} · ${barra.promedio ?? "sin promedio"}`);
await page.screenshot({ path: `${OUT}/01-hoja-formato-light.png` });

// En un celular el modal tiene que seguir siendo usable: la tabla scrollea por
// dentro y la barra de estado no se va afuera de la pantalla.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const mobil = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const caja = modal?.getBoundingClientRect();
  // El scroller es el marco con overflow-auto, no el envoltorio de la tabla.
  const tabla = [...(modal?.querySelectorAll("div") ?? [])].find((d) => d.className.includes("overflow-auto") && d.querySelector("table"));
  const tds = [...(modal?.querySelectorAll("tbody tr:nth-child(3) td") ?? [])].slice(0, 3)
    .map((td) => { const r = td.getBoundingClientRect(); return `${td.textContent?.trim().slice(0, 10)}@${Math.round(r.x)}+${Math.round(r.width)}`; });
  return {
    entra: caja ? caja.width <= window.innerWidth && caja.height <= window.innerHeight + 1 : false,
    scrollPropio: tabla ? tabla.scrollWidth > tabla.clientWidth : false,
    bodyDesborda: document.body.scrollWidth > window.innerWidth,
    anchoTabla: modal?.querySelector("table")?.getBoundingClientRect().width ?? 0,
    celdas: tds,
  };
});
await page.screenshot({ path: `${OUT}/06-hoja-mobile.png` });
console.log("\n=== MOBILE (390px) ===");
console.log(`  ${mobil.entra ? "ok " : "MAL"} el modal entra en pantalla`);
console.log(`  ${mobil.scrollPropio ? "ok " : "MAL"} la tabla scrollea por dentro`);
console.log(`  ${mobil.bodyDesborda ? "MAL" : "ok "} la página no scrollea de costado`);
console.log(`  tabla ${Math.round(mobil.anchoTabla)}px · celdas ${mobil.celdas.join(" ")}`);
await page.setViewportSize({ width: 1440, height: 950 });
await page.waitForTimeout(400);

// Modo oscuro: la clave real es `buleje-theme-session-v2` (contexts/theme-context.tsx).
await page.evaluate(() => sessionStorage.setItem("buleje-theme-session-v2", "dark"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await abrirPreview();
const temaDark = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const td = modal?.querySelector("tbody td:not([colspan])");
  return { fondoApp: getComputedStyle(document.body).backgroundColor, celda: td ? getComputedStyle(td).color : null };
});
await page.screenshot({ path: `${OUT}/02-hoja-formato-dark.png` });
console.log(`\n=== DARK ===\n  body ${temaDark.fondoApp} · texto de celda ${temaDark.celda}`);
await cerrarPreview();

// ── 3 · El bug reportado: 429 en el archivo ──────────────────────────────────
// Se fuerza el límite con page.route (el tenant real ya no lo alcanza con los
// cupos nuevos) y se verifica que NO se dibuje el JSON del error.
await page.route("**/api/admin/documents/*/raw*", (route) =>
  route.fulfill({
    status: 429,
    contentType: "application/json",
    headers: { "retry-after": "12" },
    body: JSON.stringify({ error: "Too many requests", message: "Has excedido el límite de solicitudes.", retryAfter: 12 }),
  }));
await abrirPreview();
const limite = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
  const txt = (modal?.textContent ?? "").replace(/\s+/g, " ");
  return {
    muestraJson: txt.includes("Too many requests") || txt.includes('{"error"'),
    aviso: /muchas solicitudes seguidas|pidió esperar un momento/i.test(txt),
    cuenta: txt.match(/Reintento automático en \d+s/)?.[0] ?? null,
    boton: !!modal && [...modal.querySelectorAll("button")].some((b) => /Reintentar ahora/i.test(b.textContent ?? "")),
  };
});
await page.screenshot({ path: `${OUT}/03-limite-429.png` });
console.log("\n=== LÍMITE (429) — el bug reportado ===");
console.log(`  ${limite.muestraJson ? "MAL" : "ok "} NO se dibuja el JSON del error`);
console.log(`  ${limite.aviso ? "ok " : "MAL"} aviso en criollo`);
console.log(`  ${limite.cuenta ? "ok " : "MAL"} cuenta regresiva   ${limite.cuenta ?? "(no aparece)"}`);
console.log(`  ${limite.boton ? "ok " : "MAL"} botón de reintento`);
await page.unroute("**/api/admin/documents/*/raw*");
await cerrarPreview();

// ── 4 · Limpieza ─────────────────────────────────────────────────────────────
const st = await page.evaluate(async (id) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
    method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
  });
  return r.status;
}, mio.id);
console.log(`\nlimpieza: ${st === 200 ? "ok" : `MAL (${st})`}`);
await dormir(200);
await browser.close();
