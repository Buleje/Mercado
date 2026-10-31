#!/usr/bin/env node
/**
 * entrar-como-tienda — recorre «Impersonar» del superadmin como lo hace Brandon,
 * en 1 llamada: login de superadmin → /superadmin/tenants → botón «Abrir panel
 * admin de <Nombre>» de la tarjeta → pestaña nueva del panel. Imprime refresh/me,
 * nombre del menú, 3 productos y la URL final; guarda la captura (1280 claro) y
 * sale de la suplantación (POST /api/superadmin/impersonate/exit).
 *
 * Uso:
 *   node scripts/dev-helpers/entrar-como-tienda.mjs "Musa" [carpeta-captura]
 *   CON_MAIN=1 node …  → antes inicia sesión como qaadmin en main (el refresh viejo
 *                        no debe pisar la suplantación: bug del 11-10)
 *   ANCHO=400 TEMA=dark node …  → otra medida / tema para la captura
 *   MODO=vencer node …  → adelanta el reloj 11 min en vez de pulsar «Salir»: debe
 *                         volver a /superadmin/tenants con el aviso «venció»
 *
 * La pestaña Credenciales pide configurar el candado: por eso va por la tarjeta.
 * Nació en el carril «entrar-como-tienda» (11-10).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BSM_BASE || "http://localhost:3000";
const nombre = process.argv[2] || "Musa";
const carpeta = process.argv[3] || "/tmp";
mkdirSync(carpeta, { recursive: true });

const sa = JSON.parse(execFileSync("node", ["scripts/dev-helpers/superadmin-auth.mjs", "--json"], { encoding: "utf8" }));
const ANCHO = Number(process.env.ANCHO) || 1280;
const TEMA = process.env.TEMA === "dark" ? "dark" : "light";
const MODO = process.env.MODO === "vencer" ? "vencer" : "salir";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ userAgent: sa.userAgent, viewport: { width: ANCHO, height: 800 }, colorScheme: TEMA });
  // Mismo truco que qa-capturas: el tema del panel por pestaña.
  await ctx.addInitScript((oscuro) => {
    try { sessionStorage.setItem("buleje-theme-session-v2", oscuro ? "dark" : "light"); } catch { /* modo privado */ }
  }, TEMA === "dark");
  await ctx.addCookies(sa.cookies);
  if (process.env.CON_MAIN) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, {
      data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" },
      headers: { "x-tenant-id": "main" },
    });
    console.log("login previo qaadmin@main:", r.status());
  }
  const lista = await ctx.newPage();
  await lista.goto(`${BASE}/superadmin/tenants`, { waitUntil: "load", timeout: 120000 });
  const boton = lista.locator(`[aria-label="Abrir panel admin de ${nombre}"]`).first();
  await boton.waitFor({ timeout: 110000 });
  // El reloj falso se instala en el contexto ANTES de abrir el panel (MODO=vencer).
  if (MODO === "vencer") await ctx.clock?.install?.();
  const [panel] = await Promise.all([ctx.waitForEvent("page", { timeout: 60000 }), boton.click()]);
  panel.on("response", (res) => {
    const u = new URL(res.url());
    if (/^\/api\/auth\/(refresh|me)$/.test(u.pathname)) console.log("  ", res.status(), res.request().method(), u.pathname);
  });
  await panel.waitForLoadState("load", { timeout: 120000 });
  await panel.waitForTimeout(12000);
  console.log("url final:", panel.url());
  const franja = await panel.locator("[data-franja-suplantacion]").innerText().catch(() => null);
  console.log("franja:", franja ? franja.replace(/\s+/g, " ").trim() : "(no está)");
  const datos = await panel.evaluate(async () => {
    const me = await (await fetch("/api/auth/me")).json();
    const pr = await (await fetch("/api/products?limit=3")).json().catch(() => null);
    const arr = Array.isArray(pr) ? pr : (pr?.products ?? pr?.items ?? pr?.data ?? []);
    return {
      sesion: `${me.username ?? "-"} @ ${me.tenantId ?? "-"}`,
      menu: (document.querySelector("aside")?.innerText ?? "").slice(0, 30),
      productos: arr.slice(0, 3).map((x) => x.name),
    };
  });
  console.log(JSON.stringify(datos));
  const captura = `${carpeta}/entrar-como-${nombre.toLowerCase().replace(/\W+/g, "-")}-${ANCHO}-${TEMA}.png`;
  await panel.screenshot({ path: captura });
  console.log("captura:", captura);
  if (MODO === "vencer") {
    await ctx.clock.fastForward("11:00");
    await panel.waitForURL(/\/superadmin\/tenants/, { timeout: 60000 }).catch(() => {});
    console.log("tras vencer:", panel.url());
    const aviso = await panel.getByText(/venció/).first().innerText({ timeout: 90000 }).catch(() => null);
    console.log("aviso:", aviso);
    await panel.screenshot({ path: captura.replace(".png", "-vencida.png") });
  } else {
    await panel.locator("[data-franja-suplantacion] button").click();
    await panel.waitForURL(/\/superadmin/, { timeout: 60000 }).catch(() => {});
    console.log("tras «Salir»:", panel.url());
  }
  const quedan = (await ctx.cookies()).map((c) => c.name).filter((n) => /admin-sess|admin-refresh|active-tenant/.test(n));
  console.log("cookies de panel que quedan:", quedan.length ? quedan.join(",") : "ninguna");
} finally {
  await browser.close();
}
