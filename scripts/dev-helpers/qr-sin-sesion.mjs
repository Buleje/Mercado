/**
 * qr-sin-sesión — lo que ve un celular que escanea un QR del panel SIN haber
 * entrado: la URL → login → (elegir negocio) → ¿se abre lo pedido?
 * qa-capturas entra por API antes de navegar, así que no ve este camino.
 *
 *   node scripts/dev-helpers/qr-sin-sesion.mjs \
 *     "http://localhost:3001/admin?tab=documentos&doc=<id>" "<texto que debe verse>" [salida.png] [negocio=main]
 *
 * Usuario de pruebas qaadmin (está en varios negocios: aparece el selector y se
 * toca el botón del negocio pedido). 400 px, oscuro. Imprime la URL de cada paso,
 * las ventanas visibles y si el texto quedó DENTRO de una ventana (no sólo en la
 * lista de fondo). 31-10: así se vio que el login perdía el `?doc=` y que la
 * bienvenida tapaba el papel.
 */
import { chromium, devices } from "playwright";
import { resolverChromium } from "./chromium-path.mjs";

const [url, esperado, salida = "/tmp/qr-sin-sesion.png", negocio = "main"] = process.argv.slice(2);
if (!url || !esperado) {
  console.error("uso: qr-sin-sesion.mjs <url> <texto esperado> [salida.png] [negocio]");
  process.exit(2);
}
const base = new URL(url).origin;
const corto = (u) => u.replace(base, "");

const b = await chromium.launch({ executablePath: resolverChromium() });
try {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 400, height: 860 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  console.log("1 llegó a:", corto(p.url()));
  await p.fill("#username", "qaadmin");
  await p.fill("#password", "Qa-admin-1234");
  await p.click('button[type="submit"]');
  const boton = p.getByRole("button", { name: new RegExp(`\\b${negocio}\\b`) });
  /* `isVisible` no espera: el selector de negocio tarda en llegar. Sin selector (un solo negocio) se sigue. */
  const hayQueElegir = await boton.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
  if (hayQueElegir) await boton.first().click();
  await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120_000, waitUntil: "commit" });
  console.log("2 después del login:", corto(p.url()));
  /* El Archivo primero carga la lista y después abre el papel: hasta 30 s para que aparezca en una ventana. */
  const t0 = Date.now();
  await p
    .waitForFunction((texto) => [...document.querySelectorAll("[role=dialog]")].some((d) => d.innerText.includes(texto)), esperado, { timeout: 30_000 })
    .then(() => console.log(`   abrió en ${Date.now() - t0} ms`), () => console.log("   no abrió en 30 s"));
  await p.waitForTimeout(1_500);
  const medido = await p.evaluate((texto) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const ventanas = [...document.querySelectorAll("[role=dialog]")].filter(vis);
    return {
      ventanas: ventanas.map((d) => d.innerText.slice(0, 70).replace(/\s+/g, " ")),
      enVentana: ventanas.some((d) => d.innerText.includes(texto)),
    };
  }, esperado);
  console.log("3 ventanas a la vista:", JSON.stringify(medido.ventanas), "| lo pedido en una ventana:", medido.enVentana);
  await p.screenshot({ path: salida });
  console.log("captura:", salida);
} finally {
  await b.close();
}
