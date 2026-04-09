#!/usr/bin/env node

// danger-zone.mjs — PreToolUse hook for Claude Code (Official Spec)
// Blocks Edit/Write/MultiEdit on critical files.
// Exit 0 = allow | Exit 2 = block (stderr shown to user) | Other = non-blocking error

import { readFileSync } from 'node:fs';

const DANGER_ZONES = [
  { pattern: /CheckoutModal\.tsx/, skill: 'checkout-flow', label: 'CheckoutModal (pagos, cupones, reservas) + todo components/checkout/**' },
  { pattern: /role-permissions\.ts/, skill: 'security-auth', label: 'role-permissions.ts (RBAC 26 recursos × 6 roles)' },
  { pattern: /lib\/db\/orders\.db\.ts/, skill: 'database-migrations', label: 'orders.db.ts (state machine, idempotency)' },
  { pattern: /schema\.prisma/, skill: 'prisma-schema', label: 'schema.prisma (120 modelos, requiere DIRECT_URL)' },
  { pattern: /cart-context\.tsx/, skill: 'state-management', label: 'cart-context.tsx (BroadcastChannel + localStorage multi-tab)' },
  { pattern: /api\/batches/, skill: 'fefo-inventory', label: 'API batches (FEFO, expiryDate vs expiresAt)' },
  { pattern: /proxy\.ts/, skill: 'security-auth', label: 'proxy.ts (auth + CSP + tenant + rate limit — 398 líneas)' },
  { pattern: /CartSidebar\.tsx/, skill: 'state-management', label: 'CartSidebar.tsx (BroadcastChannel multi-tab sync)' },
];

try {
  const input = readFileSync(process.stdin.fd, 'utf8');
  const { tool_name, tool_input } = JSON.parse(input);

  if (!['Edit', 'Write', 'MultiEdit'].includes(tool_name)) {
    process.exit(0);
  }

  const filePath = tool_input?.file_path || '';

  for (const zone of DANGER_ZONES) {
    if (zone.pattern.test(filePath)) {
      // Structured JSON response per official spec
      const skillPath = `.github/instructions/${zone.skill}.instructions.md`;
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
      process.stdout.write(response);
      process.stderr.write(`⚠️ ZONA DE PELIGRO: ${zone.label} — Lee skill "${zone.skill}" primero (${skillPath}).\n`);
      process.exit(2); // Exit 2 = blocking error per official spec
    }
  }

  process.exit(0);
} catch {
  process.exit(0);
}
