#!/usr/bin/env node
/**
 * Dibuja un SVG ORIGINAL por producto y por servicio de `catalogo.mjs` en
 * `public/demo/salon/<slug>.svg` (foto de estudio: fondo de la línea, luz,
 * sombra al piso y el envase con su rótulo) y `<slug>-recorte.svg` (el envase
 * solo, para los banners). Sin fotos ni marcas de terceros.
 *
 *   node scripts/demo-salon/generar-imagenes.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LINEAS, PRODUCTOS, SERVICIOS } from "./catalogo.mjs";

const SALIDA = path.resolve(import.meta.dirname, "../../public/demo/salon");
mkdirSync(SALIDA, { recursive: true });

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Oscurece un #rrggbb mezclándolo con negro. */
function oscuro(hex, t = 0.28) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - t)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Tamaño de letra para que `texto` entre en `ancho` (aprox. Georgia). */
const cabe = (texto, ancho, max, k = 0.55) => Math.min(max, Math.floor(ancho / Math.max(1, texto.length * k)));

/** `recorte`: sin fondo (para componer varios envases sobre un banner de color). */
function marco(L, cuerpo, etiqueta, recorte = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${esc(etiqueta)}">
<defs>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.fondo[0]}"/><stop offset="1" stop-color="${L.fondo[1]}"/></linearGradient>
<radialGradient id="luz" cx="50%" cy="36%" r="58%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="${L.brillo}"/><stop offset=".45" stop-color="${L.cuerpo}"/><stop offset="1" stop-color="${oscuro(L.cuerpo)}"/></linearGradient>
<linearGradient id="t" x1="0" x2="1"><stop offset="0" stop-color="${oscuro(L.tapa, -0.25)}"/><stop offset=".5" stop-color="${L.tapa}"/><stop offset="1" stop-color="${oscuro(L.tapa, 0.3)}"/></linearGradient>
<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
</defs>
${recorte ? "" : `<rect width="600" height="600" fill="url(#f)"/><rect width="600" height="600" fill="url(#luz)"/>
<path d="M0 470 Q300 448 600 470 L600 600 L0 600Z" fill="#fff" opacity=".22"/>`}
<g transform="translate(300 330) scale(1.12) translate(-300 -330)">${cuerpo}</g>
</svg>
`;
}

const sombra = (cx, rx, cy = 514) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="16" fill="#000" opacity=".2" filter="url(#s)"/>`;
const brillo = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="#fff" opacity=".2"/>`;

/** Rótulo centrado: línea, filete, 1-2 renglones y subtítulo. */
function rotulo(L, p, { y, ancho, color, acento, max = 30 }) {
  const [a, b] = p.rotulo;
  const tam = Math.min(cabe(a, ancho, max), b ? cabe(b, ancho, max) : max);
  const linea = L.nombre.toUpperCase();
  const tl = cabe(linea, ancho, 15, 0.82);
  let s = `<text x="300" y="${y}" text-anchor="middle" font-family="${SERIF}" font-size="${tl}" letter-spacing="${Math.max(1, tl / 4)}" fill="${acento}">${esc(linea)}</text>`;
  s += `<rect x="282" y="${y + 12}" width="36" height="2" fill="${acento}" opacity=".8"/>`;
  s += `<text x="300" y="${y + 24 + tam}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${tam}" fill="${color}">${esc(a)}</text>`;
  if (b) s += `<text x="300" y="${y + 30 + tam * 2}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${tam}" fill="${color}">${esc(b)}</text>`;
  const ys = y + 30 + tam * (b ? 2 : 1) + 28;
  s += `<text x="300" y="${ys}" text-anchor="middle" font-family="${SANS}" font-size="${Math.min(14, cabe(p.sub, ancho, 14, 0.56))}" letter-spacing="1" fill="${color}" opacity=".85">${esc(p.sub)}</text>`;
  return s;
}

/** Envases oscuros llevan el texto impreso; los claros, una etiqueta crema. */
const impreso = (L) => ["buleje-pro", "tono-studio", "buleje-tools"].includes(Object.keys(LINEAS).find((k) => LINEAS[k] === L));
const tinta = (L) => (impreso(L) ? { color: L.texto, acento: L.tapa } : { color: L.texto, acento: L.cuerpo });
function etiqueta(L, x, y, w, h) {
  return impreso(L) ? "" : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${L.etiqueta}"/>`;
}

