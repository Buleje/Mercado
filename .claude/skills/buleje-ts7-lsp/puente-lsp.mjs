#!/usr/bin/env node
// Puente LSP entre Claude Code y el TypeScript 7 nativo del repo (`tsc --lsp --stdio`). 2026-10-07.
//
// Cubre dos huecos medidos ese día sobre este repo:
//  1. TS 7 NO empuja errores (`textDocument/publishDiagnostics`): sólo los responde si se le piden
//     (`textDocument/diagnostic`, 4,6 s en frío sobre lib/db/orders.db.ts). Claude Code sólo escucha
//     los empujados, así que tras cada didOpen/didChange/didSave el puente los pide y los publica.
//  2. Claude Code nunca cierra un documento ni avisa lo que cambian Bash, git o un formateador: antes
//     de cada pedido el puente compara el mtime de cada documento abierto con el disco y reenvía el
//     contenido (o lo cierra si se borró), para que el servidor no conteste sobre un archivo viejo.
//
// Todo lo demás pasa sin tocar. Apagar el plugin: `"buleje-ts7-lsp@skills-dir": false` en
// `enabledPlugins` de .claude/settings.local.json. Depurar: BSM_LSP_DEBUG=1 (sale en `claude --debug`).
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.title = "buleje-ts7-lsp";
const raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const bin =
  process.env.BSM_TS7_BIN || path.join(raiz, "node_modules/@typescript/typescript-linux-x64/lib/tsc");
const depurar = process.env.BSM_LSP_DEBUG === "1";
const log = (...a) => depurar && process.stderr.write(`[buleje-ts7-lsp] ${a.join(" ")}\n`);

const srv = spawn(bin, ["--lsp", "--stdio"], { cwd: raiz, stdio: ["pipe", "pipe", "inherit"] });
srv.on("error", (err) => {
  process.stderr.write(`[buleje-ts7-lsp] no arranca ${bin}: ${err.message}\n`);
  process.exit(1);
});
srv.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
process.stdin.on("end", () => srv.kill());

// ── Marco LSP: «Content-Length: N\r\n\r\n<json>» ──────────────────────────────────────────────
function lector(stream, alRecibir) {
  let buf = Buffer.alloc(0);
  stream.on("data", (trozo) => {
    buf = Buffer.concat([buf, trozo]);
    for (;;) {
      const fin = buf.indexOf("\r\n\r\n");
      if (fin < 0) return;
      const largo = Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0, fin).toString())?.[1]);
      if (!Number.isFinite(largo) || buf.length < fin + 4 + largo) return;
      const cuerpo = buf.subarray(fin + 4, fin + 4 + largo).toString("utf8");
      buf = buf.subarray(fin + 4 + largo);
      try {
        alRecibir(JSON.parse(cuerpo));
      } catch (err) {
        log("mensaje ilegible:", String(err));
      }
    }
  });
}
const escribir = (stream, msg) => {
  const s = JSON.stringify(msg);
  stream.write(`Content-Length: ${Buffer.byteLength(s, "utf8")}\r\n\r\n${s}`);
};
const alServidor = (msg) => escribir(srv.stdin, msg);
const alCliente = (msg) => escribir(process.stdout, msg);

// ── Documentos abiertos: uri → { version, mtime } ──────────────────────────────────────────────
const abiertos = new Map();
const mtimeDe = (uri) => {
  try {
    return statSync(fileURLToPath(uri)).mtimeMs;
  } catch {
    return null;
  }
};
// El puente inyecta cambios propios: la versión que ve el servidor tiene que crecer siempre.
const siguienteVersion = (uri, propuesta) => {
  const doc = abiertos.get(uri);
  const v = doc && !(propuesta > doc.version) ? doc.version + 1 : propuesta;
  if (doc) doc.version = v;
  return v;
};

