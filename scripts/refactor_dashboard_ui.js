const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../components/admin/DashboardTab.tsx');
const destPath = path.join(__dirname, '../components/admin/dashboard/DashboardUI.tsx');
const dashboardDir = path.dirname(destPath);

if (!fs.existsSync(dashboardDir)) {
  fs.mkdirSync(dashboardDir, { recursive: true });
}

let code = fs.readFileSync(srcPath, 'utf8');

const marker = "// ── Sub-components ───────────────────────────────────────────────────────────";
const splitIdx = code.indexOf(marker);

if (splitIdx === -1) {
  console.log("Marker not found, meaning it might have been extracted already!");
  process.exit(0);
}

const mainCode = code.substring(0, splitIdx).trim() + "\n";
let subCode = code.substring(splitIdx + marker.length).trim();

// Add export keyword to functions
const functionsToExport = [
  "BentoGrid", "Sparkline", "useCountUp", "Kpi", "Card", "DBadge", "FlowRow", "Empty", "ElapsedTimer", "Donut"
];

for (const fn of functionsToExport) {
  // Using split/join instead of RegExp to avoid escaping hell
  subCode = subCode.split("function " + fn + "(").join("export function " + fn + "(");
}

const uiCode = `"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Helpers
function fmt(n: number) { return \`S/\${n.toFixed(2)}\`; }

` + subCode + `
`;

fs.writeFileSync(destPath, uiCode);

// Inject imports at the top of mainCode
const importStatement = `import { BentoGrid, Sparkline, Kpi, Card, DBadge, FlowRow, Empty, ElapsedTimer, Donut } from "./dashboard/DashboardUI";\n`;

let lines = mainCode.split('\n');
let insertIdx = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("import { useTheme }")) {
    insertIdx = i + 1;
    break;
  }
}
lines.splice(insertIdx, 0, importStatement);

fs.writeFileSync(srcPath, lines.join('\n'));
console.log("Extraction successful!");
