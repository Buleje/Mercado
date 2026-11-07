#!/usr/bin/env node
// Probador del MCP «buleje» contra el panel real, sin abrir NUNCA la ventana de OK (29-10).
// Arranca UN servidor (un login por negocio, no uno por herramienta: el login tiene límite por hora) y corre una lista.
//   node tools/mcp-buleje/probar.mjs lote.json          → todo a seco (BULEJE_MCP_SECO=1): lee de verdad, no escribe nada
//   node tools/mcp-buleje/probar.mjs lote.json --real   → las escrituras normales SÍ se mandan, pero solo en qa-forestal;
//                                                        lo que pide OK y `confirmar` van siempre a seco (sin ventana)
// lote.json = [{ "herramienta": "loth_ver", "args": { "negocio": "qa-forestal", "limit": 5 } }, …]
// Sale con 1 si alguna llamada dio error. Imprime una línea por llamada + el texto recortado (--largo = entero).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const NEGOCIO_DE_PRUEBA = "qa-forestal";

/** Decide cómo se manda cada llamada. Puro (lo prueban los tests). */
export function prepararLlamada(item, herramienta, real) {
  const args = { ...(item.args ?? {}) };
  if (!herramienta) return { error: `no existe la herramienta «${item.herramienta}»` };
  const lectura = herramienta.annotations?.readOnlyHint === true;
  const pideOk = item.herramienta === "confirmar" || herramienta.annotations?.destructiveHint === true;
  if (lectura) return { args };
  if (pideOk) return { args: { ...args, seco: true } }; // nunca una ventana en la PC de Brandon desde una prueba
  if (real && (args.negocio ?? "") !== NEGOCIO_DE_PRUEBA) return { error: `--real escribe solo en ${NEGOCIO_DE_PRUEBA}; «${item.herramienta}» iba a «${args.negocio ?? "bodega"}»` };
  return { args: real ? args : { ...args, seco: true } };
}

async function main() {
  const [archivo, ...resto] = process.argv.slice(2);
  if (!archivo) { console.error("Uso: node tools/mcp-buleje/probar.mjs lote.json [--real] [--largo]"); process.exit(2); }
  const real = resto.includes("--real");
  const largo = resto.includes("--largo");
  const lote = JSON.parse(readFileSync(archivo, "utf8"));
  const env = real ? {} : { BULEJE_MCP_SECO: "1" };
  const transporte = new StdioClientTransport({ command: join(AQUI, "arrancar.sh"), args: [], env, stderr: "pipe" });
  const cliente = new Client({ name: "buleje-probar", version: "1.0.0" });
  await cliente.connect(transporte);
  const { tools } = await cliente.listTools();
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  let malas = 0;
  /** token de la última propuesta, para `"args": {"token": "$ultimo", "resumen": "$ultimo"}` */
  let ultima = null;
  for (const [i, item] of lote.entries()) {
    const p = prepararLlamada(item, porNombre.get(item.herramienta), real);
    if (p.error) { malas++; console.log(`✗ ${item.herramienta}: ${p.error}`); continue; }
    if (ultima && p.args.token === "$ultimo") { p.args.token = ultima.token; p.args.resumen = ultima.resumen; }
    const t0 = Date.now();
    let r;
    try { r = await cliente.callTool({ name: item.herramienta, arguments: p.args }, undefined, { timeout: 180_000 }); }
    catch (e) { malas++; console.log(`✗ ${item.herramienta}: ${String(e?.message ?? e).slice(0, 300)}`); continue; }
    const texto = (r.content ?? []).map((c) => c.text ?? "").join("\n");
    try { const j = JSON.parse(texto); if (j?.token) ultima = j; } catch { /* texto formateado */ }
    if (r.isError) malas++;
    console.log(`${r.isError ? "✗" : "✓"} ${item.herramienta} ${JSON.stringify(p.args).slice(0, 160)} (${Date.now() - t0} ms)`);
    console.log(`  ${(largo ? texto : texto.slice(0, 700)).replaceAll("\n", "\n  ")}`);
    // Tope de 5 propuestas vivas: si la siguiente no la confirma, se cancela ya (carril C, 29-10).
    if (ultima?.token && lote[i + 1]?.args?.token !== "$ultimo" && texto.includes(ultima.token)) {
      await cliente.callTool({ name: "cancelar", arguments: { token: ultima.token } }).catch(() => {});
      ultima = null;
    }
  }
  await cliente.close();
  console.log(`\n${lote.length - malas}/${lote.length} sin error${real ? " (con escrituras reales en qa-forestal)" : " (todo a seco)"}`);
  process.exit(malas ? 1 : 0);
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
