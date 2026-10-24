#!/usr/bin/env node
/**
 * subagent-start-context.mjs — SubagentStart (todos los agentes, ~30 ms).
 *
 * Inyecta en CADA subagente el contexto que hoy solo llevaban los 8 agent defs:
 * el 70 % de los despachos reales (telemetría 09-03 → 09-14: aserrio-*, rrhh-*,
 * a11y-lote-*, revisor-*) son `general-purpose` con nombre y NO leen ningún def,
 * así que arrancaban sin saber cómo pide Brandon, qué tenant es el real ni que
 * «listo» exige evidencia. Un subagente no hereda la auto-memoria del hilo
 * principal: por eso van rutas absolutas, no nombres.
 *
 * Salida: JSON con hookSpecificOutput.additionalContext (el CLI lo mete en el
 * prefijo del prompt del subagente; changelog 2.1.265). Exit 0 siempre.
 */
import { readFileSync } from "node:fs";

let event = {};
try {
  event = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  /* sin payload igual inyectamos */
}

const tipo = (event && typeof event === "object" && event.agent_type) || "";
// Explore/Plan: solo lectura, saltan CLAUDE.md a propósito. fork: ya hereda TODA la
// conversación (duplicarlo solo cuesta tokens). Internos del CLI: no son trabajo del repo.
if (/^(Explore|Plan|fork|statusline-setup|claude-code-guide)$/.test(tipo)) process.exit(0);

const MEM = "/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado/memory";

// Buscadores/refutadores de Workflow: tarea angosta y salida por schema. Solo lo que evita
// un falso hallazgo (tenant real, reglas duras); nada de leer perfil ni sacar screenshots.
if (tipo === "workflow-subagent") {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: [
          "## Contexto Buleje (hook SubagentStart, versión Workflow)",
          "- Tenant real `inversiones-agroforestales-blas-sociedad-anonima` (solo lectura); QA = `main` (bodega) o `inversiones-agroforestales-blas-sociedad-op-qa-ui` (forestal: `main` no tiene ese módulo).",
          "- Lo independiente va en UN mensaje (varias llamadas juntas): cada tanda es una espera del modelo. Salidas recortadas; `grep -n` antes de `Read` con rango.",
          "- Reglas del repo: `lib/db/*.db.ts` en vez de `prisma.*`; `tenantId` 1er parámetro sin fallback `\"main\"`; Zod `safeParse`; `requireAdmin(req, roles[])`; sin hex en UI; totales en backend.",
          "- Todo hallazgo con evidencia directa (comando + salida, archivo:línea). Tu formato de salida es el schema de la tarea.",
        ].join("\n"),
      },
    }),
  );
  process.exit(0);
}
const contexto = [
  "## Contexto Buleje para subagentes (hook SubagentStart, 2026-10-02)",
  "- Pide Brandon: dueño-operador que prueba en el navegador; 3-6 pedidos por mensaje (hacé todos); «aplicarlo en general» = buscar las pantallas hermanas. Con esto alcanza: no leas su perfil.",
  "- Datos reales = tenant `inversiones-agroforestales-blas-sociedad-anonima` (solo lectura). QA (`qaadmin` / `Qa-admin-1234`): `main` para la bodega; `inversiones-agroforestales-blas-sociedad-op-qa-ui` para lo forestal.",
  "- Reglas duras: `lib/db/*.db.ts` en vez de `prisma.*`; `tenantId` 1er parámetro sin fallback `\"main\"`; Zod `safeParse`; `requireAdmin(req, roles[])`; sin hex en UI; totales en backend; sin `@ts-ignore`/`--no-verify`. Checkout principal, nunca worktree.",
  "- **Economía** (medido 02-10 en 592 subagentes: 136 turnos de promedio y cada turno relee TODO el contexto — menos turnos y menos bytes es la palanca):",
  "  · Lo independiente en UNA tanda: greps, lecturas, gates de áreas distintas.",
  "  · `grep -n` primero, después `Read` con offset/limit de lo que vas a tocar. No releas lo que acabás de editar.",
  "  · `npm run typecheck` UNA vez al cerrar el lote de edits, no tras cada uno. `vitest run <archivo>` solo si tocaste lógica con test. **No corras `npm run lint`** (falló 2 % de 1.079 veces; lint-staged lo corre). Si vas a commitear, el commit ES el gate (tsc + vitest related + eslint + tokens + anidado): no los corras antes.",
  "  · UI: `node scripts/qa-capturas.mjs --tenant <slug> --ruta \"/admin?tab=x\" --pasos '[…]'` en UNA llamada; leé 1 imagen (claro 1280) y las otras solo si tocaste color/layout o el reporte marca algo. El MCP de Playwright, solo para explorar una pantalla nueva.",
  "  · Salidas largas recortadas (`| tail -20`, `| grep -E 'error|FAIL'`); nunca volcar archivos ni logs enteros.",
  "- Leer la base: script dentro del repo (`scripts/tmp-*.mjs`) con `node -r dotenv/config <script> dotenv_config_path=.env.local` y `ssl: { rejectUnauthorized: false }`. **Nunca `SET SESSION …`**: el `DATABASE_URL` es el pooler de PRODUCCIÓN y el ajuste se pega en conexiones ajenas. Solo lectura = `BEGIN READ ONLY; …; COMMIT`.",
  "- «Listo» solo con evidencia pegada (comando + salida) por el camino del usuario (navegador/curl). Si no pudiste verificar, decilo.",
  "- Reporte final en español, ≤150 palabras + tabla (archivo:línea · evidencia · qué queda); lo que un futuro agente no sabría → tu MEMORY.md, o «Para memoria» en el reporte. Si algo te hizo perder turnos (un gate lento, una lectura que sobró, un script que faltaba), cerrá con una línea «Para acelerar: …». Si la tarea trae su propio formato de salida, ese manda.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: contexto },
  }),
);
