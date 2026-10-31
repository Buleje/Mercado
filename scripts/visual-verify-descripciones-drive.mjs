// Verifica en el navegador las tres cosas de la ronda "descripciones + panel":
//   1. el panel de carpetas del visor se estira arrastrando el borde (y recuerda);
//   2. la lista dice POR QUÉ apareció cada documento al buscar por descripción;
//   3. la ficha deja escribir la descripción propia y la guarda.
//
// Uso: node scripts/visual-verify-descripciones-drive.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/drive-descripciones";
const fallos = [];
const ok = (cond, msg) => { console.log(`${cond ? "OK  " : "MAL "} ${msg}`); if (!cond) fallos.push(msg); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }
await mkdir(OUT, { recursive: true });

await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);

// ── 1. Buscar por lo que DICE el documento (no por su nombre) ────────────────
const buscador = page.getByPlaceholder(/Buscar por nombre|Describí lo que buscás/i);
// "alquiler del local": ninguna de esas palabras junta está en el nombre del
// archivo, pero sí en la descripción que escribió la IA. Antes daba 0.
await buscador.fill("alquiler del local");
await page.waitForTimeout(2500);
ok(await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().isVisible(),
  "buscar por lo que DICE el documento lo encuentra (antes: 0 resultados)");
// La tarjeta dice de qué se trata. Si ya se guardó una descripción propia (la
// escribe este mismo script más abajo), esa es la que gana: por eso valen las dos.
const descEnTarjeta = await page.locator("main").getByText(/El contrato de alquiler es un acuerdo|Es el contrato del puesto 3/i).count();
ok(descEnTarjeta > 0, "la tarjeta muestra de qué se trata sin abrirlo");

// Un término que sólo vive en la descripción: ahí la lista tiene que decir
// EN DÓNDE coincidió, porque el nombre no lo explica.
await buscador.fill("arrendador");
await page.waitForTimeout(2500);
const motivos = await page.locator("main").getByText(/En la descripción:|En tu descripción:|En el contenido:/i).allTextContents();
ok(motivos.length > 0, `la lista explica por qué apareció: ${JSON.stringify(motivos[0]?.slice(0, 60) ?? "")}`);
await buscador.fill("alquiler del local");
await page.waitForTimeout(2000);
const orden = await page.getByRole("combobox", { name: /Ordenar documentos/i }).inputValue();
ok(orden === "relevancia", `buscando, el orden pasa a "Más parecidos" (valor=${orden})`);
await page.screenshot({ path: `${OUT}/busqueda-porque.png` });

// ── 2. Abrir la ficha: descripción de la IA + escribir la propia ─────────────
await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().click();
await page.getByRole("button", { name: /^Detalles/ }).click();
await page.waitForTimeout(1200);

const bloque = page.locator("section", { hasText: "De qué se trata" }).first();
ok(await bloque.isVisible(), "la ficha muestra el bloque «De qué se trata»");
const textoIA = await bloque.innerText();
ok(/alquiler/i.test(textoIA), "la descripción de la IA habla del alquiler");
await page.screenshot({ path: `${OUT}/ficha-descripcion.png` });

const MIA = `Es el contrato del puesto 3 — QA ${process.pid}`;
await bloque.getByRole("button", { name: /descripción/i }).first().click();
await page.locator("textarea").first().fill(MIA);
// Esperar la RESPUESTA del servidor, no un reloj: el clic sólo despacha el
// pedido, y leer la pantalla antes de que conteste da un falso negativo.
const guardado = page.waitForResponse(
  (r) => r.url().includes("/api/admin/documents/") && r.request().method() === "PATCH",
  { timeout: 60_000 },
);
await page.getByRole("button", { name: /^Guardar$/ }).click();
const respuesta = await guardado;
ok(respuesta.ok(), `el servidor guardó la descripción (HTTP ${respuesta.status()})`);
await bloque.getByText(MIA).waitFor({ timeout: 15_000 }).catch(() => {});
ok((await bloque.innerText()).includes(MIA), "la descripción propia queda guardada y visible");

