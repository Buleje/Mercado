#!/usr/bin/env node
/**
 * dev-guardian — mata procesos `node.exe` zombis que quedaron vivos después de
 * cerrar VS Code o de matar Turbopack sin limpieza.
 *
 * Criterio de "zombi":
 *   - Es un proceso node
 *   - StartTime > umbral horas (default 12h)
 *
 * Visto en prod: 45 procesos node acumulados, uno con 91 min de CPU quemado,
 * peleándose por locks de Turbopack y contribuyendo al .next/dev bloat.
 *
 * Uso:
 *   npm run dev:zombies            # mata zombis >12h
 *   MAX_HOURS=4 npm run dev:zombies # mata zombis >4h
 *   DRY_RUN=1 npm run dev:zombies  # solo lista, no mata
 *
 * Solo Windows. Delega a scripts/dev-guardian.ps1 (PowerShell hace el trabajo
 * real — Get-Process por StartTime es más fácil que en Node).
 */

import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

if (platform() !== "win32") {
  console.log("dev-guardian: solo Windows. Salgo sin hacer nada.");
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ps1Path = join(__dirname, "dev-guardian.ps1");

const MAX_HOURS = String(process.env.MAX_HOURS ?? 12);
const DRY_RUN = process.env.DRY_RUN === "1";

const args = [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  ps1Path,
  "-MaxHours",
  MAX_HOURS,
];
if (DRY_RUN) args.push("-DryRun");

const result = spawnSync("powershell", args, { stdio: "inherit" });
process.exit(result.status ?? 0);
