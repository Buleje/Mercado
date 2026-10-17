#!/usr/bin/env node
/**
 * Sondeo de las páginas públicas de verificación (`/verificar/**`, `/v/**`,
 * `/t/<slug>/…`): pide cada ruta SIN sesión y clasifica la respuesta en
 * «no encontrado», «404 blando» (forma inválida) o «encontrado» con el título.
 * Solo GET: no escribe nada.
 *
 *   node scripts/dev-helpers/sondeo-verificar.mjs /v/il3g4/t/<id> /t/main/v/il3g4/t/<id>
 *   node scripts/dev-helpers/sondeo-verificar.mjs -H "x-tenant-store-route: 1" /v/il3g4/t/<id>
 *
 * Base: `BSM_BASE` o http://localhost:3000. Rutas frías compilan: 120 s de tope.
 */
const base = (process.env.BSM_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const args = process.argv.slice(2);
const headers = {};
const rutas = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-H" && args[i + 1]) {
    const [k, ...v] = args[++i].split(":");
    headers[k.trim()] = v.join(":").trim();
  } else rutas.push(args[i]);
}
if (!rutas.length) {
  console.error("uso: sondeo-verificar.mjs [-H 'clave: valor'] <ruta> [<ruta>…]");
  process.exit(1);
}

const texto = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function sondear(ruta) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + ruta, { headers, redirect: "manual", signal: AbortSignal.timeout(120_000) });
    const html = await r.text();
    const plano = texto(html);
    let clase;
    if (html.includes("NEXT_HTTP_ERROR_FALLBACK;404")) clase = "404 blando";
    else if (/no encontrad[ao]/i.test(plano)) clase = `no encontrado (${plano.match(/[A-ZÁÉÍÓÚ][\wáéíóú ]{0,30}no encontrad[ao]/)?.[0] ?? ""})`;
    else clase = `ENCONTRADO: ${html.match(/<title>([^<]*)/)?.[1] ?? ""} · «${plano.match(/Certificado[^.]{0,60}/)?.[0] ?? plano.slice(0, 60)}»`;
    const titulo = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "").trim();
    console.log(`${r.status} ${String(Date.now() - t0).padStart(6)} ms  ${ruta}\n    → ${clase}${titulo ? ` · h1 «${titulo.slice(0, 60)}»` : ""}`);
  } catch (e) {
    console.log(`ERR ${ruta} → ${e instanceof Error ? e.message : String(e)}`);
  }
}

for (const ruta of rutas) await sondear(ruta);
