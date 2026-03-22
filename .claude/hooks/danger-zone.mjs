#!/usr/bin/env node

// danger-zone.mjs — PreToolUse hook for Claude Code
// Blocks Edit/Write/MultiEdit on critical files without reading the relevant skill first.
// Exit 0 = allow, Exit 1 = block (message shown to Claude via stderr)

import { readFileSync } from 'node:fs';

const DANGER_ZONES = [
  { pattern: /CheckoutModal\.tsx/, skill: 'checkout-flow', label: 'CheckoutModal (119 KB, pagos y cupones)' },
  { pattern: /role-permissions\.ts/, skill: 'security-auth', label: 'role-permissions.ts (RBAC)' },
  { pattern: /lib\/db\/orders\.db\.ts/, skill: 'database-migrations', label: 'orders.db.ts (state machine, idempotency)' },
  { pattern: /schema\.prisma/, skill: 'prisma-schema', label: 'schema.prisma (66 modelos, requiere DIRECT_URL)' },
  { pattern: /cart-context\.tsx/, skill: 'state-management', label: 'cart-context.tsx (BroadcastChannel + localStorage)' },
  { pattern: /api\/batches/, skill: 'fefo-inventory', label: 'API batches (FEFO, expiryDate vs expiresAt)' },
  { pattern: /proxy\.ts/, skill: 'security-auth', label: 'proxy.ts (auth middleware)' },
];

try {
  const input = readFileSync(process.stdin.fd, 'utf8');
  const { tool_name, tool_input } = JSON.parse(input);

  // Only check file-editing tools
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool_name)) {
    process.exit(0);
  }

  const filePath = tool_input?.file_path || '';

  for (const zone of DANGER_ZONES) {
    if (zone.pattern.test(filePath)) {
      process.stderr.write(
        `⚠️ ZONA DE PELIGRO: ${zone.label}\n` +
        `Lee el skill "${zone.skill}" antes de modificar este archivo.\n` +
        `Skill path: .github/skills/${zone.skill}.instructions.md\n`
      );
      process.exit(1);
    }
  }

  process.exit(0);
} catch {
  // If anything fails, don't block the operation
  process.exit(0);
}
