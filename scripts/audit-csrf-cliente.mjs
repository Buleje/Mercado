/**
 * audit-csrf-cliente — busca mutaciones del cliente a `/api/**` que NO mandan
 * el header `x-csrf-token`.
 *
 * El proxy valida el double-submit para TODO POST/PUT/PATCH/DELETE bajo `/api/`
 * salvo la lista de exentos de `lib/csrf.ts` (webhooks, login, cron, superadmin,
 * beacons). Una llamada sin token no falla en compilación ni en los tests:
 * devuelve 403 en runtime y la pantalla dice "no se pudo guardar".
 *
 * Uso: node scripts/audit-csrf-cliente.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const CARPETAS = ["app", "components", "hooks", "contexts", "lib"];
const IGNORAR = /node_modules|\.next|__tests__|\.test\.|\.stories\./;

/** Rutas que el propio middleware exime: una llamada sin token ahí no falla. */
const EXENTAS = [
  "/api/auth/login",
  "/api/auth/bypass",
  "/api/auth/refresh",
  "/api/auth/otp/",
  "/api/auth/customer/test-session",
  "/api/auth/customer-lookup",
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/billing/webhook",
  "/api/billing/mp-webhook",
  "/api/cron/",
  "/api/health",
  "/api/whatsapp/",
  "/api/admin/log-error",
  "/api/store-page/visits",
  "/api/csp-report",
  "/api/superadmin/",
  "/api/lead/capture",
  "/api/marketplace/promo-banners/track",
  "/api/analytics/vitals",
  "/api/public/documents/",
  "/api/public/contratos/",
];

const archivos = [];
function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre);
    if (IGNORAR.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) recorrer(p);
    else if (/\.tsx?$/.test(p)) archivos.push(p);
  }
}
for (const c of CARPETAS) recorrer(join(RAIZ, c));

const hallazgos = [];
for (const p of archivos) {
  const src = readFileSync(p, "utf8");
  if (!src.includes("fetch(")) continue;
  // Un archivo de servidor (route handler, acción) no pasa por el proxy.
  const esCliente = src.startsWith('"use client"') || /\/(hooks|contexts)\//.test(p);
  if (!esCliente) continue;

  const re = /fetch\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
  let m;
  while ((m = re.exec(src))) {
    const url = m[1].slice(1, -1);
    if (!url.startsWith("/api/")) continue;
    if (EXENTAS.some((e) => url.startsWith(e))) continue;
    // Las opciones van justo después; 500 caracteres cubren el objeto entero.
    // La ventana corta en el `fetch(` siguiente: sin eso, un GET adoptaba el
    // `method:` de la llamada de abajo y salía reportado por algo que no hace.
    const bruto = src.slice(m.index + 6, m.index + 500);
    const siguiente = bruto.indexOf("fetch(");
    const opciones = siguiente === -1 ? bruto : bruto.slice(0, siguiente);
    const metodo = opciones.match(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    if (!metodo) continue;
    if (/csrf/i.test(opciones)) continue;
    // Un ejemplo dentro de un JSDoc no es una llamada.
    const lineaTexto = src.slice(src.lastIndexOf("\n", m.index) + 1, m.index);
    if (/^\s*\*/.test(lineaTexto)) continue;
    /**
     * El header puede venir por un helper del propio archivo
     * (`headers: jsonHeaders()`): si ESE helper mete el token, la llamada está
     * bien. Sin seguir la indirección el auditor marcaba como rotos módulos
     * que ya estaban arreglados — y "arreglarlos" habría envuelto dos veces.
     */
    const viaHelper = opciones.match(/headers:\s*([A-Za-z_$][\w$]*)\s*[(,]/);
    if (viaHelper) {
      const def = new RegExp(
        `(?:const|function)\\s+${viaHelper[1]}\\b[^\\n]*(?:\\n[^\\n]*){0,4}`,
        "m",
      ).exec(src);
      if (def && /csrf/i.test(def[0])) continue;
    }
    hallazgos.push({
      archivo: relative(RAIZ, p),
      linea: src.slice(0, m.index).split("\n").length,
      metodo: metodo[1],
      url,
    });
  }
}

if (hallazgos.length === 0) {
  console.log("OK — ninguna mutación del cliente va sin token CSRF.");
  process.exit(0);
}
console.log(`${hallazgos.length} mutación(es) SIN token CSRF (devuelven 403 en runtime):\n`);
for (const h of hallazgos) console.log(`  ${h.archivo}:${h.linea}  ${h.metodo} ${h.url}`);
process.exit(1);
