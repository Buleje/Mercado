#!/usr/bin/env node
/**
 * Agents Dashboard Server — puerto 3456 (auto-fallback a 3457..)
 *
 * Sirve el HTML/JS del dashboard + endpoint /api/state con información
 * REAL del proyecto (git log, archivos modificados, agent team activo
 * derivado de los commits recientes).
 *
 * Sin dependencias npm — todo con módulos nativos de Node.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
// La raíz del submódulo bodega-san-martin — subimos 2 niveles desde
// .claude/agents-dashboard/
const REPO_ROOT = dirname(dirname(__dirname));

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

// ─── Git helpers ──────────────────────────────────────────────────────────────

async function git(...args) {
  try {
    const { stdout } = await execFileP("git", args, {
      cwd: REPO_ROOT,
      maxBuffer: 1024 * 1024 * 4,
    });
    return stdout;
  } catch {
    return "";
  }
}

/**
 * Parsea el mensaje de un commit para inferir qué agentes trabajaron en él,
 * basándose en keywords del proyecto real.
 *
 * Ejemplo de commits del repo:
 *   feat(marketplace): bloque d2 sprint 1 — chat buyer↔seller schema + db
 *   test(marketplace): chat público 14 tests unitarios + e2e + adr 013
 *   feat(tooling): dashboard v2 agent hq — oficinas privadas + war room
 */
function inferAgentsFromCommit(subject, files) {
  const agents = new Set();
  const s = subject.toLowerCase();
  const fs = files.join(" ").toLowerCase();

  // Orchestration
  if (s.includes("feat(marketplace)") || s.includes("bloque") || s.includes("sprint")) {
    agents.add("initiative-orchestrator");
  }

  // DB / schema
  if (s.includes("schema") || s.includes("prisma") || s.includes("migration") ||
      fs.includes("prisma/schema") || fs.includes(".sql") || fs.includes("lib/db/")) {
    agents.add("database-engineer");
  }
  if (s.includes("migration") || fs.includes("migrations/")) {
    agents.add("migration-planner");
  }

  // Backend
  if (s.includes("feat(") && (s.includes("route") || s.includes("api")) ||
      fs.includes("app/api/") || fs.includes("lib/db/")) {
    agents.add("backend-platform-engineer");
  }

  // Frontend
  if (s.includes("ui") || s.includes("component") || s.includes("tab") ||
      fs.includes("components/admin/") || fs.includes("components/marketplace/") ||
      fs.includes(".tsx")) {
    agents.add("frontend-engineer");
  }

  // Checkout specialist
  if (s.includes("checkout") || s.includes("cart") ||
      fs.includes("components/checkout/") || fs.includes("cartsidebar")) {
    agents.add("checkout-specialist");
  }

  // Integration specialist (WhatsApp/etc)
  if (s.includes("whatsapp") || s.includes("worker") || s.includes("bullmq") ||
      fs.includes("lib/integrations/") || fs.includes("lib/queue/")) {
    agents.add("integration-specialist");
  }

  // DevOps
  if (s.includes("deploy") || s.includes("sentry") || s.includes("otel") ||
      s.includes("rollback") || s.includes("feature flag") ||
      fs.includes("sentry") || fs.includes("vercel.json") || fs.includes("feature-flags")) {
    agents.add("devops-release-engineer");
  }

  // QA
  if (s.includes("test") || fs.includes("__tests__/") || fs.includes("e2e/")) {
    agents.add("qa-reliability-engineer");
  }

  // Security
  if (s.includes("security") || s.includes("owasp") || s.includes("auth") ||
      s.includes("rbac") || fs.includes("require-admin") || fs.includes("lib/auth")) {
    agents.add("security-auditor");
  }

  // Docs
  if (s.includes("docs") || s.includes("adr") || s.includes("claude.md") ||
      fs.includes("docs/") || fs.includes("claude.md")) {
    agents.add("solution-architect");
  }

  // Mobile
  if (s.includes("capacitor") || s.includes("android") || s.includes("ios") ||
      fs.includes("capacitor.config") || fs.includes("android/") || fs.includes("ios/")) {
    agents.add("mobile-engineer");
  }

  // Performance
  if (s.includes("perf") || s.includes("optimize") || s.includes("bundle") ||
      s.includes("cache") || fs.includes("next.config")) {
    agents.add("performance-engineer");
  }

  // Data
  if (s.includes("analytics") || s.includes("kpi") || s.includes("dashboard") ||
      fs.includes("lib/db/forecasting") || fs.includes("analytics")) {
    agents.add("data-analyst");
  }

  // Tooling (no está en la lista de agentes pero lo mapeamos a devops)
  if (s.includes("tooling") || s.includes("agent hq") || s.includes("dashboard")) {
    agents.add("devops-release-engineer");
  }

  return Array.from(agents);
}

