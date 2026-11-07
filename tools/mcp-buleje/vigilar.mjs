#!/usr/bin/env node
// Vigía del MCP «buleje» (Brandon 29-10: «hazlo para que ya no te tenga que pedir que lo actives»). Lo corre
// mcp-buleje-vigia.timer cada 30 min:
//   1. registro en Claude Code (scope user) apuntando a arrancar.sh; si no está o apunta a otro lado, lo re-registra;
//   2. arranque en un entorno pelado (PATH sin nvm + el NODE_OPTIONS de ~/.bashrc: lo que lo tumbó el 29-10);
//   3. la herramienta `estado` del propio MCP (panel, modo y, cada 6 h, la sesión del usuario «claude»).
// Avisa por Telegram SOLO cuando algo cambia (se rompe o se cura). El panel apagado no avisa: es normal de noche.
// Uso: arrancar.sh --vigilar [--ver] [--sesion] [--instalar]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CASA = homedir();
export const ARRANQUE = join(AQUI, "arrancar.sh");
const CLAUDE = join(CASA, ".local/bin/claude");
const AVISO = join(CASA, ".local/bin/aviso-telegram");
const ESTADO = join(CASA, ".local/state/buleje-vigia.json");
export const APAGADO = join(CASA, ".local/state/buleje-vigia.apagado");
const SEIS_HORAS = 6 * 3600_000;
const MIN_HERRAMIENTAS = 70;
/** El entorno que lo tumbó el 29-10: sin nvm en el PATH y con las opciones de red de ~/.bashrc. */
const ENTORNO_PELADO = { PATH: "/usr/local/bin:/usr/bin:/bin", NODE_OPTIONS: "--max-old-space-size=8192 --dns-result-order=ipv4first --no-network-family-autoselection" };

const leerJson = (ruta, porDefecto) => { try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return porDefecto; } };

/** @returns {{ ok: boolean, arreglado?: boolean, problema?: string, apagadoEn?: string[] }} */
export function revisarRegistro({ config = join(CASA, ".claude.json"), arreglar = true, correr = spawnSync } = {}) {
  const leer = () => leerJson(config, {});
  const bien = (c) => c?.mcpServers?.buleje?.command === ARRANQUE && (c.mcpServers.buleje.args ?? []).length === 0;
  const c = leer();
  // Apagado a mano con /mcp en algún proyecto: se avisa, no se toca (~/.claude.json lo escriben las sesiones vivas).
  const apagadoEn = Object.entries(c?.projects ?? {}).filter(([, p]) => (p?.disabledMcpServers ?? []).includes("buleje")).map(([k]) => k);
  if (bien(c)) return { ok: true, apagadoEn };
  if (!arreglar) return { ok: false, problema: "no está registrado en Claude Code", apagadoEn };
  // Se conservan las variables del registro anterior (BULEJE_MCP_SECO=1 = modo a seco): re-registrar no cambia el modo.
  const env = Object.entries(c?.mcpServers?.buleje?.env ?? {}).filter(([k]) => /^BULEJE_MCP_[A-Z_]+$/.test(k)).flatMap(([k, v]) => ["-e", `${k}=${String(v).replace(/[^\w.-]/g, "")}`]);
  correr(CLAUDE, ["mcp", "remove", "buleje", "-s", "user"], { encoding: "utf8", timeout: 60_000 });
  const r = correr(CLAUDE, ["mcp", "add", "buleje", "--scope", "user", ...env, "--", ARRANQUE], { encoding: "utf8", timeout: 60_000 });
  if (bien(leer())) return { ok: true, arreglado: true, apagadoEn };
  return { ok: false, problema: `no se pudo registrar: ${String(r.stderr || r.stdout || r.error || "").trim().slice(0, 160)}`, apagadoEn };
}

/** Arranca el MCP como lo haría una sesión sin nvm y le pide `estado`. */
export async function probarArranque({ conSesion, envRegistro = {} }) {
  const t0 = Date.now();
  // Con las variables del registro (p. ej. BULEJE_MCP_SECO=1) `estado` dice el modo que de verdad tienen los chats.
  const propias = Object.fromEntries(Object.entries(envRegistro).filter(([k]) => /^BULEJE_MCP_[A-Z_]+$/.test(k)));
  const transporte = new StdioClientTransport({ command: ARRANQUE, args: [], env: { ...ENTORNO_PELADO, ...propias }, stderr: "pipe" });
  let errores = "";
  transporte.stderr?.on("data", (b) => { errores = (errores + String(b)).slice(-600); });
  const cliente = new Client({ name: "buleje-vigia", version: "1.0.0" });
  const tope = (ms, que) => new Promise((_, no) => setTimeout(() => no(new Error(`${que}: sin respuesta en ${ms / 1000} s`)), ms).unref());
  try {
    await Promise.race([cliente.connect(transporte), tope(60_000, "arranque")]);
    const { tools } = await Promise.race([cliente.listTools(), tope(30_000, "lista de herramientas")]);
    const r = await Promise.race([cliente.callTool({ name: "estado", arguments: { sesion: conSesion } }), tope(240_000, "estado")]);
    const texto = (r.content ?? []).map((c) => c.text ?? "").join("\n");
    return { ok: true, herramientas: tools.length, texto, ms: Date.now() - t0 };
  } catch (e) {
    const ultima = errores.trim().split("\n").filter((l) => !/listo:/.test(l)).pop() ?? "";
    return { ok: false, problema: `no arranca: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 160)}${ultima ? ` (${ultima.slice(0, 200)})` : ""}`, ms: Date.now() - t0 };
  } finally {
    await cliente.close().catch(() => {});
  }
}

