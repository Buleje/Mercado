// QA: datos oficiales de la GTF de salida (propietario/destinatario/transportista/
// vehículo/traslado/títulos) + impresión en original y 2 copias.
//
// Verifica lo que un puesto de control mira: que los datos se guarden, sobrevivan
// una recarga, y que el original NO se imprima incompleto.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const [USER, PASS, SLUG] = ["qaadmin", "Qa-admin-1234", "main"];
const ok = (c, m) => console.log(`${c ? "✅" : "❌"} ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: USER, password: PASS, tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("LOGIN FAIL", login.status(), await login.text()); process.exit(1); }

// La serie de la GTF la autoriza la ARFFS y vive en la Ficha: sin serie no hay
// número que emitir, así que se asegura antes de probar el flujo.
const fichaGet = await page.request.get(`${BASE}/api/admin/forestal/ctp-ficha`);
const fichaJson = await fichaGet.json().catch(() => ({}));
const ficha = fichaJson.ficha ?? {};
console.log("ficha:", JSON.stringify({ razonSocial: ficha.razonSocial, ruc: ficha.ruc, gtfSerie: ficha.gtfSerie, titulos: (ficha.titulos ?? []).length }));

await page.addInitScript(() => localStorage.setItem("onboarding-completed-main", "1"));
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);

// Las pestañas del libro son `role="tab"`, no botones (libro-chrome).
await page.getByRole("tab", { name: /Despacho/ }).first().click();
// La vista compila on-demand: se espera la FILA, no un timeout fijo.
const cadena = page.getByRole("button", { name: "Cadena" });
await cadena.first().waitFor({ timeout: 90000 }).catch(() => {});
const nCadena = await cadena.count();
if (nCadena === 0) { console.error("SIN DESPACHOS EN EL PERÍODO"); await browser.close(); process.exit(2); }
// El ÚLTIMO despacho: los primeros pueden caer en un período ya cerrado, y una
// guía de un mes cerrado no se retoca (guard de `guardarGtfDatos`).
const fila = cadena.nth(nCadena - 1);

const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/origenes?") && r.request().method() === "GET", { timeout: 30000 }),
  fila.click(),
]);
const json = await resp.json();
ok(json.guia !== undefined, `GET /origenes devuelve la guía: ${JSON.stringify(json.guia)?.slice(0, 80)}`);
await page.waitForTimeout(1200);

// ── Emitir el número si no lo tiene ────────────────────────────────────────
const numero = () => page.locator("section", { hasText: "GTF de salida" }).locator(".font-mono").first().innerText();
console.log("N° inicial:", (await numero().catch(() => "?")).trim());

const btnEmitir = page.getByRole("button", { name: /Emitir GTF|Re-emitir/ });
if (await btnEmitir.count()) {
  const [rEmitir] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/forestal/ctp") && r.request().method() === "PATCH", { timeout: 30000 }),
    btnEmitir.first().click(),
  ]);
  const bodyEmitir = await rEmitir.json().catch(() => ({}));
  ok(rEmitir.status() === 200, `emitir_gtf → ${rEmitir.status()} ${JSON.stringify(bodyEmitir).slice(0, 120)}`);
  await page.waitForTimeout(900);
}
console.log("N° tras emitir:", (await numero().catch(() => "?")).trim());

// ── Abrir el formulario de la guía ─────────────────────────────────────────
const btnAbrir = page.getByRole("button", { name: /Completar la guía|Ver datos de la guía|Ocultar datos/ });
if (await btnAbrir.count()) {
  const label = (await btnAbrir.first().innerText()).trim();
  if (!/Ocultar/i.test(label)) await btnAbrir.first().click();
  await page.waitForTimeout(700);
}
ok(await page.getByText(/El dueño de la madera es este CTP/).isVisible().catch(() => false), "formulario de la guía abierto");

// Autollenado: el propietario arranca con la identidad del CTP.
const propietario = await page.locator('input[type="text"]').first().inputValue().catch(() => "");
ok(
  !ficha.razonSocial || propietario === ficha.razonSocial || propietario === ficha.nombreCtp,
  `propietario autollenado con la Ficha: "${propietario}" (ficha: "${ficha.razonSocial ?? ""}")`,
);

const btnImprimir = page.getByRole("button", { name: /Imprimir guía \(3 copias\)/ });
const setCampo = async (label, valor) => {
  const inp = page.locator("label", { hasText: new RegExp(`^${label}`) }).locator("input").first();
  await inp.fill(valor);
};

// El original no se imprime a medias. Se prueba vaciando el destinatario, así el
// resultado no depende de si la guía ya venía cargada de una corrida anterior.
// Los botones de sección llevan un punto con aria-label cuando tienen pendientes:
// el nombre accesible pasa a ser "Destinatario tiene datos pendientes" → no exact.
await page.getByRole("button", { name: /^Destinatario/ }).click();
await setCampo("Destinatario", "");
await page.waitForTimeout(300);
const faltanTexto = await page.getByText(/para poder imprimirla/).innerText().catch(() => "");
console.log("faltantes:", faltanTexto.replace(/\s+/g, " ").slice(0, 90));
ok(await btnImprimir.isDisabled(), "«Imprimir guía» deshabilitado sin destinatario");
ok(
  await page.getByText(/Sin destinatario no se puede verificar la entrega/).isVisible().catch(() => false),
  "el aviso dice POR QUÉ se pide el dato, no «campo obligatorio»",
);
await page.screenshot({ path: "reports/ctp-gtf-datos-incompleta.png" });

// ── Completar los campos que pide un control ───────────────────────────────
await setCampo("Destinatario", "Distribuidora Lima SAC");
await setCampo("Dirección", "Av. Argentina 456, Callao");

await page.getByRole("button", { name: /Transportista y vehículo/ }).click();
await setCampo("Transportista", "Transportes Ucayali EIRL");
await setCampo("Placa", "abc-123");
await setCampo("Conductor", "Juan Pérez Ríos");
// Se lee ACÁ, con la sección abierta: al cambiar de paso el campo sale del DOM.
const placa = await page.locator("label", { hasText: /^Placa/ }).locator("input").first().inputValue().catch(() => "");
ok(placa === "ABC-123", `placa normalizada a mayúsculas: "${placa}"`);

await page.getByRole("button", { name: /Traslado y títulos/ }).click();
await setCampo("Punto de partida", "Planta CTP · Pucallpa");
await setCampo("Punto de llegada", "Callao");
await setCampo("Inicio del traslado", "2026-07-29");
await setCampo("Títulos habilitantes", "CON-25-TAH-001, PER-24-002");
await page.waitForTimeout(400);

ok(await page.getByText(/La guía está completa/).isVisible().catch(() => false), "el estado pasa a «guía completa»");
ok(!(await btnImprimir.isDisabled()), "«Imprimir guía» habilitado con la guía completa");

// ── Guardar y recargar ────────────────────────────────────────────────────
const [rGuardar] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/admin/forestal/ctp") && r.request().method() === "PATCH", { timeout: 30000 }),
  page.getByRole("button", { name: /Guardar datos/ }).click(),
]);
const bodyGuardar = await rGuardar.json().catch(() => ({}));
ok(rGuardar.status() === 200, `gtf_datos → ${rGuardar.status()}`);
ok(
  bodyGuardar?.datos?.vehiculo?.placa === "ABC-123" && bodyGuardar?.datos?.destinatario?.nombre === "Distribuidora Lima SAC",
  `la respuesta devuelve los datos normalizados: ${JSON.stringify(bodyGuardar?.datos?.vehiculo ?? null)?.slice(0, 80)}`,
);
await page.waitForTimeout(600);
await page.screenshot({ path: "reports/ctp-gtf-datos-completa.png" });

// Recargar el modal desde la base: lo guardado tiene que volver.
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
const [resp2] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/origenes?") && r.request().method() === "GET", { timeout: 30000 }),
  page.getByRole("button", { name: "Cadena" }).nth(nCadena - 1).click(),
]);
const json2 = await resp2.json();
ok(
  json2.guia?.gtfDatos?.vehiculo?.placa === "ABC-123" && json2.guia?.gtfDatos?.titulos?.length === 2,
  `persistió tras recargar: placa=${json2.guia?.gtfDatos?.vehiculo?.placa} títulos=${JSON.stringify(json2.guia?.gtfDatos?.titulos)}`,
);
// El número de la guía sale de la base: al reabrir no puede decir "sin emitir".
ok(Boolean(json2.guia?.gtfNumber), `la guía reabierta trae su N°: ${json2.guia?.gtfNumber}`);
await page.waitForTimeout(900);
// Con número emitido el panel abre desplegado: el botón dice "Ocultar datos".
ok(
  !(await page.getByRole("button", { name: /Ocultar datos|Ver datos de la guía|Completar la guía/ }).first().isDisabled()),
  "al reabrir, el panel de la guía queda operable (el N° viene de la base, no de la fila)",
);
await page.waitForTimeout(1000);

// ── Imprimir: original + 2 copias ─────────────────────────────────────────
const abrir2 = page.getByRole("button", { name: /Ver datos de la guía|Completar la guía/ });
if (await abrir2.count()) { await abrir2.first().click(); await page.waitForTimeout(800); }
await page.getByRole("button", { name: /Imprimir guía \(3 copias\)/ }).waitFor({ timeout: 20000 });

const popupPromise = ctx.waitForEvent("page", { timeout: 30000 });
await page.getByRole("button", { name: /Imprimir guía \(3 copias\)/ }).click();
const popup = await popupPromise.catch(() => null);
if (popup) {
  await popup.waitForTimeout(1200);
  const texto = await popup.evaluate(() => document.body.innerText).catch(() => "");
  const html = await popup.content().catch(() => "");
  ok(/ORIGINAL/.test(texto) && /COPIA 1/.test(texto) && /COPIA 2/.test(texto), "el PDF trae ORIGINAL + COPIA 1 + COPIA 2");
  ok((html.match(/class="copia"/g) ?? []).length === 3, `3 secciones imprimibles (${(html.match(/class="copia"/g) ?? []).length})`);
  ok(/ABC-123/.test(texto), "la placa está en el papel");
  ok(/Distribuidora Lima SAC/.test(texto), "el destinatario está en el papel");
  ok(/CON-25-TAH-001/.test(texto), "los títulos habilitantes están en el papel");
  ok(/Declaración jurada/i.test(texto), "el papel dice que es declaración jurada (Ley 29763 art. 124)");
  ok(/Visado \/ marca de la ARFFS/i.test(texto), "recuadro del visado de la ARFFS (art. 4)");
  ok(/Arial/.test(html), "tipografía Arial (art. 3)");
  await popup.screenshot({ path: "reports/ctp-gtf-pdf-original.png", fullPage: false });
  await popup.close();
} else {
  ok(false, "no se abrió la ventana de impresión");
}

// ── Dark ──────────────────────────────────────────────────────────────────
await page.evaluate(() => {
  sessionStorage.setItem("buleje-theme-session-v2", "dark");
  document.documentElement.classList.add("dark");
});
await page.waitForTimeout(600);
await page.screenshot({ path: "reports/ctp-gtf-datos-dark.png" });

await browser.close();
console.log("listo");