const FORMAS = {
  frasco: (L, p) =>
    sombra(300, 120) +
    `<rect x="244" y="126" width="112" height="64" rx="12" fill="url(#t)"/><rect x="244" y="150" width="112" height="3" fill="#000" opacity=".15"/>` +
    `<path d="M214 232Q214 190 256 186L344 186Q386 190 386 232L386 484Q386 512 358 512L242 512Q214 512 214 484Z" fill="url(#b)"/>` +
    brillo(232, 212, 20, 270) + etiqueta(L, 230, 262, 140, 200) + rotulo(L, p, { y: 300, ancho: 132, ...tinta(L) }),
  dosificador: (L, p) =>
    sombra(300, 115) +
    `<rect x="292" y="112" width="16" height="64" fill="url(#t)"/><path d="M268 96L372 96Q384 96 384 108L384 112L268 120Z" fill="url(#t)"/><rect x="262" y="168" width="76" height="20" rx="6" fill="url(#t)"/>` +
    `<rect x="272" y="186" width="56" height="28" fill="${oscuro(L.cuerpo, 0.1)}"/><rect x="220" y="206" width="160" height="306" rx="28" fill="url(#b)"/>` +
    brillo(236, 226, 18, 270) + etiqueta(L, 234, 270, 132, 196) + rotulo(L, p, { y: 306, ancho: 124, ...tinta(L), max: 28 }),
  pote: (L, p) =>
    sombra(300, 160) +
    `<rect x="168" y="318" width="264" height="194" rx="26" fill="url(#b)"/><rect x="160" y="268" width="280" height="62" rx="16" fill="url(#t)"/><rect x="172" y="276" width="256" height="8" rx="4" fill="#fff" opacity=".3"/>` +
    brillo(186, 336, 18, 160) + etiqueta(L, 196, 340, 208, 158) + rotulo(L, p, { y: 368, ancho: 196, ...tinta(L), max: 26 }),
  gotero: (L, p) =>
    sombra(300, 82) +
    `<rect x="280" y="150" width="40" height="104" rx="20" fill="${oscuro(L.cuerpo, 0.45)}"/><rect x="266" y="246" width="68" height="48" rx="8" fill="url(#t)"/>` +
    `<path d="M244 330Q244 292 282 290L318 290Q356 292 356 330L356 486Q356 512 330 512L270 512Q244 512 244 486Z" fill="url(#b)" opacity=".96"/>` +
    brillo(256, 306, 12, 190) + etiqueta(L, 254, 334, 92, 150) + rotulo(L, p, { y: 360, ancho: 84, ...tinta(L), max: 20 }),
  tubo: (L, p) =>
    sombra(300, 70, 520) +
    `<rect x="216" y="132" width="168" height="24" rx="4" fill="url(#t)"/>` +
    Array.from({ length: 9 }, (_, i) => `<rect x="${226 + i * 18}" y="134" width="2" height="20" fill="#000" opacity=".12"/>`).join("") +
    `<path d="M222 154L378 154L366 444Q364 456 350 456L250 456Q236 456 234 444Z" fill="url(#b)"/><rect x="254" y="454" width="92" height="62" rx="10" fill="url(#t)"/>` +
    brillo(238, 170, 16, 260) + etiqueta(L, 240, 196, 120, 210) + rotulo(L, p, { y: 232, ancho: 120, ...tinta(L), max: 26 }),
  spray: (L, p) =>
    sombra(300, 92) +
    `<rect x="252" y="120" width="96" height="90" rx="18" fill="url(#t)" opacity=".95"/><rect x="292" y="104" width="16" height="22" rx="4" fill="${oscuro(L.tapa, 0.4)}"/>` +
    `<rect x="238" y="202" width="124" height="310" rx="22" fill="url(#b)"/><rect x="238" y="214" width="124" height="6" fill="#000" opacity=".12"/>` +
    brillo(250, 230, 14, 260) + etiqueta(L, 248, 268, 104, 200) + rotulo(L, p, { y: 300, ancho: 100, ...tinta(L), max: 22 }),
  aplicador: (L, p) =>
    sombra(300, 118) +
    `<path d="M272 202L328 202L310 112Q300 98 290 112Z" fill="url(#t)"/><rect x="296" y="88" width="8" height="18" rx="4" fill="${oscuro(L.tapa, 0.5)}"/>` +
    `<rect x="214" y="198" width="172" height="314" rx="32" fill="url(#b)"/>` +
    brillo(230, 220, 18, 270) + etiqueta(L, 230, 270, 140, 196) + rotulo(L, p, { y: 306, ancho: 132, ...tinta(L), max: 28 }),
  ampollas: (L, p) =>
    sombra(300, 165) +
    Array.from({ length: 6 }, (_, i) => `<rect x="${176 + i * 44}" y="${206 + (i % 2) * 12}" width="28" height="110" rx="12" fill="#fff" opacity=".75"/><rect x="${176 + i * 44}" y="${196 + (i % 2) * 12}" width="28" height="22" rx="6" fill="url(#t)"/>`).join("") +
    `<rect x="150" y="290" width="300" height="222" rx="12" fill="url(#b)"/>` +
    brillo(166, 304, 14, 190) + rotulo(L, p, { y: 340, ancho: 240, ...tinta(L), max: 32 }),
  kit: (L, p) =>
    sombra(300, 175) +
    [190, 300, 410].map((x, i) => `<rect x="${x - 34}" y="${178 + i * 16}" width="68" height="160" rx="16" fill="${i === 1 ? L.tapa : L.brillo}"/><rect x="${x - 18}" y="${158 + i * 16}" width="36" height="26" rx="6" fill="${oscuro(L.cuerpo, 0.2)}"/>`).join("") +
    `<rect x="140" y="292" width="320" height="220" rx="10" fill="url(#b)"/><rect x="128" y="280" width="344" height="30" rx="8" fill="${oscuro(L.cuerpo, 0.15)}"/>` +
    `<rect x="286" y="280" width="28" height="232" fill="url(#t)"/>` +
    `<rect x="164" y="330" width="112" height="150" rx="8" fill="${impreso(L) ? "none" : L.etiqueta}"/>` +
    `<text x="220" y="372" text-anchor="middle" font-family="${SERIF}" font-size="14" letter-spacing="3" fill="${impreso(L) ? L.tapa : L.cuerpo}">${esc(L.nombre.split(" ")[0].toUpperCase())}</text>` +
    `<text x="220" y="414" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="30" fill="${L.texto}">${esc(p.rotulo[0])}</text>` +
    `<text x="220" y="448" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${cabe(p.rotulo[1], 104, 20)}" fill="${L.texto}">${esc(p.rotulo[1])}</text>`,
  plancha: (L) =>
    sombra(310, 190, 470) +
    `<g transform="rotate(-14 310 330)"><rect x="110" y="296" width="400" height="42" rx="21" fill="url(#b)"/><rect x="128" y="308" width="140" height="18" rx="6" fill="url(#t)"/>` +
    `<rect x="110" y="344" width="400" height="42" rx="21" fill="url(#b)" transform="rotate(4 500 344)"/><circle cx="486" cy="340" r="26" fill="${L.brillo}"/><circle cx="486" cy="340" r="9" fill="url(#t)"/>` +
    `<text x="400" y="324" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="18" fill="${L.tapa}">Titanio Pro</text></g>` +
    `<path d="M520 300Q560 340 540 420T560 520" stroke="${L.cuerpo}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  secadora: (L) =>
    sombra(300, 170, 520) +
    `<path d="M330 316L382 316L372 498Q370 512 356 512L338 512Q324 512 324 498Z" fill="url(#b)"/><rect x="340" y="350" width="20" height="40" rx="8" fill="url(#t)"/><circle cx="350" cy="410" r="8" fill="url(#t)"/>` +
    `<rect x="150" y="204" width="290" height="124" rx="62" fill="url(#b)"/><path d="M436 222L508 238L508 294L436 310Z" fill="${L.brillo}"/>` +
    `<circle cx="168" cy="266" r="58" fill="${oscuro(L.cuerpo, 0.25)}"/><circle cx="168" cy="266" r="40" fill="none" stroke="${L.tapa}" stroke-width="3" stroke-dasharray="4 7"/>` +
    `<rect x="220" y="222" width="190" height="10" rx="5" fill="#fff" opacity=".18"/><text x="300" y="282" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="22" fill="${L.tapa}">Iónica 2200</text>` +
    `<path d="M352 512Q360 556 300 560" stroke="${L.cuerpo}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  cepillo: (L) =>
    sombra(300, 180, 470) +
    `<g transform="rotate(-16 300 300)"><rect x="96" y="284" width="230" height="32" rx="16" fill="url(#b)"/><rect x="306" y="276" width="20" height="48" rx="6" fill="url(#t)"/>` +
    Array.from({ length: 22 }, (_, i) => `<rect x="${330 + i * 8}" y="236" width="3" height="128" rx="1.5" fill="${L.cuerpo}"/>`).join("") +
    `<rect x="326" y="262" width="186" height="76" rx="22" fill="url(#t)"/><rect x="336" y="270" width="166" height="10" rx="5" fill="#fff" opacity=".35"/></g>`,
  rizador: (L) =>
    sombra(300, 190, 470) +
    `<g transform="rotate(-14 300 300)"><rect x="90" y="272" width="190" height="56" rx="26" fill="url(#b)"/><rect x="120" y="288" width="60" height="24" rx="8" fill="${L.brillo}"/>` +
    `<path d="M276 270L486 284Q500 286 500 300Q500 314 486 316L276 330Z" fill="url(#t)"/><rect x="480" y="288" width="34" height="24" rx="12" fill="${L.cuerpo}"/>` +
    `<path d="M300 268L470 280" stroke="#fff" stroke-width="5" opacity=".4" stroke-linecap="round"/></g>` +
    `<path d="M92 360Q60 420 110 470T90 560" stroke="${L.cuerpo}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
};

// ── Servicios: ilustración de línea sobre un círculo empolvado ──
const VINO = "#6e2f3a";
const ROSA = "#d9a59b";
const trazo = `stroke="${VINO}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
const SERVICIO = {
  corte: `<circle cx="236" cy="380" r="40" ${trazo}/><circle cx="364" cy="380" r="40" ${trazo}/><path d="M262 350L380 170M338 350L220 170" ${trazo}/><circle cx="300" cy="300" r="9" fill="${VINO}"/>`,
  brushing: `<circle cx="210" cy="250" r="62" ${trazo}/><circle cx="210" cy="250" r="22" fill="${ROSA}"/><path d="M262 214L380 222L380 278L262 286" ${trazo}/><path d="M250 300L278 440Q282 456 298 452L318 448Q330 444 326 428L304 296" ${trazo}/><path d="M412 226Q446 240 412 254M418 274Q462 290 418 306" ${trazo}/>`,
  tinte: `<path d="M170 300L430 300Q420 420 300 420Q180 420 170 300Z" ${trazo}/><path d="M200 300Q300 270 400 300" stroke="${ROSA}" stroke-width="22" fill="none"/><path d="M380 160L300 300" ${trazo}/><rect x="364" y="132" width="40" height="40" rx="8" fill="${VINO}" transform="rotate(30 384 152)"/>`,
  balayage: [0, 1, 2, 3].map((i) => `<path d="M${210 + i * 50} 150Q${170 + i * 50} 300 ${220 + i * 50} 460" stroke="url(#mecha)" stroke-width="22" fill="none" stroke-linecap="round"/>`).join(""),
  keratina: `<path d="M190 430L380 196Q392 182 404 194Q414 206 404 220L236 446" ${trazo}/><path d="M236 446L430 250Q444 238 454 250Q462 262 450 274L270 452" ${trazo}/><circle cx="244" cy="446" r="20" fill="${VINO}"/><path d="M300 304L376 230" stroke="${ROSA}" stroke-width="14" stroke-linecap="round"/><path d="M196 196L210 224L238 234L210 244L196 272L182 244L154 234L182 224Z" fill="${ROSA}"/><path d="M436 380L444 396L460 402L444 408L436 424L428 408L412 402L428 396Z" fill="${ROSA}"/>`,
  hidratacion: `<path d="M300 150Q380 260 380 320Q380 400 300 400Q220 400 220 320Q220 260 300 150Z" ${trazo}/><path d="M300 470Q300 420 350 420Q380 420 400 440Q370 470 300 470Z" fill="${ROSA}"/><path d="M262 320Q262 360 300 366" ${trazo}/>`,
  manicure: `<rect x="240" y="270" width="120" height="170" rx="30" ${trazo}/><rect x="270" y="150" width="60" height="120" rx="10" fill="${VINO}"/><path d="M262 340Q300 320 338 340" stroke="${ROSA}" stroke-width="18" fill="none" stroke-linecap="round"/>`,
  pedicure: `<path d="M300 200Q340 260 300 330Q260 260 300 200Z" ${trazo}/><path d="M300 330Q220 320 200 250Q260 250 300 330Q340 250 400 250Q380 320 300 330Z" ${trazo}/><path d="M170 410Q235 380 300 410T430 410" stroke="${ROSA}" stroke-width="14" fill="none" stroke-linecap="round"/>`,
};
function svgServicio(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${esc(s.nombre)}">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8ece7"/><stop offset="1" stop-color="#ecd3ca"/></linearGradient>
<linearGradient id="mecha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2420"/><stop offset=".55" stop-color="#8a5a3c"/><stop offset="1" stop-color="#e2bd7f"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#f)"/><circle cx="300" cy="300" r="214" fill="#fff" opacity=".55"/><circle cx="300" cy="300" r="214" fill="none" stroke="${ROSA}" stroke-width="2" stroke-dasharray="2 10"/>
${SERVICIO[s.forma]}
</svg>
`;
}

let n = 0;
let bytes = 0;
for (const p of PRODUCTOS) {
  const L = LINEAS[p.linea];
  const svg = marco(L, FORMAS[p.forma](L, p), p.nombre);
  writeFileSync(path.join(SALIDA, `${p.slug}.svg`), svg);
  const recorte = marco(L, FORMAS[p.forma](L, p), p.nombre, true);
  writeFileSync(path.join(SALIDA, `${p.slug}-recorte.svg`), recorte);
  n += 2;
  bytes += svg.length + recorte.length;
}
for (const s of SERVICIOS) {
  const svg = svgServicio(s);
  writeFileSync(path.join(SALIDA, `${s.slug}.svg`), svg);
  n++;
  bytes += svg.length;
}
console.log(`${n} imágenes en ${path.relative(process.cwd(), SALIDA)} · ${(bytes / 1024).toFixed(1)} KB en total · ${(bytes / n / 1024).toFixed(1)} KB c/u`);
