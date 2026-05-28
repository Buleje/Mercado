#!/usr/bin/env node
/**
 * hex-code-guard — warn when Edit/Write introduces new hex colors in JSX.
 *
 * Runs as a PostToolUse hook after Edit/Write on .tsx/.ts files under
 * components/ and app/. Counts the delta of hex-in-JSX patterns
 * (border-[#, bg-[#, text-[#, ring-[#, shadow-[#) before vs after.
 *
 * Severity: WARNING (non-blocking) — informs the session that a new
 * hex hardcode was introduced so sub-project #1 (Design System) can
 * track it. Blocking would be too strict during legit refactors.
 *
 * Reason to exist: during sub-project #1 we want to REDUCE hex codes
 * from 1898 toward zero. If code keeps adding new ones while old ones
 * are being removed, net progress is invisible. This guard makes the
 * introduction visible in the tool output.
 */
import fs from "node:fs";

const HEX_JSX_PATTERN = /\b(?:border|bg|text|ring|shadow|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}(?:\/\d+)?\]/g;

function countHexInContent(content) {
  if (!content) return 0;
  const matches = content.match(HEX_JSX_PATTERN);
  return matches ? matches.length : 0;
}

// Read hook payload from stdin (Claude Code convention).
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw);
    const toolName = payload?.tool_name ?? payload?.tool ?? "";

    // Only act on Edit/Write of .tsx or .ts inside components/ or app/.
    if (!["Edit", "Write"].includes(toolName)) return process.exit(0);

    const filePath = payload?.tool_input?.file_path ?? "";
    const isRelevant =
      (filePath.includes("/components/") || filePath.includes("/app/")) &&
      /\.(tsx|ts)$/.test(filePath);
    if (!isRelevant) return process.exit(0);

    // Post-tool: file already modified. Count current hex occurrences.
    if (!fs.existsSync(filePath)) return process.exit(0);
    const afterContent = fs.readFileSync(filePath, "utf-8");
    const afterCount = countHexInContent(afterContent);

    // Best-effort: compare against the old_string (Edit) or absence (Write).
    let beforeCount = 0;
    if (toolName === "Edit") {
      const oldStr = payload?.tool_input?.old_string ?? "";
      const newStr = payload?.tool_input?.new_string ?? "";
      beforeCount = countHexInContent(afterContent.replace(newStr, oldStr));
    }

    const delta = afterCount - beforeCount;
    if (delta > 0) {
      process.stderr.write(
        `⚠️ hex-code-guard: +${delta} hardcoded hex color(s) added in ${filePath.split(/[/\\]/).pop()}.\n` +
          `   Sub-project #1 (Design System) aims to reduce these to zero.\n` +
          `   Consider a Tailwind token (border-primary, bg-primary/10, etc.) or a CSS var.\n`,
      );
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
