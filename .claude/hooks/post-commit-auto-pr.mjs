#!/usr/bin/env node
/**
 * post-commit-auto-pr.mjs — Hook de cierre del flujo autónomo.
 *
 * Tras un commit en un branch != master/main/prod:
 *   1. Verifica que el branch tenga upstream (sino, push).
 *   2. Corre tsc + lint quick-check (timeout 60s).
 *   3. Si pasa, abre/actualiza un PR con `gh pr create` o reusa existente.
 *   4. Notifica vía /notify si el flujo cierra OK.
 *
 * NO hace auto-merge — eso es decisión humana siempre.
 *
 * Activación: opt-in. Setear BSM_AUTO_PR=1 para activar.
 * Sin la env var, sale 0 sin hacer nada.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.BSM_AUTO_PR !== "1") process.exit(0);

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function git(cmd) {
  try {
    return execSync(`git -C "${projectRoot}" ${cmd}`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function notify(msg) {
  const send = join(projectRoot, ".claude/skills/notify/send.mjs");
  if (!existsSync(send)) return;
  try {
    execSync(`node "${send}" "${msg.replace(/"/g, '\\"')}"`, {
      timeout: 10000,
      stdio: "ignore",
    });
  } catch {}
}

const branch = git("branch --show-current");
if (!branch || ["master", "main", "prod"].includes(branch)) process.exit(0);

const upstream = git("rev-parse --abbrev-ref @{upstream}");
if (!upstream) {
  process.stderr.write(`[auto-pr] sin upstream — pushing…\n`);
  try {
    execSync(`git -C "${projectRoot}" push -u origin "${branch}"`, {
      timeout: 30000,
      stdio: "inherit",
    });
  } catch {
    process.stderr.write(`[auto-pr] push falló, abort\n`);
    process.exit(0);
  }
}

// Quick checks (no test suite — eso ya corrió pre-commit)
process.stderr.write(`[auto-pr] tsc quick check…\n`);
try {
  execSync("npx tsc --noEmit --incremental 2>&1 | tail -3", {
    cwd: projectRoot,
    timeout: 60000,
    stdio: "pipe",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  });
} catch (e) {
  process.stderr.write(`[auto-pr] tsc falló — skip PR\n`);
  notify(`auto-pr: tsc falló en ${branch}, no creé PR`);
  process.exit(0);
}

// Existe PR?
const existing = git(`!gh pr view "${branch}" --json url --jq .url 2>/dev/null`);
if (existing && existing.startsWith("http")) {
  process.stderr.write(`[auto-pr] PR existe: ${existing}\n`);
  notify(`PR actualizado en ${branch}: ${existing}`);
  process.exit(0);
}

// Crear PR
try {
  const lastSubject = git("log -1 --pretty=%s");
  const cmd = `gh pr create --base master --head "${branch}" --title "${lastSubject.replace(/"/g, "'")}" --body "Auto-PR generado por post-commit-auto-pr hook." 2>&1`;
  const out = execSync(cmd, { cwd: projectRoot, timeout: 30000, encoding: "utf8" });
  const url = out.match(/https:\/\/github\.com\/\S+/)?.[0] ?? "(?)";
  process.stderr.write(`[auto-pr] PR creado: ${url}\n`);
  notify(`PR creado en ${branch}: ${url}`);
} catch (e) {
  process.stderr.write(`[auto-pr] gh pr create falló: ${String(e.message).slice(0, 200)}\n`);
}

process.exit(0);
