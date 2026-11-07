#!/usr/bin/env node
/**
 * medir-celular.mjs — mide varias pestañas del panel a 400 px en UNA corrida de
 * qa-capturas (31-10, «panel cómodo en celular»: el mismo recorrido se armó a
 * mano 5 veces). Por pestaña: y del primer contenido, filas de controles antes,
 * pantallas, desborde, toques <44 px, letra <14 px y barras fijas; + 1 captura.
 *
 * Uso:
 *   node scripts/dev-helpers/medir-celular.mjs --tenant main --salida /tmp/x \
 *     "/admin?tab=documentos|documentos" "/admin?tab=adelantos|adelantos" [--temas claro,oscuro]
 *
 * Con <2 GB libres Chromium se cae («Page crashed»): de a una corrida.
 * Sin QA_BASE va a :3000 (Next 16 no deja dos `next dev` en la misma carpeta).
 * El primer contenido no reconoce un estado vacío (sale y1=null): mirar la captura.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = join(dirname(fileURLToPath(import.meta.url)), "medir-celular");
const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args.splice(i, 2)[1] : porDefecto;
};
const tenant = opcion("tenant", "main");
const salida = opcion("salida", `/tmp/medir-celular-${Date.now()}`);
const temas = opcion("temas", "claro");
const tabs = args.filter((a) => a.includes("|"));
if (tabs.length === 0) {
  console.error('Faltan pestañas: "/admin?tab=x|nombre"');
  process.exit(1);
}

const medir = readFileSync(join(aqui, "medir.js"), "utf8");
const esperar = readFileSync(join(aqui, "esperar.js"), "utf8").trim();
const pasos = [{ esperar: "[data-admin-header]" }];
tabs.forEach((t, i) => {
  const [ruta, nombre] = t.split("|");
  if (i > 0) pasos.push({ eval: `(location.href=${JSON.stringify(ruta)},1)` }, { esperar: 1500 }, { esperar: "[data-admin-header]" });
  pasos.push({ eval: esperar }, { eval: medir }, { captura: nombre });
});
mkdirSync(salida, { recursive: true });
const archivoPasos = join(salida, "pasos.json");
writeFileSync(archivoPasos, JSON.stringify(pasos));

if (!process.env.QA_BASE) process.env.QA_BASE = "http://localhost:3000";
const primera = tabs[0].split("|")[0];
try {
  execFileSync(
    "node",
    ["scripts/qa-capturas.mjs", "--tenant", tenant, "--ruta", primera, "--pasos-archivo", archivoPasos, "--salida", salida, "--anchos", "400", "--temas", temas, "--evals-todos", "--resumen"],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
} catch {
  /* la falla queda escrita en el reporte: la tabla la muestra igual */
}
execFileSync("node", [join(aqui, "tabla.js"), join(salida, "reporte.json")], { stdio: "inherit" });
