#!/usr/bin/env node
/**
 * pre-bash-guard.mjs — PreToolUse hook (tool=Bash). VERSIÓN DENYLIST POTENTE.
 *
 * sudo PERMITIDO por default; solo se bloquean operaciones catastróficas/
 * irreversibles (SUDO_DENYLIST). El resto de defensas destructivas no-sudo
 * (rm -rf, DROP SQL, git force, curl|sh) siguen activas.
 *
 * Aplicado por Brandon 2026-06-29 (autonomía sudo elevada, fuera de auto-mode).
 * Revertir: cp pre-bash-guard.mjs.allowlist.bak pre-bash-guard.mjs
 *
 * Exit 0 = allow · Exit 2 = block. Ref: https://code.claude.com/docs/en/hooks
 */
import { readFileSync } from "node:fs";

// Opt-out total para sesiones de setup.  Uso: BSM_ALLOW_INSTALL=1 claude
if (process.env.BSM_ALLOW_INSTALL === "1") process.exit(0);

/**
 * SUDO_DENYLIST — lo único que se bloquea con sudo. El `[^|;&]*` acota el match
 * al mismo segmento de comando.
 */
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
  { re: /\bsudo\b[^|;&]*\b(userdel|deluser|usermod|passwd)\b/, label: "gestion de usuarios" },
  { re: /\bsudo\b[^|;&]*\b(shutdown|reboot|halt|poweroff)\b/, label: "apagar/reiniciar" },
  { re: /\bsudo\b[^|;&]*\bvisudo\b/, label: "visudo (riesgo lockout)" },
  { re: /\bsudo\b[^|;&]*(?:tee|>)\s*\/etc\/(?:passwd|shadow|sudoers|fstab)/, label: "overwrite archivo critico" },
];

/** Patrones destructivos NO-sudo (siempre activos). */
const BLOCK_PATTERNS = [
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, label: "rm -rf (recursivo)", severity: "critical", reason: "Borrado recursivo peligroso. Usá `git rm` o `rimraf` si es node_modules." },
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b.*\/[^\/]*$/, label: "rm -rf path", severity: "critical", reason: "rm recursivo sobre un path. Validá dos veces." },
  { pattern: /\brm\b.*(--no-preserve-root|\s\/(?:\s|$)|\s~(?:\s|$|\/))/, label: "rm sobre / o ~", severity: "critical", reason: "rm apuntando a raíz o home. Bloqueado siempre." },
  { pattern: /\bsudo\b/, label: "sudo", severity: "critical", reason: "(no usado en modo denylist — sudo se maneja por SUDO_DENYLIST)" },
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

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function block(pattern) {
  const response = {
    decision: "block",
    reason: `Comando destructivo bloqueado: ${pattern.label}. ${pattern.reason}`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `🛑 BASH GUARD · severity=${pattern.severity}\n` +
        `Patrón bloqueado: ${pattern.label}\n` +
        `Razón: ${pattern.reason}\n\n` +
        `Si realmente necesitás ejecutar este comando, hacelo desde tu terminal ` +
        `fuera de Claude Code con full awareness del riesgo.`,
    },
  };
  process.stdout.write(JSON.stringify(response));
  process.stderr.write(`\n🛑 bash-guard: ${pattern.label} — ${pattern.reason}\n`);
  process.exit(2);
}

// ── Main ──────────────────────────────────────────────────────────────────
const input = readInput();
if (!input || input.tool_name !== "Bash") process.exit(0);

const command = (input.tool_input?.command ?? "").toString();
if (!command) process.exit(0);

// Sudo en modo DENYLIST: permitido salvo operaciones catastróficas/irreversibles.
if (/\bsudo\b/.test(command)) {
  for (const d of SUDO_DENYLIST) {
    if (d.re.test(command)) {
      block({
        label: d.label,
        severity: "critical",
        reason:
          "Operación catastrófica/irreversible con sudo. Bloqueada incluso con " +
          "autonomía elevada — corréla a mano si de verdad es intencional.",
      });
    }
  }
}

for (const p of BLOCK_PATTERNS) {
  if (p.label === "sudo") continue; // modo denylist: sudo se maneja arriba
  if (p.pattern.test(command)) block(p);
}

process.exit(0);
