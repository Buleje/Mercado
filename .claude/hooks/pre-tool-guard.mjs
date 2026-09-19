#!/usr/bin/env node
/**
 * pre-tool-guard.mjs — PreToolUse ÚNICO (Bash | Edit | Write | MultiEdit | Skill).
 *
 * Fusiona en UN solo proceso node lo que antes eran 2-3 procesos por tool-call:
 *   pre-tool-mem-guard.mjs + pre-bash-guard.mjs + danger-zone.mjs
 * (los originales quedan en el repo intactos; para revertir, restaurar los 3
 *  matchers en .claude/settings.json — ver `_revertir` al pie).
 *
 * Por qué (medido 2026-09-19): cada hook costaba ~32 ms, casi todo arranque de
 * node; una sesión real hizo 438 llamadas Bash → ~28 s sólo en spawns. Además
 * el mem-guard spawneaba DOS `ps | awk` por llamada. Acá:
 *   - 1 solo proceso node por tool-call
 *   - conteo de procesos leyendo /proc en JS (0 subprocesos)
 *   - caché de 4 s del veredicto OK del mem-guard (las llamadas vienen en ráfaga)
 *
 * Exit 0 = allow · Exit 2 = block (stderr al modelo).
 * Overrides: BSM_SKIP_MEM_GUARD=1 · BSM_ALLOW_INSTALL=1 · BSM_DZ_BLOCK=1 · BSM_HOOKS_DEBUG=1
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

/** Corre un hook hijo pasándole el mismo payload; nunca tira. */
function execFileSync_seguro(script, payload) {
  try {
    const r = spawnSync("node", [script], { input: payload, encoding: "utf8", timeout: 180000 });
    return { status: r.status ?? 0, stdout: r.stdout || "", stderr: r.stderr || "" };
  } catch {
    return { status: 0, stdout: "", stderr: "" };
  }
}

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.env.BSM_PROJECT_ROOT || process.cwd();
const DEBUG = process.env.BSM_HOOKS_DEBUG === "1";

// ─────────────────────────────────────────────────────────────────────────────
// 1. MEM GUARD — circuit breaker de recursos
// ─────────────────────────────────────────────────────────────────────────────
const MIN_FREE_MB = 500;
const MAX_TSC = 3;
const MAX_ORPHAN_CHROMIUM = 4;
const MAX_LOAD_1MIN = 28; // 12 núcleos; 28 ≈ 2.3× cores (Brandon 2026-06-02)
const CACHE_PATH = "/tmp/bsm-mem-guard.cache";
const CACHE_MS = 4000;

/** Comandos que usan ~0 RAM y son justo los que SALEN de la saturación. */
const LIGHT = new Set(["free", "ps", "pgrep", "pkill", "kill", "killall", "cat", "tail", "head",
  "ls", "wc", "echo", "df", "uptime", "true", "sleep", "grep", "awk", "sed", "which", "date",
  "id", "pwd", "ss"]);

function memInfo() {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    const grab = (k) => {
      const m = meminfo.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
      return m ? Math.round(parseInt(m[1], 10) / 1024) : 0;
    };
    return { total: grab("MemTotal"), avail: grab("MemAvailable") };
  } catch { return null; }
}

function loadAvg() {
  try {
    const l = readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/);
    return { l1: parseFloat(l[0]) };
  } catch { return { l1: 0 }; }
}

/**
 * Censo de procesos leyendo /proc directamente: reemplaza los dos
 * `ps -eo … | awk` del hook viejo (2 subprocesos → 0).
 * Devuelve { tsc, orphanChromium } en una sola pasada.
 */
function censarProcesos() {
  let tsc = 0;
  let orphanChromium = 0;
  let pids;
  try { pids = readdirSync("/proc"); } catch { return { tsc: 0, orphanChromium: 0 }; }
  for (const pid of pids) {
    if (pid.charCodeAt(0) < 48 || pid.charCodeAt(0) > 57) continue; // no es /proc/<pid>
    let cmd;
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { continue; }
    if (!cmd) continue;
    const linea = cmd.replace(/\0/g, " ");
    if (linea.includes("tsc --noEmit")) tsc++;
    if (/chrome|chromium/.test(linea)) {
      // ppid = campo 4 de /proc/<pid>/stat; ppid 1 = huérfano adoptado por init
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const tras = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        if (tras[1] === "1") orphanChromium++;
      } catch { /* el proceso murió mientras lo leíamos */ }
    }
  }
  return { tsc, orphanChromium };
}

