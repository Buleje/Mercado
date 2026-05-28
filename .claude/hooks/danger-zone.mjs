#!/usr/bin/env node

// danger-zone.mjs — PreToolUse hook for Claude Code (Official Spec)
// Blocks Edit/Write/MultiEdit on critical files.
// Exit 0 = allow | Exit 2 = block (stderr shown to user) | Other = non-blocking error

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DANGER_ZONES = [
  { pattern: /CheckoutModal\.tsx/, skill: 'checkout-flow', label: 'CheckoutModal (pagos, cupones, reservas) + todo components/checkout/**', agent: 'checkout-squad', reason: 'Zona critica de pagos — usar /checkout-squad para coordinacion segura' },
  { pattern: /components\/checkout\//, skill: 'checkout-flow', label: 'components/checkout/** (flujo de pago completo)', agent: 'checkout-squad', reason: 'Sub-componentes del checkout — requieren checkout-squad' },
  { pattern: /role-permissions\.ts/, skill: 'security-auth', label: 'role-permissions.ts (RBAC 26 recursos × 6 roles)', agent: 'security-squad', reason: 'Cambiar permisos puede bloquear modulos enteros — usar security-squad' },
  { pattern: /lib\/db\/orders\.db\.ts/, skill: 'database-migrations', label: 'orders.db.ts (state machine, idempotency)', agent: 'database-engineer', reason: 'State machine de ordenes — requiere database-engineer + migration-planner' },
  { pattern: /schema\.prisma/, skill: 'prisma-schema', label: 'schema.prisma (131 modelos, requiere DIRECT_URL)', agent: 'database-engineer + migration-planner', reason: 'Cambio de schema requiere plan de migracion — usar /audit-first primero' },
  { pattern: /cart-context\.tsx/, skill: 'state-management', label: 'cart-context.tsx (BroadcastChannel + localStorage multi-tab)', agent: 'frontend-engineer', reason: 'Estado compartido multi-tab — riesgo de race conditions' },
  { pattern: /api\/batches/, skill: 'fefo-inventory', label: 'API batches (FEFO, expiryDate vs expiresAt)', agent: 'backend-platform-engineer', reason: 'Logica FEFO critica para inventario' },
  { pattern: /proxy\.ts/, skill: 'security-auth', label: 'proxy.ts (auth + CSP + tenant + rate limit — 398 lineas)', agent: 'security-squad', reason: 'Middleware central de seguridad — cualquier error expone toda la app' },
  { pattern: /CartSidebar\.tsx/, skill: 'state-management', label: 'CartSidebar.tsx (BroadcastChannel multi-tab sync)', agent: 'frontend-engineer', reason: 'Sincronizacion de carrito multi-tab' },
];

try {
  const input = readFileSync(process.stdin.fd, 'utf8');
  const { tool_name, tool_input } = JSON.parse(input);

  if (!['Edit', 'Write', 'MultiEdit'].includes(tool_name)) {
    process.exit(0);
  }

  const filePath = tool_input?.file_path || '';

  // Bypass explícito one-shot via archivo firmado.
  // El operador (que YA leyó el skill) crea:
  //   /tmp/bsm-dz-bypass-<skill-name>
  // con el motivo dentro. El hook lo consume y lo borra inmediatamente.
  // Próxima edición vuelve a estar bloqueada hasta que firme un bypass nuevo.
  function readBypass(skill) {
    try {
      const lockPath = `/tmp/bsm-dz-bypass-${skill}`;
      if (!existsSync(lockPath)) return null;
      const reason = readFileSync(lockPath, "utf8").trim();
      // One-shot: consumir borrando el archivo
      try { unlinkSync(lockPath); } catch {}
      return reason || "no reason given";
    } catch {
      return null;
    }
  }

  for (const zone of DANGER_ZONES) {
    if (zone.pattern.test(filePath)) {
      // Bypass one-shot firmado por archivo
      const bypassReason = readBypass(zone.skill);
      if (bypassReason) {
        process.stderr.write(
          `🟡 DZ BYPASS · ${zone.label}\n` +
          `   Skill firmado: ${zone.skill}\n` +
          `   Razón: ${bypassReason}\n` +
          `   (lockfile consumido — próxima edición requiere nueva firma)\n`
        );
        process.exit(0);
      }
      // Structured JSON response per official spec
      const skillPath = `.github/instructions/${zone.skill}.instructions.md`;

      // Sanity check: si el skill declarado no existe, advertimos explícitamente
      // en el mensaje para que el dev sepa que debe crearlo ANTES de proceder.
      // No cambia el bloqueo — sigue negando la edición, pero agrega contexto.
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const repoRoot = join(__dirname, '..', '..');
      const skillAbs = join(repoRoot, skillPath);
      const skillMissing = !existsSync(skillAbs);
      const skillMissingNote = skillMissing
        ? `\n   ⚠️  El archivo del skill NO existe — créalo en ${skillPath} antes de editar.`
        : '';
      const response = JSON.stringify({
        decision: 'block',
        reason: `ZONA DE PELIGRO: ${zone.label}. Lee el skill "${zone.skill}" primero.`,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `⚠️ ZONA DE PELIGRO: ${zone.label}\n` +
            `Lee el skill "${zone.skill}" antes de modificar este archivo.\n` +
            `Skill path: ${skillPath}\n` +
            `Índice maestro: docs/instructions-index.md`
        }
      });
      // MODO WARN (2026-05-28): No bloqueante. Solo advierte por stderr.
      // Para volver a bloqueo duro, restaurar exit(2) + stdout.write(response).
      // Opt-out: BSM_DZ_BLOCK=1 → modo blocking original.
      if (process.env.BSM_DZ_BLOCK === "1") {
        process.stdout.write(response);
        process.stderr.write(
          `⚠️ ZONA DE PELIGRO (BLOCK): ${zone.label}\n` +
          `   📖 Skill: "${zone.skill}" (${skillPath})\n` +
          `   🤖 Agente: ${zone.agent}\n` +
          `   💡 ${zone.reason}${skillMissingNote}\n`
        );
        process.exit(2);
      }
      process.stderr.write(
        `🟡 DANGER ZONE (warn-only): ${zone.label}\n` +
        `   📖 Skill recomendado: "${zone.skill}" (${skillPath})\n` +
        `   🤖 Agente: ${zone.agent}\n` +
        `   💡 ${zone.reason}${skillMissingNote}\n` +
        `   (Tip: BSM_DZ_BLOCK=1 para volver a bloqueo duro)\n`
      );
      process.exit(0);
    }
  }

  process.exit(0);
} catch {
  process.exit(0);
}
