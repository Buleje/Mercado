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
          "- Tenant real `inversiones-agroforestales-blas-sociedad-anonima` (solo lectura); `main` = QA.",
          "- Reglas del repo: `lib/db/*.db.ts` en vez de `prisma.*`; `tenantId` 1er parámetro sin fallback `\"main\"`; Zod `safeParse`; `requireAdmin(req, roles[])`; sin hex en UI; totales en backend.",
          "- Todo hallazgo con evidencia directa (comando + salida, archivo:línea). Tu formato de salida es el schema de la tarea.",
        ].join("\n"),
      },
    }),
  );
  process.exit(0);
}
const contexto = [
  "## Contexto Buleje para subagentes (hook SubagentStart, 2026-09-14)",
  `- Quién pide: leé \`${MEM}/perfil-brandon-como-trabaja.md\` (dueño-operador, prueba todo en el navegador, 3-6 pedidos por mensaje, «aplicarlo en general» = buscar las pantallas hermanas). Propuestas: \`${MEM}/propuestas-con-lentes.md\` (sin medición es una opinión).`,
  "- Datos reales = tenant `inversiones-agroforestales-blas-sociedad-anonima`; `main` es el tenant de QA (`qaadmin` / `Qa-admin-1234`). Leer del real, escribir solo en QA.",
  "- Editá sobre el checkout principal, nunca en worktree (en ramas largas branchea de una base vieja y se pierde lógica).",
  "- Reglas duras: `lib/db/*.db.ts` en vez de `prisma.*`; `tenantId` 1er parámetro sin fallback `\"main\"`; Zod `safeParse`; `requireAdmin(req, roles[])`; sin hex en UI (tokens del DS); totales en backend; sin `@ts-ignore`/`--no-verify`.",
  "- Gates: `npm run typecheck:fast` (TS 7, pre-check, ~7 GB: uno por vez) → `npx tsc --noEmit` (5.9, decide); `npm run lint:fast` → `npm run lint`; tests del área con `npx vitest run <archivo>`. UI = screenshot light + dark, viewport 1280 y 400, consola sin errores nuestros.",
  "- «Listo» solo con evidencia pegada (comando + salida) por el camino del usuario (navegador/curl), no por un script propio. Si no pudiste verificar, decilo.",
  "- Reporte final en español, ≤150 palabras + tabla (archivo:línea · evidencia · qué queda). Lo que aprendiste que un futuro agente no sabría → tu MEMORY.md si tenés memoria; si no, ponelo en el reporte bajo «Para memoria».",
  "- Si la tarea que recibiste define su propio formato de salida (schema JSON de un Workflow, «respondé en 3 líneas», etc.), ESE formato manda sobre el reporte de arriba.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: contexto },
  }),
);