/** Problemas que merecen aviso, a partir del texto de `estado`. */
export function problemasDeEstado(texto) {
  const p = [];
  for (const l of String(texto).split("\n")) {
    if (/SIN SESIÓN/.test(l)) p.push(`sesión: ${l.slice(0, 200)}`);
    if (/^sin_sesion:/.test(l)) p.push(`configuración: ${l.slice(0, 200)}`);
  }
  return p;
}

function avisar(texto) {
  const r = spawnSync(AVISO, [texto], { encoding: "utf8", timeout: 20_000 });
  return r.status === 0;
}

function instalar() {
  const dir = join(CASA, ".config/systemd/user");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mcp-buleje-vigia.service"), `[Unit]\nDescription=Vigía del MCP buleje (registro, arranque y sesión)\n\n[Service]\nType=oneshot\nExecStart=${ARRANQUE} --vigilar\nTimeoutStartSec=300\nNice=10\n`);
  writeFileSync(join(dir, "mcp-buleje-vigia.timer"), `[Unit]\nDescription=Vigía del MCP buleje cada 30 min\n\n[Timer]\nOnBootSec=4min\nOnUnitActiveSec=30min\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`);
  const r = spawnSync("systemctl", ["--user", "daemon-reload"], { encoding: "utf8" });
  const e = spawnSync("systemctl", ["--user", "enable", "--now", "mcp-buleje-vigia.timer"], { encoding: "utf8" });
  console.log(r.status === 0 && e.status === 0 ? "Vigía instalado: mcp-buleje-vigia.timer cada 30 min." : `Falló: ${e.stderr || r.stderr}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--instalar")) return instalar();
  // Quitado a propósito (security 3.ª pasada): con este archivo el vigía no re-registra ni avisa.
  if (existsSync(APAGADO) && !args.includes("--ver")) { console.log(`apagado a propósito (${APAGADO}); no hago nada`); return; }
  const ver = args.includes("--ver");
  const antes = leerJson(ESTADO, { problemas: [], ultimaSesion: 0 });
  const conSesion = args.includes("--sesion") || Date.now() - (antes.ultimaSesion ?? 0) > SEIS_HORAS;

  const reg = revisarRegistro({ arreglar: !ver });
  const envRegistro = leerJson(join(CASA, ".claude.json"), {})?.mcpServers?.buleje?.env ?? {};
  const arr = existsSync(ARRANQUE) ? await probarArranque({ conSesion, envRegistro }) : { ok: false, problema: `falta ${ARRANQUE}` };
  const problemas = [
    ...(reg.ok ? [] : [`registro: ${reg.problema}`]),
    ...(arr.ok ? [] : [`arranque: ${arr.problema}`]),
    ...(arr.ok && arr.herramientas < MIN_HERRAMIENTAS ? [`arranque: solo ${arr.herramientas} herramientas (espero ${MIN_HERRAMIENTAS}+)`] : []),
    ...(arr.ok ? problemasDeEstado(arr.texto) : []),
  ];
  const informe = { cuando: new Date().toISOString(), registro: reg, arranque: { ok: arr.ok, ms: arr.ms, herramientas: arr.herramientas }, estado: arr.texto?.split("\n\n")[0], conSesion, problemas };
  if (ver) { console.log(JSON.stringify(informe, null, 1)); return; }

  const clave = (l) => [...l].sort().join("|");
  const avisos = [];
  if (reg.arreglado) avisos.push("🔌 MCP Buleje: estaba desregistrado de Claude; lo volví a registrar solo (los chats nuevos ya lo tienen).");
  if (clave(problemas) !== clave(antes.problemas ?? [])) {
    if (problemas.length) avisos.push(`🔌 MCP Buleje con problemas: ${problemas.join(" · ").slice(0, 600)}`);
    else if ((antes.problemas ?? []).length) avisos.push("🔌 MCP Buleje: volvió a funcionar (registro, arranque y sesión OK).");
  }
  if (reg.apagadoEn?.length && clave(reg.apagadoEn) !== clave(antes.apagadoEn ?? [])) {
    avisos.push(`🔌 MCP Buleje está apagado a mano en ${reg.apagadoEn.length} carpeta(s) (${reg.apagadoEn.join(", ").slice(0, 200)}): en ese chat escribe /mcp y actívalo.`);
  }
  for (const a of avisos) avisar(a);
  mkdirSync(dirname(ESTADO), { recursive: true });
  writeFileSync(ESTADO, JSON.stringify({ ...informe, ultimaSesion: conSesion && arr.ok ? Date.now() : antes.ultimaSesion ?? 0, apagadoEn: reg.apagadoEn ?? [] }, null, 1));
  console.log(problemas.length ? `con problemas: ${problemas.join(" · ")}` : `ok (${arr.herramientas} herramientas, ${arr.ms} ms${conSesion ? ", sesión revisada" : ""})`);
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) main().catch((e) => { console.error(`vigía falló: ${String(e?.stack ?? e)}`); process.exit(1); });