async function getProjectState() {
  // 1. Últimos 15 commits
  const logRaw = await git("log", "--oneline", "-15", "--pretty=format:%h|%s|%at");
  const commits = logRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, ts] = line.split("|");
      return {
        hash: hash ?? "",
        subject: subject ?? "",
        timestamp: Number(ts ?? 0),
      };
    });

  // 2. Archivos modificados en cada uno de los últimos 5 commits (para inferir agentes)
  const recentCommitsWithFiles = [];
  for (const c of commits.slice(0, 5)) {
    if (!c.hash) continue;
    const filesRaw = await git("show", "--name-only", "--pretty=format:", c.hash);
    const files = filesRaw.split("\n").filter(Boolean);
    const agents = inferAgentsFromCommit(c.subject, files);
    recentCommitsWithFiles.push({ ...c, files: files.slice(0, 5), agents });
  }

  // 3. Status — archivos modificados ahora
  const statusRaw = await git("status", "--short");
  const modified = statusRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }))
    .slice(0, 40);

  // 4. Derivar "currentAgentTeam" del commit más reciente
  const currentAgentTeam = recentCommitsWithFiles[0]?.agents ?? [];

  // 5. Archivos "en trabajo" = los del commit más reciente
  const currentFiles = recentCommitsWithFiles[0]?.files ?? [];

  // 6. Metadata del repo
  const branchRaw = await git("rev-parse", "--abbrev-ref", "HEAD");
  const branch = branchRaw.trim() || "master";
  const headRaw = await git("rev-parse", "--short", "HEAD");
  const head = headRaw.trim() || "";

  return {
    ts: Date.now(),
    repo: {
      branch,
      head,
      root: REPO_ROOT,
    },
    commits: recentCommitsWithFiles,
    modified,
    currentAgentTeam,
    currentFiles,
    stats: {
      commitsTotal: commits.length,
      modifiedTotal: modified.length,
      agentsActive: currentAgentTeam.length,
    },
  };
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method Not Allowed");
  }

  let urlPath = (req.url ?? "/").split("?")[0];

  // API endpoints
  if (urlPath === "/api/state") {
    try {
      const state = await getProjectState();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(JSON.stringify(state, null, 2));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: String(err) }));
    }
  }

  if (urlPath === "/api/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, ts: Date.now() }));
  }

  // Static files
  if (urlPath === "/") urlPath = "/index.html";
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

// ─── Auto-fallback entre puertos ──────────────────────────────────────────────

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
  console.log(`[agents-dashboard] 📊 api en ${url}api/state`);
  console.log(`[agents-dashboard] 📁 repo root: ${REPO_ROOT}`);
  if (port !== 3456) {
    console.log(`[agents-dashboard] ⚠️  el 3456 estaba ocupado; usando ${port}`);
  }
} catch (err) {
  console.error(`[agents-dashboard] ❌ ${err.message}`);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[agents-dashboard] recibí ${sig}, cerrando...`);
    server.close(() => process.exit(0));
  });
}
