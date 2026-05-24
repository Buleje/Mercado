#!/usr/bin/env node
/**
 * pre-bash-guard.mjs — PreToolUse hook para tool=Bash.
 *
 * Segunda línea de defensa contra comandos destructivos.
 * La primera línea es el deny[] de .claude/settings.json, pero el deny[]
 * solo matchea patterns literales; este hook hace match semántico:
 *  - rm -rf con cualquier variación (rm -fr, rm -r -f, etc)
 *  - SQL DROP / TRUNCATE / DELETE sin WHERE
 *  - git push --force a branches protegidas
 *  - curl|bash pipes
 *  - cualquier sudo
 *
 * Exit 0 = allow · Exit 2 = block (stderr al user + decision JSON)
 *
 * Referencia: https://code.claude.com/docs/en/hooks
 */
import { readFileSync } from "node:fs";

/**
 * Lista de patrones regex que bloquean comandos peligrosos.
 * Cada entrada: { pattern, label, severity, reason }
 */
const BLOCK_PATTERNS = [
  // ── Filesystem destructivo ──────────────────────────────────────────
  {
    pattern: /\brm\s+(-[rRfF]+|--recursive|--force)\s+(?!-)/,
    label: "rm -rf",
    severity: "critical",
    reason: "Borrado recursivo peligroso. Usá `git rm` o `rimraf` si es para node_modules."
  },
  {
    pattern: /\brm\s+(-[rRfF]+\s*){1,}.*\/[^\/]*$/,
    label: "rm -rf path absoluto",
    severity: "critical",
    reason: "rm con path absoluto. Validá dos veces antes."
  },
  {
    pattern: /\bsudo\b/,
    label: "sudo",
    severity: "critical",
    reason: "Escalación de privilegios no aceptada en este proyecto."
  },

  // ── SQL destructivo ─────────────────────────────────────────────────
  {
    pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i,
    label: "DROP SQL",
    severity: "critical",
    reason: "DROP de objeto SQL. Usá migration Prisma + DIRECT_URL documentado."
  },
  {
    pattern: /\bTRUNCATE\s+TABLE\b/i,
    label: "TRUNCATE TABLE",
    severity: "critical",
    reason: "Truncate masivo. Usá soft-delete o migration formal."
  },
  {
    pattern: /\bDELETE\s+FROM\s+[A-Za-z_][A-Za-z0-9_]*\s*(?!WHERE|LIMIT)/i,
    label: "DELETE sin WHERE",
    severity: "critical",
    reason: "DELETE sin WHERE = wipe de la tabla. Agregá WHERE explícito."
  },

  // ── Git destructivo ─────────────────────────────────────────────────
  {
    pattern: /\bgit\s+push\s+(?:-[a-z]*f[a-z]*|--force(?!-with-lease))\s+.*(?:master|main)\b/,
    label: "git push --force a master/main",
    severity: "critical",
    reason: "Force-push a rama protegida. Usá --force-with-lease sobre branch personal."
  },
  {
    pattern: /\bgit\s+reset\s+--hard\s+origin\/(?:master|main)/,
    label: "git reset --hard origin/master",
    severity: "high",
    reason: "Descarta todos los commits locales sin review. Stash o branch primero."
  },
  {
    pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*[dx]/,
    label: "git clean -fdx",
    severity: "high",
    reason: "Borra untracked + ignored. Usá con flags menos agresivos o respaldo antes."
  },
  {
    pattern: /\bgit\s+checkout\s+\.\s*$/,
    label: "git checkout .",
    severity: "medium",
    reason: "Descarta TODOS los cambios del working copy. Usá paths específicos."
  },
  {
    pattern: /\bgit\s+restore\s+\.\s*$/,
    label: "git restore .",
    severity: "medium",
    reason: "Descarta TODOS los cambios del working copy. Usá paths específicos."
  },

  // ── Pipes peligrosos ────────────────────────────────────────────────
  {
    pattern: /\bcurl\s+.*\|\s*(?:sh|bash|zsh|fish|python|node)\b/,
    label: "curl | sh pipe",
    severity: "critical",
    reason: "Ejecutar script remoto sin revisar es riesgo de supply chain. Descargá primero, leé, después ejecutá."
  },
  {
    pattern: /\bwget\s+.*\|\s*(?:sh|bash|zsh|fish|python|node)\b/,
    label: "wget | sh pipe",
    severity: "critical",
    reason: "Idem curl — descargá primero, leé, después ejecutá."
  },

  // ── Docker/Kubernetes destructivo ───────────────────────────────────
  {
    pattern: /\bdocker\s+(?:system|volume|image|container)\s+prune\s+(?:-[a-z]*f|--force)/,
    label: "docker prune --force",
    severity: "medium",
    reason: "Borrado masivo de recursos Docker. Usá con flags más restringidos."
  },
  {
    pattern: /\bkubectl\s+delete\s+(?:all|pods?|deployments?)\s+--all\b/,
    label: "kubectl delete --all",
    severity: "critical",
    reason: "Borrado masivo de recursos Kubernetes. Usá namespaces o labels selectores."
  },

  // ── npm/pnpm destructivo ────────────────────────────────────────────
  {
    pattern: /\b(?:npm|pnpm|yarn)\s+(?:uninstall|remove)\s+(?:next|react|prisma|typescript)(?:\s|$)/,
    label: "desinstalar dep core",
    severity: "high",
    reason: "Desinstalar Next/React/Prisma/TypeScript rompe el build. Confirmá."
  }
];

/**
 * Lee el input stdin del hook (formato JSON de Claude Code).
 * Si falla el parse, dejamos pasar (no bloqueamos por bug del hook).
 */
function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Emite respuesta de bloqueo en formato Claude Code hooks JSON.
 */
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
        `Razón: ${pattern.reason}\n` +
        `\n` +
        `Si realmente necesitás ejecutar este comando, hacelo desde tu terminal ` +
        `fuera de Claude Code con full awareness del riesgo.`
    }
  };
  process.stdout.write(JSON.stringify(response));
  process.stderr.write(
    `\n🛑 bash-guard: ${pattern.label} — ${pattern.reason}\n`
  );
  process.exit(2);
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();
if (!input || input.tool_name !== "Bash") {
  process.exit(0);
}

const command = (input.tool_input?.command ?? "").toString();
if (!command) {
  process.exit(0);
}

for (const p of BLOCK_PATTERNS) {
  if (p.pattern.test(command)) {
    block(p);
  }
}

process.exit(0);