function leerCache() {
  try {
    const { t } = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    return Date.now() - t < CACHE_MS;
  } catch { return false; }
}

function escribirCache() {
  try { writeFileSync(CACHE_PATH, JSON.stringify({ t: Date.now() })); } catch {}
}

function autokill() {
  if (process.env.BSM_AUTOKILL !== "1") return null;
  const acts = [];
  try {
    execSync(`ps -eo pid,ppid,cmd | awk '$2==1 && /chrome|chromium/ {print $1}' | xargs -r kill -9 2>/dev/null || true`,
      { shell: "/bin/bash", timeout: 3000 });
    acts.push("chromium-orphans-killed");
  } catch {}
  try {
    execSync(`ps -eo pid,ppid,cmd | awk '$2==1 && /tsc/ {print $1}' | xargs -r kill -9 2>/dev/null || true`,
      { shell: "/bin/bash", timeout: 3000 });
    acts.push("tsc-orphans-killed");
  } catch {}
  return acts.length ? acts.join(",") : null;
}

/** @returns {null | string} null = pasa; string = motivo del bloqueo */
function memGuard(tool, toolInput) {
  if (process.env.BSM_SKIP_MEM_GUARD === "1") return null;
  if (!["Edit", "Write", "MultiEdit", "Bash"].includes(tool)) return null;

  if (tool === "Bash") {
    const cmd = String(toolInput?.command ?? "");
    const segmentos = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
    const todoLiviano = segmentos.length > 0 && segmentos.every((seg) => {
      const primero = (seg.match(/^[A-Za-z0-9_./-]+/) || [""])[0].split("/").pop();
      return LIGHT.has(primero);
    });
    if (todoLiviano) return null;
  }

  // Ráfaga: si hace <4 s el sistema estaba sano, no re-censamos.
  if (leerCache()) return null;

  const mem = memInfo();
  const load = loadAvg();
  const { tsc, orphanChromium } = censarProcesos();

  const problemas = [];
  if (mem && mem.avail < MIN_FREE_MB) problemas.push(`RAM libre ${mem.avail}MB < ${MIN_FREE_MB}MB`);
  if (tsc >= MAX_TSC) problemas.push(`${tsc} procs tsc apilados (max ${MAX_TSC})`);
  if (orphanChromium >= MAX_ORPHAN_CHROMIUM) problemas.push(`${orphanChromium} chromium huérfanos (max ${MAX_ORPHAN_CHROMIUM})`);
  if (load.l1 > MAX_LOAD_1MIN) problemas.push(`load 1min ${load.l1.toFixed(1)} > ${MAX_LOAD_1MIN}`);

  if (problemas.length === 0) {
    escribirCache();
    if (DEBUG && mem) {
      process.stderr.write(`[guard] OK ${mem.avail}MB libre, load ${load.l1.toFixed(1)}, tsc=${tsc}, chromium-huérfanos=${orphanChromium}\n`);
    }
    return null;
  }

  const matados = autokill();
  if (matados) {
    try { execSync("sleep 0.5"); } catch {}
    const mem2 = memInfo();
    const censo2 = censarProcesos();
    const sigueMal =
      (mem2 && mem2.avail < MIN_FREE_MB) ||
      censo2.tsc >= MAX_TSC ||
      censo2.orphanChromium >= MAX_ORPHAN_CHROMIUM ||
      loadAvg().l1 > MAX_LOAD_1MIN;
    if (!sigueMal) {
      escribirCache();
      if (DEBUG) process.stderr.write(`[guard] auto-sanado tras ${matados} — RAM ${mem2?.avail}MB libre, sigo\n`);
      return null;
    }
  }

  const logPath = join(PROJECT_DIR, ".claude", ".mem-guard.log");
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath,
      `[${new Date().toISOString()}] tool=${tool} blocked: ${problemas.join(" | ")}${matados ? ` | autokill=${matados}` : ""}\n`,
      { flag: "a" });
  } catch {}

  return `[mem-guard] BLOQUEADO — sistema saturado:\n` +
    `  ${problemas.map((p) => `- ${p}`).join("\n  ")}\n` +
    (matados ? `  Auto-killed: ${matados}\n` : `  Tip: exportá BSM_AUTOKILL=1 para que limpie automático.\n`) +
    `  O esperá 30s y reintentá. Override: BSM_SKIP_MEM_GUARD=1.\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BASH GUARD — denylist de comandos destructivos
// ─────────────────────────────────────────────────────────────────────────────
const SUDO_DENYLIST = [
  { re: /\bsudo\b[^|;&]*\brm\s+(?:-\S*[rR]\S*|--recursive)/, label: "sudo rm -r (recursivo)" },
  { re: /\bsudo\b[^|;&]*\bdd\s+/, label: "sudo dd" },
  { re: /\bsudo\b[^|;&]*\bmkfs\b/, label: "sudo mkfs (formatear)" },
  { re: /\bsudo\b[^|;&]*\bwipefs\b/, label: "sudo wipefs" },
  { re: /\bsudo\b[^|;&]*\b(fdisk|parted|sgdisk|gdisk)\b/, label: "sudo particionado" },
  { re: /\bsudo\b[^|;&]*>\s*\/dev\/(sd|nvme|vd|mmcblk|disk)/, label: "escritura a disco crudo" },
  { re: /\bsudo\b[^|;&]*\bchmod\s+-R\s+0?777\s+\/(?:\s|$|etc|usr|bin|boot|lib|var)/, label: "chmod -R 777 system" },
  { re: /\bsudo\b[^|;&]*\bchown\s+-R\b[^|;&]*\s\/(?:etc|usr|bin|boot|lib|var)(?:\s|\/|$)/, label: "chown -R system" },
  { re: /\bsudo\s+(?:-i\b|-s\b|su\b|bash\b|sh\b|zsh\b)/, label: "shell root interactivo" },
  { re: /\bsudo\b[^|;&]*\b(userdel|deluser|usermod|passwd)\b/, label: "gestión de usuarios" },
  { re: /\bsudo\b[^|;&]*\b(shutdown|reboot|halt|poweroff)\b/, label: "apagar/reiniciar" },
  { re: /\bsudo\b[^|;&]*\bvisudo\b/, label: "visudo (riesgo lockout)" },
  { re: /\bsudo\b[^|;&]*(?:tee|>)\s*\/etc\/(?:passwd|shadow|sudoers|fstab)/, label: "overwrite archivo crítico" },
];

const BLOCK_PATTERNS = [
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, label: "rm -rf (recursivo)", severity: "critical", reason: "Borrado recursivo peligroso. Usá `git rm` o `rimraf` si es node_modules." },
  { pattern: /\brm\b.*(--no-preserve-root|\s\/(?:\s|$)|\s~(?:\s|$|\/))/, label: "rm sobre / o ~", severity: "critical", reason: "rm apuntando a raíz o home. Bloqueado siempre." },
  { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i, label: "DROP SQL", severity: "critical", reason: "Usá migration Prisma + DIRECT_URL." },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, label: "TRUNCATE TABLE", severity: "critical", reason: "Usá soft-delete o migration formal." },
  { pattern: /\bDELETE\s+FROM\s+[A-Za-z_][A-Za-z0-9_]*\s*(?!WHERE|LIMIT)/i, label: "DELETE sin WHERE", severity: "critical", reason: "Agregá WHERE explícito." },
  { pattern: /\bgit\s+push\s+(?:-[a-z]*f[a-z]*|--force(?!-with-lease))\s+.*(?:master|main)\b/, label: "git push --force a master/main", severity: "critical", reason: "Usá --force-with-lease en branch personal." },
  { pattern: /\bgit\s+reset\s+--hard\s+origin\/(?:master|main)/, label: "git reset --hard origin", severity: "high", reason: "Stash o branch primero." },
  { pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*[dx]/, label: "git clean -fdx", severity: "high", reason: "Respaldá antes." },
  { pattern: /\bgit\s+checkout\s+\.\s*$/, label: "git checkout .", severity: "medium", reason: "Descarta TODO el working copy. Usá paths específicos." },
  { pattern: /\bgit\s+restore\s+\.\s*$/, label: "git restore .", severity: "medium", reason: "Descarta TODO el working copy. Usá paths específicos." },
  { pattern: /\bcurl\s+.*\|\s*(?:sh|bash|zsh|fish|python|node)\b/, label: "curl | sh pipe", severity: "critical", reason: "Descargá, leé, después ejecutá." },
  { pattern: /\bwget\s+.*\|\s*(?:sh|bash|zsh|fish|python|node)\b/, label: "wget | sh pipe", severity: "critical", reason: "Descargá, leé, después ejecutá." },
  { pattern: /\bdocker\s+(?:system|volume|image|container)\s+prune\s+(?:-[a-z]*f|--force)/, label: "docker prune --force", severity: "medium", reason: "Borrado masivo de recursos Docker." },
  { pattern: /\bkubectl\s+delete\s+(?:all|pods?|deployments?)\s+--all\b/, label: "kubectl delete --all", severity: "critical", reason: "Usá namespaces o label selectors." },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:uninstall|remove)\s+(?:next|react|prisma|typescript)(?:\s|$)/, label: "desinstalar dep core", severity: "high", reason: "Rompe el build. Confirmá." },
];

/** @returns {null | {label,severity,reason}} */
function bashGuard(toolInput) {
  if (process.env.BSM_ALLOW_INSTALL === "1") return null;
  const command = String(toolInput?.command ?? "");
  if (!command) return null;

  if (/\bsudo\b/.test(command)) {
    for (const d of SUDO_DENYLIST) {
      if (d.re.test(command)) {
        return {
          label: d.label,
          severity: "critical",
          reason: "Operación catastrófica/irreversible con sudo. Bloqueada incluso con " +
            "autonomía elevada — corréla a mano si de verdad es intencional.",
        };
      }
    }
  }
  for (const p of BLOCK_PATTERNS) {
    if (p.pattern.test(command)) return p;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DANGER ZONE — archivos críticos (warn-only salvo BSM_DZ_BLOCK=1)
//    Actualizado 2026-09-19: los 5 agentes que nombraba (checkout-squad,
//    security-squad, database-engineer, frontend-engineer,
//    backend-platform-engineer) NO EXISTEN desde el harness del 09-14.
//    Ahora nombra los 8 reales y los skills reales de .claude/skills/.
// ─────────────────────────────────────────────────────────────────────────────
const DANGER_ZONES = [
  { pattern: /CheckoutModal\.tsx/, instrucciones: "checkout-flow", skill: "audit-first", label: "CheckoutModal (pagos, cupones, reservas)", agente: "backend + security", reason: "Zona crítica de pagos: totales en backend, idempotency." },
  { pattern: /components\/checkout\//, instrucciones: "checkout-flow", skill: "audit-first", label: "components/checkout/** (flujo de pago completo)", agente: "frontend + security", reason: "Sub-componentes del checkout — auditá antes de tocar." },
  { pattern: /role-permissions\.ts/, instrucciones: "security-auth", skill: "multi-tenant-guard", label: "role-permissions.ts (RBAC 26 recursos × 6 roles)", agente: "security", reason: "Cambiar permisos puede bloquear módulos enteros." },
  { pattern: /lib\/db\/orders\.db\.ts/, instrucciones: "database-migrations", skill: "audit-first", label: "orders.db.ts (state machine, idempotency)", agente: "database", reason: "State machine de órdenes — requiere migration-planner si toca datos." },
  { pattern: /schema\.prisma/, instrucciones: "prisma-schema", skill: "migration-planner", label: "schema.prisma (189 modelos, requiere DIRECT_URL)", agente: "database", reason: "Cambio de schema requiere plan expand→migrate→contract." },
  { pattern: /cart-context\.tsx/, instrucciones: "state-management", skill: "audit-first", label: "cart-context.tsx (BroadcastChannel + localStorage multi-tab)", agente: "frontend", reason: "Estado compartido multi-tab — riesgo de races." },
  { pattern: /api\/batches/, instrucciones: "fefo-inventory", skill: "audit-first", label: "API batches (FEFO, expiryDate vs expiresAt)", agente: "backend", reason: "Lógica FEFO crítica para inventario." },
  { pattern: /proxy\.ts/, instrucciones: "security-auth", skill: "multi-tenant-guard", label: "proxy.ts (auth + CSP + tenant + rate limit)", agente: "security", reason: "Middleware central — cualquier error expone toda la app." },
  { pattern: /lib\/middleware\//, instrucciones: "security-auth", skill: "multi-tenant-guard", label: "lib/middleware/** (auth, CSP, rate limit, tenant guard)", agente: "security", reason: "Middleware central — cualquier error expone toda la app." },
  { pattern: /lib\/db\/marketplace\.db\.ts|lib\/commissions/, instrucciones: "database-migrations", skill: "audit-first", label: "marketplace.db.ts / commissions (dinero cross-vendor)", agente: "backend + security", reason: "Plata entre vendors — los totales salen del backend." },
  { pattern: /CartSidebar\.tsx/, instrucciones: "state-management", skill: "audit-first", label: "CartSidebar.tsx (BroadcastChannel multi-tab sync)", agente: "frontend", reason: "Sincronización de carrito multi-tab." },
];

function consumirBypass(clave) {
  try {
    const lockPath = `/tmp/bsm-dz-bypass-${clave}`;
    if (!existsSync(lockPath)) return null;
    const reason = readFileSync(lockPath, "utf8").trim();
    try { unlinkSync(lockPath); } catch {}
    return reason || "sin motivo declarado";
  } catch { return null; }
}

/** @returns {null | {bloquear:boolean, mensaje:string, respuesta?:string}} */
function dangerZone(toolInput) {
  const filePath = toolInput?.file_path || "";
  if (!filePath) return null;

  for (const zona of DANGER_ZONES) {
    if (!zona.pattern.test(filePath)) continue;

    const bypass = consumirBypass(zona.instrucciones);
    if (bypass) {
      return {
        bloquear: false,
        mensaje: `🟡 DZ BYPASS · ${zona.label}\n   Firmado: ${zona.instrucciones}\n   Razón: ${bypass}\n   (lockfile consumido — la próxima edición requiere firma nueva)\n`,
      };
    }

    const instrPath = `.github/instructions/${zona.instrucciones}.instructions.md`;
    const falta = !existsSync(join(PROJECT_DIR, instrPath));
    const nota = falta ? `\n   ⚠️  Falta ${instrPath} — creálo antes de editar.` : "";

    const cuerpo =
      `⚠️ ZONA DE PELIGRO: ${zona.label}\n` +
      `   📖 Instrucciones: ${instrPath}${falta ? " (NO EXISTE)" : ""}\n` +
      `   🧰 Skill: /${zona.skill}\n` +
      `   🤖 Agente sugerido: ${zona.agente}\n` +
      `   💡 ${zona.reason}${nota}\n`;

    if (process.env.BSM_DZ_BLOCK === "1") {
      return {
        bloquear: true,
        mensaje: cuerpo,
        respuesta: JSON.stringify({
          decision: "block",
          reason: `ZONA DE PELIGRO: ${zona.label}. Leé ${instrPath} primero.`,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: cuerpo,
          },
        }),
      };
    }
    return { bloquear: false, mensaje: `🟡 DANGER ZONE (warn-only)\n${cuerpo}   (BSM_DZ_BLOCK=1 para bloqueo duro)\n` };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — un solo parseo de stdin, un solo proceso
// ─────────────────────────────────────────────────────────────────────────────
function bloquearBash(p) {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `Comando destructivo bloqueado: ${p.label}. ${p.reason}`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `🛑 BASH GUARD · severity=${p.severity}\n` +
        `Patrón bloqueado: ${p.label}\n` +
        `Razón: ${p.reason}\n\n` +
        `Si de verdad lo necesitás, corrélo desde tu terminal fuera de Claude Code.`,
    },
  }));
  process.stderr.write(`\n🛑 bash-guard: ${p.label} — ${p.reason}\n`);
  process.exit(2);
}

let input;
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
if (!input) process.exit(0);

const tool = input.tool_name || "";
const toolInput = input.tool_input || {};

// Skill: los 3 gates de deploy costaban ~100 ms en CADA skill invocada sólo para
// salir por la puerta de atrás. Acá el filtro es local y los scripts se spawnean
// únicamente cuando la skill es deploy de verdad.
if (tool === "Skill") {
  const skill = String(toolInput?.skill || "").toLowerCase();
  if (!["deploy", "vercel-plugin:deploy"].includes(skill)) process.exit(0);

  const crudo = JSON.stringify(input);
  for (const gate of ["pre-deploy-enterprise-gate.mjs", "pre-deploy-db-snapshot.mjs", "pre-deploy-slo-gate.mjs"]) {
    const r = execFileSync_seguro(join(PROJECT_DIR, ".claude", "hooks", gate), crudo);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status === 2) {
      if (r.stdout) process.stdout.write(r.stdout);
      process.exit(2);
    }
  }
  process.exit(0);
}

// Bash: denylist ANTES del mem-guard (un `rm -rf` no debe pasar por estar la RAM sana)
if (tool === "Bash") {
  const p = bashGuard(toolInput);
  if (p) bloquearBash(p);
}

if (["Edit", "Write", "MultiEdit"].includes(tool)) {
  const dz = dangerZone(toolInput);
  if (dz) {
    process.stderr.write(dz.mensaje);
    if (dz.bloquear) {
      process.stdout.write(dz.respuesta);
      process.exit(2);
    }
  }
}

const motivo = memGuard(tool, toolInput);
if (motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

process.exit(0);

/* _revertir: en .claude/settings.json > PreToolUse, cambiar el matcher único
   "Bash|Edit|Write|MultiEdit" que apunta acá por los 3 matchers originales
   (pre-tool-mem-guard.mjs, danger-zone.mjs, pre-bash-guard.mjs), que siguen
   en este mismo directorio sin tocar. */
