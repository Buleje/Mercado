#!/usr/bin/env node
/**
 * stop-skill-suggester.mjs — Stop hook (async)
 *
 * Replica el killer feature de Hermes Agent: auto-skill creation.
 *
 * Cuando una sesión termina:
 *   1. Lee .claude/learning/patterns.json (auto-learn.mjs lo llena)
 *   2. Filtra patterns con occurrences >= 5 y artifactGenerated == null
 *   3. Escribe propuestas en .claude/improvement-radar.md sección "Skills sugeridos"
 *   4. Marca artifactGenerated = "queued" para no duplicar
 *
 * El SessionStart hook ya muestra improvement-radar → próxima sesión los veo.
 *
 * NO crea skills automáticamente — solo PROPONE. Brandon decide si crear.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PATTERNS_FILE = resolve(projectRoot, ".claude/learning/patterns.json");
const RADAR_FILE = resolve(projectRoot, ".claude/improvement-radar.md");
const MIN_OCCURRENCES = 5;
const MAX_SUGGESTIONS_PER_RUN = 3;

function safeLog(msg) {
  try {
    appendFileSync(
      resolve(projectRoot, ".claude/learning/skill-suggester.log"),
      `${new Date().toISOString()} ${msg}\n`,
    );
  } catch { /* no-op */ }
}

try {
  if (!existsSync(PATTERNS_FILE)) {
    process.exit(0);
  }

  const data = JSON.parse(readFileSync(PATTERNS_FILE, "utf8"));
  const patterns = Array.isArray(data.patterns) ? data.patterns : [];

  const candidates = patterns.filter(
    (p) =>
      typeof p === "object" &&
      p.occurrences >= MIN_OCCURRENCES &&
      p.artifactGenerated == null &&
      p.status === "active" &&
      p.suggestedSkill,
  );

  if (candidates.length === 0) {
    process.exit(0);
  }

  const top = candidates.slice(0, MAX_SUGGESTIONS_PER_RUN);
  const today = new Date().toISOString().slice(0, 10);

  const radarContent = existsSync(RADAR_FILE)
    ? readFileSync(RADAR_FILE, "utf8")
    : "# Improvement Radar — Buleje\n\n";

  const sectionMarker = "## Skills sugeridos por compound-learning";
  let block = `\n---\n\n${sectionMarker} (auto, ${today})\n\n`;
  block += `Detectados ${candidates.length} patrones con ≥${MIN_OCCURRENCES} co-edits sin skill creado.\n`;
  block += `Mostrando top ${top.length}. Para crear skill: usá \`/luis\` o decí "crea skill para X".\n\n`;

  for (const p of top) {
    block += `### [pending] ${p.id}\n`;
    block += `- **Tipo:** \`${p.type}\` (${p.occurrences} occurrences)\n`;
    block += `- **Files:** ${p.files.map((f) => `\`${f}\``).join(", ")}\n`;
    block += `- **Sugerencia:** ${p.suggestedSkill}\n`;
    block += `- **Last seen:** ${p.lastSeen}\n\n`;
  }

  // Solo agregamos sección si NO existe ya una con la misma fecha
  const dateMarker = `${sectionMarker} (auto, ${today})`;
  if (!radarContent.includes(dateMarker)) {
    writeFileSync(RADAR_FILE, radarContent + block);
    safeLog(`appended ${top.length} suggestions to radar`);
  } else {
    safeLog(`skip: section for ${today} already exists`);
  }

  // Mark as queued
  for (const p of top) {
    p.artifactGenerated = "queued";
  }
  writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
  safeLog(`marked ${top.length} patterns as queued`);

  process.exit(0);
} catch (err) {
  safeLog(`ERROR: ${err.message}`);
  process.exit(0);
}