// Y entra al buscador: es el punto de todo esto.
const guardada = await page.evaluate(async (frag) => {
  // Con el token CSRF: el drive lo exige hasta en las lecturas, y sin él la
  // respuesta es un error que se leería como "no hay resultados".
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
  const r = await fetch(`/api/admin/documents?q=${encodeURIComponent(frag)}`, {
    credentials: "include",
    headers: { "x-csrf-token": decodeURIComponent(csrf) },
  });
  const { documents = [] } = await r.json();
  return documents.map((d) => d.name);
}, `puesto 3 — QA ${process.pid}`);
ok(guardada.includes("contrato-local-2026.docx"), `buscando la descripción propia aparece el documento: ${JSON.stringify(guardada)}`);

// ── 3. El panel de carpetas se estira ───────────────────────────────────────
await page.getByRole("button", { name: /^Vista previa/ }).click();
await page.waitForTimeout(800);
const aside = page.getByRole("complementary", { name: /Carpetas del drive/i });
const divisor = page.getByRole("separator", { name: /ancho del panel/i });
ok(await aside.isVisible(), "el panel de carpetas está a la vista");
const anchoInicial = (await aside.boundingBox())?.width ?? 0;

const caja = await divisor.boundingBox();
await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
await page.mouse.down();
await page.mouse.move(caja.x + 140, caja.y + caja.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
const anchoNuevo = (await aside.boundingBox())?.width ?? 0;
ok(anchoNuevo > anchoInicial + 100, `arrastrando el borde el panel crece: ${Math.round(anchoInicial)} → ${Math.round(anchoNuevo)} px`);
await page.screenshot({ path: `${OUT}/panel-ancho.png` });

// Recuerda la medida: se cierra y se vuelve a abrir el documento.
await page.getByRole("button", { name: /^Cerrar$/ }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().click();
await page.waitForTimeout(1200);
const anchoRecordado = (await page.getByRole("complementary", { name: /Carpetas del drive/i }).boundingBox())?.width ?? 0;
ok(Math.abs(anchoRecordado - anchoNuevo) < 6, `al reabrir mantiene el ancho elegido (${Math.round(anchoRecordado)} px)`);

// Doble clic vuelve al de fábrica.
await page.getByRole("separator", { name: /ancho del panel/i }).dblclick();
await page.waitForTimeout(400);
const anchoReset = (await page.getByRole("complementary", { name: /Carpetas del drive/i }).boundingBox())?.width ?? 0;
ok(Math.abs(anchoReset - 224) < 6, `doble clic en el divisor vuelve a 224 px (${Math.round(anchoReset)})`);

// Plegado: queda el riel y el documento gana la pantalla.
await page.getByRole("button", { name: /Plegar el panel/i }).click();
await page.waitForTimeout(400);
ok(!(await page.getByRole("complementary", { name: /Carpetas del drive/i }).isVisible()), "plegar esconde el panel");
ok(await page.getByRole("button", { name: /Mostrar el panel/i }).isVisible(), "queda el riel para traerlo de vuelta");
await page.screenshot({ path: `${OUT}/panel-plegado.png` });

// ── 4. La deuda visible: lo que todavía no se puede buscar ──────────────────
await page.getByRole("button", { name: /Mostrar el panel/i }).click();
await page.getByRole("button", { name: /^Cerrar$/ }).click();
await buscador.fill("");
await page.waitForTimeout(2500);
const barra = page.locator("div", { hasText: /no tienen? descripción/i }).last();
ok(await barra.isVisible(), "la barra dice cuántos documentos no se pueden buscar por su contenido");
ok(await page.getByRole("button", { name: /Describirlos con IA/i }).isVisible(), "hay un botón para describirlos de una");
await page.getByRole("button", { name: /Ver cuáles/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/sin-describir.png` });
ok(await page.getByRole("button", { name: /Ver todos/i }).isVisible(), "el filtro «sin describir» queda marcado y se puede deshacer");
await page.getByRole("button", { name: /Ver todos/i }).click();
await page.waitForTimeout(800);

// ── 5. Modo oscuro de lo nuevo ──────────────────────────────────────────────
await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().click();
await page.waitForTimeout(1000);
await page.evaluate(() => {
  try { sessionStorage.setItem("buleje-theme-session-v2", "dark"); } catch {}
  document.documentElement.classList.add("dark");
});
await page.getByRole("button", { name: /^Detalles/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/ficha-dark.png` });

console.log(fallos.length === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos.length} fallo(s):\n· ${fallos.join("\n· ")}`);
await browser.close();
process.exit(fallos.length === 0 ? 0 : 1);
