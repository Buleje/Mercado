// FIX 2026-05-06: el sweep CSRF insertó import roto en medio de imports multi-línea.
// Patrón a corregir:
//   import {
//   import { csrfHeaders } from "@/lib/csrf-client";
//     useState,
//     ...
//   } from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = "/home/usuario/proyectos/Mercado";

// Encuentra todos los archivos que contienen csrfHeaders import
const allTsx = execSync(
  `find ${ROOT}/components ${ROOT}/app -name "*.tsx" -o -name "*.ts" | xargs grep -l "csrfHeaders" 2>/dev/null || true`,
  { encoding: "utf8" },
).split("\n").filter(Boolean);

const BROKEN_RE = /import \{\s*\nimport \{ csrfHeaders \} from "@\/lib\/csrf-client";\s*\n/;

let fixed = 0;
const broken = [];
for (const file of allTsx) {
  const original = readFileSync(file, "utf8");
  if (!BROKEN_RE.test(original)) continue;
  broken.push(file);
  // Quitar la línea rota del medio
  let next = original.replace(BROKEN_RE, "import {\n");
  // Asegurar que csrfHeaders esté importado en otra línea
  if (!/import \{ csrfHeaders \} from "@\/lib\/csrf-client";/.test(next)) {
    // Insertar tras el primer import multiline cerrado
    next = next.replace(
      /^(import \{[\s\S]*?\} from "[^"]+";)/m,
      `$1\nimport { csrfHeaders } from "@/lib/csrf-client";`,
    );
  }
  if (next !== original) {
    writeFileSync(file, next);
    fixed++;
  }
}
console.log(`Detectados rotos: ${broken.length}`);
console.log(`✅ Reparados: ${fixed}`);
