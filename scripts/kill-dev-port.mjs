#!/usr/bin/env node
/**
 * kill-dev-port — mata el proceso que tiene abierto el puerto del dev server.
 *
 * Reemplaza a `taskkill //F //IM node.exe` que mata TODOS los nodes (incluido
 * el MCP de Playwright, agentes en background, etc). Solo mata el que realmente
 * tiene el puerto ocupado.
 *
 * Uso:
 *   node scripts/kill-dev-port.mjs          # default 3000
 *   PORT=3001 node scripts/kill-dev-port.mjs
 *
 * Cross-platform: Windows (Get-NetTCPConnection) y Unix (lsof).
 */

import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const PORT = Number(process.env.PORT ?? 3000);

function getPidsWindows(port) {
  const res = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (res.status !== 0) return [];
  return res.stdout
    .trim()
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function getPidsUnix(port) {
  // `ss` primero: en WSL2 con networkingMode=mirrored, `lsof -tiTCP:PORT` devuelve
  // vacio con exit 1 aunque haya un listener (verificado 2026-09-03), asi que el
  // script decia "puerto libre" con next-server vivo y `dev:clean`/`dev:nuke`
  // levantaban un segundo server en :3001. `ss -ltnpH` si lo ve.
  const ss = spawnSync("ss", ["-ltnpH", `sport = :${port}`], { encoding: "utf8" });
  const desdeSs = [...(ss.stdout ?? "").matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
  if (desdeSs.length > 0) return [...new Set(desdeSs)];
  // Fallback lsof: se lee la salida aunque el exit sea != 0 (en WSL warnea y sale 1).
  const res = spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" });
  return (res.stdout ?? "")
    .trim()
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}
function killWindows(pid) {
  const res = spawnSync("taskkill", ["/F", "/PID", String(pid)], {
    encoding: "utf8",
    windowsHide: true,
  });
  return res.status === 0;
}

function killUnix(pid) {
  const res = spawnSync("kill", ["-9", String(pid)], { encoding: "utf8" });
  return res.status === 0;
}

function main() {
  const isWin = platform() === "win32";
  const pids = isWin ? getPidsWindows(PORT) : getPidsUnix(PORT);

  if (pids.length === 0) {
    console.log(`ℹ️  Puerto ${PORT} libre — nada que matar.`);
    return;
  }

  console.log(`🔫 Matando PID(s) en puerto ${PORT}: ${pids.join(", ")}`);
  for (const pid of pids) {
    const ok = isWin ? killWindows(pid) : killUnix(pid);
    console.log(ok ? `  ✅ PID ${pid} terminado.` : `  ⚠️  No pude matar PID ${pid}.`);
  }
}

main();
