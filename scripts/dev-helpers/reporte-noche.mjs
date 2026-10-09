/**
 * reporte-noche.mjs — arma el PDF «Mejoras de la noche» para Brandon desde los
 * datos que dejan los carriles de un workflow (items.json) y el git log.
 *
 * Uso: node scripts/dev-helpers/reporte-noche.mjs <items.json> <titulos.json> <desde-commit> <salida.pdf> [titulo]
 *   items.json   [{tanda, carril, titulo, resumen, antesDespues, captura, pendientes}]
 *   titulos.json {"<carril>": {"titulo": "en su idioma", "area": "Ventas y Caja", "donde": "Ventas › Vender"}}
 *   decide.json  (opcional, junto a items.json) ["lo que decide Brandon", …]
 *
 * Por qué (09-10): la noche anterior el PDF se armó a mano al cierre; con 30 mejoras
 * eso es media hora. Así sale en una llamada y con las capturas de cada carril.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { resolverChromium } from "./chromium-path.mjs";

const [itemsPath, titulosPath, desde, salida, tituloDoc = "Mejoras de la noche"] = process.argv.slice(2);
if (!itemsPath || !titulosPath || !desde || !salida) {
  console.error("uso: node scripts/dev-helpers/reporte-noche.mjs <items.json> <titulos.json> <desde-commit> <salida.pdf> [titulo]");
  process.exit(1);
}

const items = JSON.parse(readFileSync(itemsPath, "utf8"));
const titulos = JSON.parse(readFileSync(titulosPath, "utf8"));
const decidePath = path.join(path.dirname(itemsPath), "decide.json");
const decide = existsSync(decidePath) ? JSON.parse(readFileSync(decidePath, "utf8")) : [];
const log = execFileSync("git", ["log", "--reverse", "--format=%h\t%ad\t%s", "--date=format:%H:%M", `${desde}..HEAD`], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean).map((l) => { const [h, hora, s] = l.split("\t"); return { h, hora, s }; });

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Markdown mínimo: tablas, negritas, código en línea, listas y párrafos. */
function md(texto) {
  const lineas = String(texto ?? "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  while (i < lineas.length) {
    const l = lineas[i];
    if (/^\s*\|/.test(l) && i + 1 < lineas.length && /^\s*\|[\s:|-]+\|\s*$/.test(lineas[i + 1])) {
      const celdas = (x) => x.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const cab = celdas(l);
      i += 2;
      const filas = [];
      while (i < lineas.length && /^\s*\|/.test(lineas[i])) filas.push(celdas(lineas[i++]));
      out.push(`<table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*] /.test(l)) {
      const li = [];
      while (i < lineas.length && /^\s*[-*] /.test(lineas[i])) li.push(lineas[i++].replace(/^\s*[-*] /, ""));
      out.push(`<ul>${li.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join("\n");
}

function imagen(ruta) {
  const r = String(ruta ?? "").split(/\s+·\s+|\s+\(/)[0].trim();
  if (!r || !r.endsWith(".png") || !existsSync(r)) return "";
  return `<img src="data:image/png;base64,${readFileSync(r).toString("base64")}" alt="">`;
}

const commitDe = (it) => {
  const sujeto = (it.titulo || "").trim();
  return log.find((c) => c.s === sujeto) ?? null;
};

const porArea = new Map();
for (const it of items) {
  const t = titulos[it.carril] ?? { titulo: it.titulo, area: "Otros", donde: "" };
  if (!porArea.has(t.area)) porArea.set(t.area, []);
  porArea.get(t.area).push({ ...it, ...t, commit: commitDe(it) });
}

const guardadas = items.filter((it) => commitDe(it)).length;
const paginas = [...porArea.entries()].flatMap(([area, lista]) => lista.map((it) => `
<section class="mejora">
  <div class="kicker">${esc(area)}${it.commit ? ` · guardado ${esc(it.commit.hora)} (${esc(it.commit.h)})` : " · SIN GUARDAR"}</div>
  <h2>${esc(it.titulo)}</h2>
  ${it.donde ? `<p class="donde">Dónde se ve: <b>${esc(it.donde)}</b></p>` : ""}
  <div class="bloque">${md(it.resumen)}</div>
  ${it.antesDespues ? `<h3>Antes y ahora (medido)</h3><div class="bloque">${md(it.antesDespues)}</div>` : ""}
  ${imagen(it.captura) ? `<h3>Captura</h3>${imagen(it.captura)}` : ""}
  ${(it.pendientes ?? []).length ? `<h3>Lo que quedó pendiente</h3><ul>${it.pendientes.slice(0, 4).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
</section>`));

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(tituloDoc)}</title><style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c2321; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 26pt; margin: 0 0 6mm; } h2 { font-size: 16pt; margin: 1mm 0 3mm; } h3 { font-size: 11.5pt; margin: 5mm 0 2mm; color: #0f5f57; }
  .kicker { font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #0f766e; font-weight: 700; }
  .donde { color: #475569; margin: 0 0 3mm; } .mejora { page-break-before: always; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0; font-size: 9.5pt; } th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #ecfdf5; }
  code { font-family: Consolas, monospace; font-size: 8.5pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; word-break: break-all; }
  img { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 2mm; }
  .cifras { display: flex; gap: 6mm; margin: 6mm 0; } .cifra { border: 1px solid #99f6e4; border-radius: 10px; padding: 4mm 6mm; } .cifra b { display: block; font-size: 22pt; color: #0f766e; }
  ul { margin: 1mm 0 2mm 5mm; padding: 0; } li { margin: 0.6mm 0; }
</style></head><body>
<section>
  <div class="kicker">Buleje · noche autónoma</div>
  <h1>${esc(tituloDoc)}</h1>
  <p>Trabajé solo mientras dormías, con varios equipos de agentes a la vez. Cada mejora pasó por un revisor distinto del que la construyó (y por seguridad cuando tocaba permisos), y solo se guarda con todas las pruebas en verde. Nada se subió a producción.</p>
  <div class="cifras">
    <div class="cifra"><b>${guardadas}</b>mejoras guardadas${items.length > guardadas ? ` de ${items.length}` : ""}</div>
    <div class="cifra"><b>${log.length}</b>commits</div>
    <div class="cifra"><b>${porArea.size}</b>áreas del panel</div>
  </div>
  <h3>Por área</h3>
  <table><thead><tr><th>Área</th><th>Mejoras</th></tr></thead><tbody>
  ${[...porArea.entries()].map(([a, l]) => `<tr><td>${esc(a)}</td><td>${l.map((x) => esc(x.titulo) + (x.commit ? "" : " <i>(lista, sin guardar)</i>")).join("<br>")}</td></tr>`).join("")}
  </tbody></table>
  ${decide.length ? `<h3>Lo que decides tú</h3><ul>${decide.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
</section>
${paginas.join("\n")}
<section class="mejora"><div class="kicker">Registro</div><h2>Todos los commits de la noche</h2>
<table><thead><tr><th>Hora</th><th>Commit</th><th>Qué</th></tr></thead><tbody>
${log.map((c) => `<tr><td>${esc(c.hora)}</td><td><code>${esc(c.h)}</code></td><td>${esc(c.s)}</td></tr>`).join("")}
</tbody></table></section>
</body></html>`;

const htmlPath = salida.replace(/\.pdf$/i, ".html");
writeFileSync(htmlPath, html);
const navegador = await chromium.launch({ executablePath: resolverChromium() });
const pagina = await navegador.newPage();
await pagina.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "load" });
await pagina.pdf({ path: salida, format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
await navegador.close();
console.log(JSON.stringify({ pdf: salida, html: htmlPath, mejoras: items.length, guardadas, commits: log.length, areas: porArea.size }));
