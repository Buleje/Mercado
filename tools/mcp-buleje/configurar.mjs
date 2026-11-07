#!/usr/bin/env node
// Alta de credenciales del MCP «buleje»: pide la clave SIN ECO y guarda
// ~/.config/buleje-mcp/credenciales.json con chmod 600 (contrato §2). Opcional: --probar hace 1 login por negocio.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { RUTA_CREDENCIALES, validarConfig, leerCredenciales } from "./src/credenciales.mjs";

/** Lee una línea sin mostrar lo que se escribe. */
function pedirSinEco(pregunta) {
  return new Promise((resolver, rechazar) => {
    if (!process.stdin.isTTY) return rechazar(new Error("La clave se pide en una terminal interactiva (TTY)."));
    process.stdout.write(pregunta);
    let buf = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const alDato = (c) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") { fin(); return resolver(buf); }
        if (ch === "\u0003") { fin(); return rechazar(new Error("cancelado")); }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1); else buf += ch;
      }
    };
    const fin = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", alDato); process.stdout.write("\n"); };
    process.stdin.on("data", alDato);
  });
}

function preguntar(rl, texto, defecto = "") {
  return new Promise((r) => rl.question(defecto ? `${texto} [${defecto}]: ` : `${texto}: `, (v) => r(v.trim() || defecto)));
}

export function guardar(config, ruta = RUTA_CREDENCIALES) {
  const v = validarConfig(config);
  if (!v.ok) throw new Error(`Config inválida: ${v.errores.join("; ")}`);
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  writeFileSync(ruta, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  chmodSync(ruta, 0o600);
}

async function principal() {
  const probar = process.argv.includes("--probar");
  let config = { base: "http://localhost:3000", porDefecto: "", seco: true, negocios: {} };
  if (existsSync(RUTA_CREDENCIALES)) {
    try { config = JSON.parse(readFileSync(RUTA_CREDENCIALES, "utf8")); console.log(`Se actualiza ${RUTA_CREDENCIALES}`); } catch { /* se rehace */ }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const nombre = await preguntar(rl, "Negocio (bodega / blas / qa-forestal; vacío = terminar)");
      if (!nombre) break;
      const previo = config.negocios[nombre] ?? {};
      const slug = await preguntar(rl, `  slug de «${nombre}»`, previo.slug ?? (nombre === "bodega" ? "main" : ""));
      const usuario = await preguntar(rl, "  usuario", previo.usuario ?? "claude");
      rl.pause();
      const clave = await pedirSinEco("  clave (no se muestra): ");
      rl.resume();
      if (!slug || !usuario || !clave) { console.log("  faltó un dato; no se guardó este negocio."); continue; }
      config.negocios[nombre] = { slug, usuario, clave, ...(previo.tenantId ? { tenantId: previo.tenantId } : {}) };
      config.porDefecto ||= nombre;
    }
  } finally { rl.close(); }
  if (!Object.keys(config.negocios).length) { console.log("Nada que guardar."); return; }
  guardar(config);
  console.log(`Guardado en ${RUTA_CREDENCIALES} (chmod 600). Negocios: ${Object.keys(config.negocios).join(", ")}`);
  if (probar) {
    const { crearCliente } = await import("./src/cliente.mjs");
    const cliente = crearCliente({ config: leerCredenciales() });
    for (const n of Object.keys(config.negocios)) {
      const r = await cliente.pedir(n, { metodo: "GET", ruta: "/api/auth/me" });
      console.log(`  ${n}: ${r.ok ? "login ok" : `${r.error?.codigo}: ${r.error?.mensaje}`}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
