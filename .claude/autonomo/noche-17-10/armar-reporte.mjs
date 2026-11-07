// Arma items.json + titulos.json para scripts/dev-helpers/reporte-noche.mjs desde
// manifiesto.json ([{clave, asunto, titulo, area, donde, reporte, captura?}]).
// El resumen sale de la tabla del reporte-*.md; «pendientes», de sus líneas
// DECIDE BRANDON / Queda / Pendiente.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const manifiesto = JSON.parse(readFileSync(path.join(dir, "manifiesto.json"), "utf8"));
const items = [];
const titulos = {};
for (const m of manifiesto) {
  const ruta = path.join(dir, "carriles", m.reporte);
  const texto = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";
  const lineas = texto.split("\n");
  const tabla = lineas.filter((l) => l.startsWith("|")).join("\n");
  const notas = lineas.filter((l) => l.trim() && !l.startsWith("|") && !l.startsWith("#"));
  const pendientes = notas
    .filter((l) => /DECIDE BRANDON|Queda|Pendiente|Sin hacer|PEDIR SECURITY/i.test(l))
    .map((l) => l.replace(/^[-*]\s*/, "").trim());
  const resto = notas.filter((l) => !pendientes.includes(l.replace(/^[-*]\s*/, "").trim()));
  items.push({
    tanda: m.tanda ?? "",
    carril: m.clave,
    titulo: m.asunto,
    resumen: tabla || resto.join("\n"),
    antesDespues: tabla ? resto.join("\n") : "",
    captura: m.captura ?? "",
    pendientes,
  });
  titulos[m.clave] = { titulo: m.titulo, area: m.area, donde: m.donde ?? "" };
}
writeFileSync(path.join(dir, "reporte", "items.json"), JSON.stringify(items, null, 2));
writeFileSync(path.join(dir, "reporte", "titulos.json"), JSON.stringify(titulos, null, 2));
console.log(`items: ${items.length} · sin reporte: ${manifiesto.filter((m) => !existsSync(path.join(dir, "carriles", m.reporte))).map((m) => m.clave).join(", ") || "ninguno"}`);