// ── Diagnósticos: pedir (pull) y publicar (push) ───────────────────────────────────────────────
let clientePide = false; // si Claude Code algún día pide él mismo, el puente se corre
let seq = 0;
const pedidosPropios = new Map(); // id → uri
const esperas = new Map(); // uri → timer (agrupa ediciones seguidas)
function pedirDiagnosticos(uri) {
  if (clientePide) return;
  clearTimeout(esperas.get(uri));
  esperas.set(
    uri,
    setTimeout(() => {
      esperas.delete(uri);
      if (!abiertos.has(uri)) return;
      const id = `puente-${++seq}`;
      pedidosPropios.set(id, uri);
      alServidor({ jsonrpc: "2.0", id, method: "textDocument/diagnostic", params: { textDocument: { uri } } });
    }, 120),
  );
}
function publicar(uri, items) {
  alCliente({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, version: abiertos.get(uri)?.version, diagnostics: items ?? [] },
  });
}

// ── Disco → servidor: lo que cambió por fuera de Edit/Write ────────────────────────────────────
function sincronizarConDisco() {
  for (const [uri, doc] of abiertos) {
    const m = mtimeDe(uri);
    if (m === doc.mtime) continue;
    if (m === null) {
      abiertos.delete(uri);
      alServidor({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } });
      publicar(uri, []);
      log("borrado en disco:", uri);
      continue;
    }
    let texto;
    try {
      texto = readFileSync(fileURLToPath(uri), "utf8");
    } catch {
      continue;
    }
    doc.mtime = m;
    alServidor({
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: { textDocument: { uri, version: siguienteVersion(uri, 0) }, contentChanges: [{ text: texto }] },
    });
    pedirDiagnosticos(uri);
    log("cambiado en disco:", uri);
  }
}

// ── Cliente (Claude Code) → servidor ───────────────────────────────────────────────────────────
lector(process.stdin, (msg) => {
  const uri = msg.params?.textDocument?.uri;
  switch (msg.method) {
    case "initialize": {
      // Sin esto el servidor no ofrece pull ni avisa (refresh) cuando cambian otros archivos.
      const cap = (msg.params.capabilities ??= {});
      (cap.textDocument ??= {}).diagnostic ??= { dynamicRegistration: false, relatedDocumentSupport: true };
      ((cap.workspace ??= {}).diagnostics ??= {}).refreshSupport = true;
      break;
    }
    case "textDocument/didOpen":
      abiertos.set(uri, { version: msg.params.textDocument.version ?? 0, mtime: mtimeDe(uri) });
      alServidor(msg);
      pedirDiagnosticos(uri);
      return;
    case "textDocument/didChange":
      if (!abiertos.has(uri)) abiertos.set(uri, { version: 0, mtime: null });
      msg.params.textDocument.version = siguienteVersion(uri, msg.params.textDocument.version);
      abiertos.get(uri).mtime = mtimeDe(uri);
      alServidor(msg);
      pedirDiagnosticos(uri);
      return;
    case "textDocument/didSave":
      if (abiertos.has(uri)) abiertos.get(uri).mtime = mtimeDe(uri);
      alServidor(msg);
      pedirDiagnosticos(uri);
      return;
    case "textDocument/didClose":
      abiertos.delete(uri);
      break;
    case "textDocument/diagnostic":
      clientePide = true;
      break;
  }
  if (msg.id !== undefined && msg.method) sincronizarConDisco();
  alServidor(msg);
});

// ── Servidor → cliente ─────────────────────────────────────────────────────────────────────────
lector(srv.stdout, (msg) => {
  if (msg.id !== undefined && !msg.method && pedidosPropios.has(msg.id)) {
    const uri = pedidosPropios.get(msg.id);
    pedidosPropios.delete(msg.id);
    if (msg.error) return log("diagnóstico falló:", uri, msg.error.message);
    // Respuesta tardía de un archivo que se cerró o borró mientras tanto: no revivir sus errores.
    if (!abiertos.has(uri)) return;
    const r = msg.result ?? {};
    if (r.kind === "full") publicar(uri, r.items);
    for (const [otro, rel] of Object.entries(r.relatedDocuments ?? {})) {
      if (rel?.kind === "full") publicar(otro, rel.items);
    }
    return;
  }
  if (msg.method === "workspace/diagnostic/refresh") {
    // El servidor avisa que los errores de otros archivos pueden haber cambiado: se re-piden todos.
    alServidor({ jsonrpc: "2.0", id: msg.id, result: null });
    for (const uri of abiertos.keys()) pedirDiagnosticos(uri);
    return;
  }
  alCliente(msg);
});
