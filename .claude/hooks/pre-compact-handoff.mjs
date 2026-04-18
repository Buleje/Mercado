#!/usr/bin/env node
/**
 * PreCompact hook — antes que el harness comprima el transcript, volca
 * un snapshot de tareas pendientes, branch state y commits recientes
 * a `.claude/session_handoff.md` para que la siguiente sesion (o la
 * misma post-compact) pueda retomar sin perdida.
 *
 * Input: stdin JSON del hook (no requerido para este snapshot).
 * Output: exit 0 siempre. Escribe handoff file; no bloquea jamas.
 * Budget: <500ms.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const outFile = join(projectDir, ".claude", "session_handoff.md");

function tryExec(cmd) {
  try {
    return execSync(cmd, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

const now = new Date().toISOString().replace("T", " ").slice(0, 19);
const branch = tryExec("git rev-parse --abbrev-ref HEAD");
const dirtyFiles = tryExec("git status --short").split("\n").filter(Boolean);
const lastCommits = tryExec("git log --oneline -8").split("\n").filter(Boolean);
const stagedCount = tryExec("git diff --cached --name-only").split("\n").filter(Boolean).length;

// Read task list if exists (Claude stores in .claude/tasks/ — best effort)
let taskListHint = "";
const taskDir = join(projectDir, ".claude", "tasks");
if (existsSync(taskDir)) {
  try {
    const files = execSync(`ls "${taskDir}" | head -5`, { encoding: "utf-8" }).trim();
    if (files) taskListHint = `\nTask dir present: ${files}`;
  } catch {}
}

const md = `# Session Handoff — ${now}

Este archivo se genera automaticamente antes de cada compactacion de contexto
(hook PreCompact). La proxima sesion debe LEERLO primero para retomar.

## Git state

- **Branch:** \`${branch}\`
- **Staged:** ${stagedCount} archivo(s)
- **Dirty:** ${dirtyFiles.length} archivo(s) sin commitear
${dirtyFiles.length > 0 ? dirtyFiles.slice(0, 10).map((f) => `  - \`${f}\``).join("\n") : ""}

## Últimos commits

${lastCommits.map((c) => `- ${c}`).join("\n")}

## Contexto guardado

- Dev server: http://localhost:3000 (verificar con \`curl -I localhost:3000\`)
- Memoria persistente: \`~/.claude/projects/.../memory/MEMORY.md\`
- CLAUDE.md root: power rules activas (paralelismo, no-restart, grep-first, worktrees)
- Hooks activos: danger-zone + pre-bash-guard + hex-code-guard + post-tool-lint + session-start + user-prompt-adr-injector + pre-compact-handoff + subagent-cost-log

## Acciones típicas post-retome

1. \`curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:3000/\` — verificar dev vivo
2. \`git log --oneline -5\` — contexto reciente
3. Leer este handoff + MEMORY.md antes de continuar trabajo
${taskListHint}
`;

try {
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  writeFileSync(outFile, md, "utf-8");
} catch {
  // never block compaction
}
process.exit(0);
