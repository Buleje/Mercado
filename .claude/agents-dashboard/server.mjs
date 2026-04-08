#!/usr/bin/env node
/**
 * Agents Dashboard Server — puerto 3456
 *
 * Sirve el index.html del dashboard de agentes con un server HTTP nativo de Node.
 * Sin dependencias. Usado para visualizar los 19 agentes del proyecto Bodega San
 * Martín en vivo cuando Brandon quiere verlos animados.
 *
 * Uso:
 *   node .claude/agents-dashboard/server.mjs
 *   # o en background:
 *   node .claude/agents-dashboard/server.mjs &
 *
 * Después abrir http://localhost:3456/
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Puertos a intentar en orden. 3456 es el preferido pero hay un webview-ui
// que puede estar ocupándolo, así que caemos a 3457..3460 automáticamente.
const PREFERRED_PORTS = process.env.AGENTS_DASHBOARD_PORT
  ? [Number(process.env.AGENTS_DASHBOARD_PORT)]
  : [3456, 3457, 3458, 3459, 3460];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
};

const server = createServer(async (req, res) => {
  // Solo GET
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method Not Allowed");
  }

  let urlPath = (req.url ?? "/").split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  // Sanitización: prevenir path traversal
  if (urlPath.includes("..") || urlPath.includes("\0")) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad Request");
  }

  const filePath = join(__dirname, urlPath);

  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
    const buf = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Robots-Tag":  "noindex, nofollow",
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — No encontrado");
  }
});

// Auto-fallback entre puertos si el preferido está ocupado.
async function listenWithFallback(ports) {
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port);
      });
      return port;
    } catch (err) {
      if (err.code === "EADDRINUSE") {
        console.log(`[agents-dashboard] puerto ${port} ocupado, probando siguiente...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Ningún puerto disponible en ${ports.join(", ")}`);
}

try {
  const port = await listenWithFallback(PREFERRED_PORTS);
  const url = `http://localhost:${port}/`;
  console.log(`[agents-dashboard] ✅ escuchando en ${url}`);
  console.log(`[agents-dashboard] abrí tu navegador en ${url}`);
  if (port !== 3456) {
    console.log(`[agents-dashboard] ⚠️  el 3456 estaba ocupado (otro servicio); usando ${port}`);
  }
} catch (err) {
  console.error(`[agents-dashboard] ❌ ${err.message}`);
  process.exit(1);
}

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[agents-dashboard] recibí ${sig}, cerrando...`);
    server.close(() => process.exit(0));
  });
}
