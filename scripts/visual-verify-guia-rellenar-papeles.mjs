/** ADR-371: el botón que rellena la guía y la carga de papeles clasificados. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000", SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const TMP = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad";
const DARK = process.argv.includes("--dark");

await mkdir(OUT, { recursive: true });
// Papeles de prueba: uno que el contenido delata y otro sólo por el nombre.
await writeFile(`${TMP}/factura-escaneada.txt`, "FACTURA ELECTRONICA F001-00001234\nIGV 18%\nMaderera San Martin SAC");
await writeFile(`${TMP}/IMG_20260808.txt`, "GUIA DE TRANSPORTE FORESTAL - GTF N 001-0000025 - declaracion jurada");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript((d) => { try { localStorage.setItem("onboarding-completed-main","1"); if (d) sessionStorage.setItem("buleje-theme-session-v2","dark"); } catch {} }, DARK);
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=despacho`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(9000);

// ── A · Rellenar los datos de la guía ──
await page.getByRole("button", { name: /Nuevo despacho/i }).first().click();
await page.waitForTimeout(3500);
const d = page.getByRole("dialog").last();
/** Cuenta campos vacíos de la pestaña de datos (sin la lista de productos). */
const vacios = async () =>
  d.evaluate((el) => {
    const campos = [...el.querySelectorAll("input, select, textarea")].filter((c) => {
      const t = (c).type;
      return t !== "checkbox" && t !== "file" && t !== "hidden" && !(c).disabled && !(c).readOnly;
    });
    const sinLlenar = campos.filter((c) => !String((c).value ?? "").trim() || (c).value === "ninguno");
    return {
      total: campos.length,
      vacios: sinLlenar.length,
      cuales: sinLlenar
        .map((c) => {
          const rot = c.closest("label")?.textContent
            ?? (c.getAttribute("aria-labelledby") ? document.getElementById(c.getAttribute("aria-labelledby"))?.textContent : null)
            ?? c.getAttribute("aria-label")
            ?? c.getAttribute("placeholder")
            ?? c.closest("[role=group]")?.getAttribute("aria-label")
            ?? "?";
          return rot.replace(/\s+/g, " ").trim().slice(0, 30);
        })
        .slice(0, 25),
      detalle: sinLlenar
        .map((c) => {
          const sec = c.closest("section")?.querySelector("h3")?.textContent?.trim().slice(0, 26) ?? "(fuera de bloque)";
          /* `Field` asocia por htmlFor: el rótulo está en el label que apunta
             al id, no en un ancestro. */
          const porFor = c.id ? document.querySelector(`label[for="${c.id}"]`)?.textContent : null;
          const rot = (porFor ?? c.closest("label")?.textContent ?? c.getAttribute("placeholder") ?? c.tagName.toLowerCase())
            .replace(/\s+/g, " ").trim().slice(0, 32);
          return `${sec} › ${rot}`;
        })
        .slice(0, 25),
    };
  });

const a = await vacios();
console.log(`ANTES: ${a.vacios} vacíos de ${a.total} campos`);
/* El botón se apaga mientras llega la Ficha del CTP: apretarlo antes contestaba
   «se completó nada» y medía un relleno sin fuente. */
