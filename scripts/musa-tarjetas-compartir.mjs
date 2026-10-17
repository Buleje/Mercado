/**
 * Las tarjetas para COMPARTIR la tienda de Musa (WhatsApp, Facebook, Instagram):
 * JPG de 1200 × 630 con las fuentes, el sello y los envases de la marca.
 *   public/musa/og.jpg           — portada y catálogo
 *   public/musa/og/<CÓDIGO>.jpg  — la ficha de cada producto (sin precio: cambia)
 * Las usa `extensiones/pagina-musa/compartir.ts` (si sumas un producto, agrégalo a `CON_TARJETA`).
 *
 * Uso: node scripts/musa-tarjetas-compartir.mjs [CÓDIGO]   (sin código: todas)
 * Lee los productos activos de Musa de la base (sólo lectura, `sql-lectura.mjs`) y
 * dibuja cada tarjeta con Chromium (Playwright) a partir de HTML: las fuentes woff2
 * de `public/fonts/musa/` y los envases de `public/musa/productos/`. ~40 KB cada una.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const REPO = process.cwd();
const requerir = createRequire(REPO + "/package.json");
const { chromium } = requerir("playwright");
const sharp = requerir("sharp");
const { resolverChromium } = await import(REPO + "/scripts/dev-helpers/chromium-path.mjs");
const M = /const M =\s*"([^"]+)"/.exec(readFileSync(path.join(REPO, "extensiones/pagina-musa/Sello.tsx"), "utf8"))[1];
const MUSA = "cmv1v4b8e0002rlvz6ibrullo";
const productos = JSON.parse(
  execFileSync("node", ["scripts/sql-lectura.mjs", "--json", 'select barcode, name, category from "Product" where "tenantId"=$1 and active and barcode is not null order by barcode', MUSA], { encoding: "utf8" }),
);
const f = (n) => `file://${REPO}/public/fonts/musa/${n}`;
const img = (c) => `file://${REPO}/public/musa/productos/${c}.webp`;
const CSS = `
@font-face{font-family:C;src:url(${f("CormorantGaramond.woff2")});font-weight:500 600}
@font-face{font-family:G;src:url(${f("GreatVibes-400.woff2")})}
@font-face{font-family:P;src:url(${f("Poppins-400.woff2")});font-weight:400}
@font-face{font-family:P;src:url(${f("Poppins-500.woff2")});font-weight:500}
@font-face{font-family:P;src:url(${f("Poppins-600.woff2")});font-weight:600}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#f7f3ef;font-family:P;color:#1a1a1a;position:relative}
.izq{position:absolute;left:72px;top:58px;width:580px;height:514px;display:flex;flex-direction:column}
.marca{display:flex;align-items:center;gap:18px}
.marca b{font-family:C;font-weight:600;font-size:46px;letter-spacing:.32em}
.kicker{margin-top:30px;font-weight:600;font-size:17px;letter-spacing:.28em;text-transform:uppercase;color:#735b4c}
h1{font-family:C;font-weight:600;font-size:70px;line-height:1;margin-top:16px;white-space:nowrap}
.script{font-family:G;font-size:76px;color:#8e4651;line-height:1;margin-top:-4px;margin-left:120px}
.linea{margin-top:22px;font-size:24px;color:#4f4440}
.pie{margin-top:auto;display:flex;gap:12px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:12px 22px;font-size:20px;font-weight:600}
.oscura{background:#2e2421;color:#f7f3ef}.clara{background:#dde5d6;color:#3e5c47}
.arco{position:absolute;right:64px;top:44px;width:470px;height:560px;border-radius:999px 999px 28px 28px;background:#d2b4a2;padding:14px}
.arco>div{width:100%;height:100%;border-radius:999px 999px 18px 18px;background:#e3cbbe;position:relative;overflow:hidden}
.arco img{position:absolute;filter:drop-shadow(0 18px 22px rgb(46 36 33/.22))}
.chip{display:inline-block;background:#1a1a1a;color:#f7f3ef;border-radius:999px;padding:8px 18px;font-size:18px;font-weight:600;letter-spacing:.14em;margin-top:22px}
.nombre{font-family:C;font-weight:600;font-size:68px;line-height:1.02;margin-top:14px}
.estrella{position:absolute;color:#c9a46a;font-size:34px}
`;
const sello = (lado) => `<svg width="${lado}" height="${lado}" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="478" fill="none" stroke="#1a1a1a" stroke-width="30"/><circle cx="500" cy="500" r="432" fill="none" stroke="#1a1a1a" stroke-width="16"/><circle cx="500" cy="500" r="388" fill="#d9b8a3"/><path d="${M}" transform="translate(500 500) scale(1.32) translate(-500 -500)" fill="#1a1a1a"/></svg>`;
const wsp = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;
const marca = `<div class="marca">${sello(72)}<b>MUSA</b></div>`;
const pie = `<div class="pie"><span class="pill oscura">${wsp} Asesoría gratis · 921 585 006</span><span class="pill clara">Envío gratis en Constitución</span></div>`;
const html = (cuerpo, arco) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="izq">${cuerpo}</div><div class="arco"><div>${arco}</div></div><span class="estrella" style="right:548px;top:70px">✦</span><span class="estrella" style="right:40px;bottom:40px;font-size:26px">✦</span></body></html>`;

const portada = html(
  `${marca}<p class="kicker">Ciudad Constitución · Pasco</p><h1>Belleza profesional,</h1><p class="script">cerca de ti</p><p class="linea">Cabello, rostro y cuerpo · kits de regalo</p>${pie}`,
  `<img src="${img("KT02")}" style="width:440px;left:1px;top:96px"><img src="${img("MU010")}" style="width:250px;left:-44px;top:250px"><img src="${img("MU001")}" style="width:262px;right:-56px;top:236px">`,
);
const tarjeta = (p) =>
  html(
    `${marca}<p class="kicker">${p.category}</p><p class="nombre" style="font-size:${p.name.length > 40 ? 50 : p.name.length > 30 ? 58 : 68}px">${p.name.replace(/</g, "&lt;")}</p><span><span class="chip">Cód. ${p.barcode}</span></span><p class="linea">Belleza profesional, cerca de ti</p>${pie}`,
    `<img src="${img(p.barcode)}" style="width:470px;left:-14px;top:${p.category === "Kits y ofertas" ? 70 : 60}px">`,
  );

const navegador = await chromium.launch({ executablePath: resolverChromium() ?? undefined });
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const destino = path.join(REPO, "public/musa/og");
mkdirSync(destino, { recursive: true });
async function hacer(contenido, salida) {
  const tmp = path.join(os.tmpdir(), "musa-tarjeta.html");
  writeFileSync(tmp, contenido);
  await pagina.goto(`file://${tmp}`);
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(150);
  const png = await pagina.screenshot({ type: "png" });
  const jpg = await sharp(png).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  writeFileSync(salida, jpg);
  return `${path.relative(REPO, salida)} ${Math.round(jpg.length / 1024)} KB`;
}
const hechos = [await hacer(portada, path.join(REPO, "public/musa/og.jpg"))];
const solo = process.argv[2];
for (const p of productos) if (!solo || p.barcode === solo) hechos.push(await hacer(tarjeta(p), path.join(destino, `${p.barcode}.jpg`)));
await navegador.close();
console.log(hechos.join("\n"));