const listo = await d
  .getByRole("button", { name: /^Rellenar datos de la guía$/i })
  .waitFor({ state: "visible", timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
console.log("la Ficha del CTP llegó:", listo);
await d.getByRole("button", { name: /^Rellenar datos de la guía$/i }).click();
await page.waitForTimeout(2500);
const b = await vacios();
console.log(`DESPUÉS: ${b.vacios} vacíos de ${b.total} campos`);
console.log("siguen vacíos:");
for (const x of b.detalle) console.log("   ·", x);
const texto = await d.innerText();
console.log("faltantes del pie:", texto.match(/Faltan? (\d+) datos?/)?.[1] ?? "0 (completa)");
console.log("aviso:", texto.split("\n").find((l) => /Se completó/.test(l))?.slice(0, 220) ?? "(sin aviso)");
await page.screenshot({ path: `${OUT}/${DARK ? "53-dark" : "52"}-guia-rellenada.png`, fullPage: false });
/* ── A2 · el operador completa lo que no tenía fuente y GUARDA ──
   Es el punto del circuito: si esta guía deja sus datos, la próxima ya no se
   tipea. Se completa a mano sólo lo que el relleno declaró faltante. */
/* `Field` asocia por htmlFor, así que el rótulo es el camino: getByLabel. */
const escribir = async (rotulo, valor) => {
  const campo = d.getByLabel(rotulo, { exact: false }).first();
  if (await campo.count()) { await campo.fill(valor); return true; }
  return false;
};
console.log("placa escrita a mano:", await escribir("Nro placa", "AXQ-871"));
console.log("comprobante escrito a mano:", await escribir("Número de comprobante", "F001-00009999"));
await page.waitForTimeout(400);
/* La lista de productos es la otra pestaña y otro acto: sin ella el botón de
   registrar está apagado por diseño. Se elige un producto del stock real. */
await d.getByRole("tab", { name: /Creación de lista de productos/i }).click().catch(() => {});
if (!(await d.getByRole("button", { name: /Producción/i }).count())) {
  await d.getByText(/Creación de lista de productos/i).first().click();
}
await page.waitForTimeout(1200);
await d.getByRole("button", { name: /^Producción$/i }).first().click();
await page.waitForTimeout(3000);
const stock = page.getByRole("dialog").last();
const checks = stock.locator('input[type="checkbox"]');
console.log("productos en el stock:", await checks.count());
if (await checks.count()) {
  await checks.nth(1).check().catch(async () => { await checks.first().check(); });
  await page.waitForTimeout(800);
  const agregar = stock.getByRole("button", { name: /Agregar productos/i });
  console.log("agregar habilitado:", await agregar.isEnabled());
  if (await agregar.isEnabled()) await agregar.click();
  await page.waitForTimeout(2000);
}
/* ADR-374: cubicar la lista antes de registrarla. */
const cubicar = d.getByRole("button", { name: /^Cubicar madera$/i }).first();
console.log("botón «Cubicar madera» en la lista:", (await cubicar.count()) ? (await cubicar.isEnabled() ? "habilitado" : "apagado") : "no está");
if ((await cubicar.count()) && (await cubicar.isEnabled())) {
  await cubicar.click();
  await page.waitForTimeout(2500);
  const cub = page.getByRole("dialog").last();
  const txt = await cub.innerText();
  console.log("modal de cubicación:", txt.split("\n").slice(0, 2).join(" · ").slice(0, 110));
  console.log("cuadra contra la lista:", /declarad|cuadr|libro/i.test(txt) ? "sí" : "no se ve el cuadre");
  await page.screenshot({ path: `${OUT}/${DARK ? "65-dark" : "64"}-guia-cubicar.png` });
  await cub.getByRole("button", { name: /^Cerrar|Cancelar$/i }).last().click().catch(() => {});
  await page.waitForTimeout(1200);
}

const guardar = d.getByRole("button", { name: /Registrar despacho/i }).last();
console.log("registrar habilitado:", (await guardar.count()) ? await guardar.isEnabled() : "no está");
if ((await guardar.count()) && (await guardar.isEnabled())) {
  await guardar.click();
  /* Registrar crea UNA LÍNEA POR PRODUCTO y cada una es una escritura: el pie
     va contando «Registrando 1 de N». Esperar 4 s medía el modal a mitad. */
  await page.waitForFunction(() => !/Registrando \d+ de/.test(document.body.innerText), null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  /* Registrada, el modal NO se cierra: se queda para imprimir la guía. La
     señal es el pie con «Cerrar y volver al libro». */
  const txt = await page.getByRole("dialog").last().innerText();
  const ok = /Cerrar y volver al libro/i.test(txt);
  console.log("guardado:", ok ? "sí — " + (txt.match(/(\d+) l[íi]neas? en el libro/)?.[0] ?? "registrada")
    : "no — " + txt.split("\n").filter((l) => /falta|error|no se pudo|requer/i.test(l)).slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${DARK ? "59-dark" : "58"}-guia-registrada.png` });
}
if (await page.getByRole("dialog").count()) {
  await page.getByRole("dialog").last().getByRole("button", { name: /^Cerrar$/ }).last().click();
  await page.waitForTimeout(1500);
}

// ── A3 · la SIGUIENTE guía hereda lo de la anterior ──
await page.getByRole("button", { name: /Nuevo despacho/i }).first().click();
await page.waitForTimeout(3500);
const d2 = page.getByRole("dialog").last();
await d2.getByRole("button", { name: /Rellenar datos de la guía/i }).click();
await page.waitForTimeout(2500);
const c = await d2.evaluate((el) => {
  const campos = [...el.querySelectorAll("input, select, textarea")].filter((x) => !["checkbox","file","hidden"].includes(x.type) && !x.disabled && !x.readOnly);
  const v = campos.filter((x) => !String(x.value ?? "").trim() || x.value === "ninguno");
  return { total: campos.length, vacios: v.length, placa: [...el.querySelectorAll("input")].some((i) => i.value === "AXQ-871") };
});
console.log(`SEGUNDA GUÍA: ${c.vacios} vacíos de ${c.total} · heredó la placa: ${c.placa ? "sí" : "no"}`);
const t2 = await d2.innerText();
console.log("aviso 2:", t2.split("\n").find((l) => /Se completó/.test(l))?.slice(0, 200) ?? "(sin aviso)");
await page.screenshot({ path: `${OUT}/${DARK ? "57-dark" : "56"}-guia-hereda.png` });
await d2.getByRole("button", { name: /^Cerrar$/ }).last().click();
await page.waitForTimeout(1500);

// ── B · Papeles del despacho ──
const papeles = page.getByTitle(/Papeles del despacho/i).first();
console.log("acción «papeles» en la fila:", await papeles.count());
if (await papeles.count()) {
  await papeles.click();
  await page.waitForTimeout(2000);
  const m = page.getByRole("dialog").last();
  /* El escaneo de verdad: un PDF que por dentro es una foto. Sin capa de texto,
     el servidor tiene que MIRARLO — es el camino que el detach del buffer venía
     rompiendo en silencio. */
  await m.locator('input[type="file"]').setInputFiles([
    `${TMP}/factura-escaneada.txt`,
    `${TMP}/IMG_20260808.txt`,
    "/tmp/DOC_20260808_0001.pdf",
  ]);
  const t0 = Date.now();
  const leyoTodo = await page
    .waitForFunction(() => !/Leyendo el contenido/.test(document.body.innerText), null, { timeout: 420_000 })
    .then(() => true)
    .catch(() => false);
  console.log(`lectura de los 3 papeles: ${leyoTodo ? "terminó" : "SE PASÓ DEL TECHO"} en ${Math.round((Date.now() - t0) / 1000)}s`);
  await page.waitForTimeout(1500);
  const filas = await m.locator("li").allInnerTexts();
  console.log("papeles clasificados:");
  for (const f of filas) console.log("  ·", f.replace(/\s+/g, " ").slice(0, 130));
  const tipos = await m.locator("select").evaluateAll((els) => els.map((e) => e.value));
  console.log("tipos propuestos:", tipos.join(" | "));
  await page.screenshot({ path: `${OUT}/${DARK ? "55-dark" : "54"}-papeles.png`, fullPage: false });
}
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
