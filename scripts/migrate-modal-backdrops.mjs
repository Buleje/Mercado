#!/usr/bin/env node
/**
 * Migra patron `bg-black/40 backdrop-blur-sm` → clase utility `modal-backdrop`.
 * Preserva z-index via style={{ zIndex: N }} cuando es z-[NN] no default (z-50).
 * Uso: node scripts/migrate-modal-backdrops.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  'grep -rln "bg-black/40 backdrop-blur-sm\\|bg-black/50 backdrop-blur-sm\\|bg-black/60 backdrop-blur-sm" components/admin --include="*.tsx"',
  { encoding: "utf8" }
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

let totalReplacements = 0;
const touched = [];

for (const file of files) {
  let src = readFileSync(file, "utf8");
  const before = src;
  let localReplacements = 0;

  /* 1. fixed inset-0 z-50 bg-black/XX backdrop-blur-sm → modal-backdrop (z-50 es default) */
  src = src.replace(
    /(className=(?:"|\{cn\()[^"`]*?)fixed inset-0 z-50 bg-black\/(?:40|50|60) backdrop-blur-sm([^"`]*?(?:"|\)))/g,
    (_, pre, post) => {
      localReplacements++;
      return `${pre}modal-backdrop${post}`;
    }
  );

  /* 2. fixed inset-0 z-[NN] bg-black/XX backdrop-blur-sm → modal-backdrop + style */
  src = src.replace(
    /className="fixed inset-0 z-\[(\d+)\] bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    (_, z) => {
      localReplacements++;
      return `className="modal-backdrop" style={{ zIndex: ${z} }}`;
    }
  );

  /* 3. fixed inset-0 z-40 bg-black/XX backdrop-blur-sm → modal-backdrop + style z-40 */
  src = src.replace(
    /className="fixed inset-0 z-40 bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    () => {
      localReplacements++;
      return `className="modal-backdrop" style={{ zIndex: 40 }}`;
    }
  );

  /* 4. fixed inset-0 bg-black/XX backdrop-blur-sm (sin z) → modal-backdrop (z-50 default ok) */
  src = src.replace(
    /className="fixed inset-0 bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    () => {
      localReplacements++;
      return `className="modal-backdrop"`;
    }
  );

  /* 5. absolute inset-0 bg-black/XX backdrop-blur-sm → modal-backdrop absolute */
  src = src.replace(
    /className="absolute inset-0 bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    () => {
      localReplacements++;
      return `className="modal-backdrop absolute"`;
    }
  );

  /* 6. fixed inset-0 z-X flex items-center justify-center bg-black/XX backdrop-blur-sm → modal-backdrop flex ... */
  src = src.replace(
    /className="fixed inset-0 z-50 flex items-center justify-center bg-black\/(?:40|50|60) backdrop-blur-sm([^"]*)"/g,
    (_, rest) => {
      localReplacements++;
      return `className="modal-backdrop flex items-center justify-center${rest}"`;
    }
  );

  /* 7. z-60 / z-100 (Tailwind fuera de scale) */
  src = src.replace(
    /className="fixed inset-0 z-(60|100) flex items-center justify-center bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    (_, z) => {
      localReplacements++;
      return `className="modal-backdrop flex items-center justify-center" style={{ zIndex: ${z} }}`;
    }
  );

  /* 8. md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm (mobile sidebar overlay) */
  src = src.replace(
    /className="md:hidden fixed inset-0 z-40 bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    () => {
      localReplacements++;
      return `className="md:hidden modal-backdrop" style={{ zIndex: 40 }}`;
    }
  );

  /* 9. z-[NNNN] flex items-start/center justify-center ... bg-black/XX backdrop-blur-sm */
  src = src.replace(
    /className="fixed inset-0 z-\[(\d+)\] flex items-(start|center) justify-center ([^"]*?)bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    (_, z, align, rest) => {
      localReplacements++;
      return `className="modal-backdrop flex items-${align} justify-center ${rest}".trim() style={{ zIndex: ${z} }}`.replace('".trim()', '"');
    }
  );

  /* 10. z-[NNNN] flex items-center justify-center p-X bg-black/XX backdrop-blur-sm */
  src = src.replace(
    /className="fixed inset-0 z-\[(\d+)\] flex items-center justify-center p-(\d+) bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    (_, z, p) => {
      localReplacements++;
      return `className="modal-backdrop flex items-center justify-center p-${p}" style={{ zIndex: ${z} }}`;
    }
  );

  /* 11. z-50 flex justify-end ... animate-in ... bg-black/XX backdrop-blur-sm */
  src = src.replace(
    /className="fixed inset-0 z-50 flex justify-end bg-black\/(?:40|50|60) backdrop-blur-sm([^"]*)"/g,
    (_, rest) => {
      localReplacements++;
      return `className="modal-backdrop flex justify-end${rest}"`;
    }
  );

  /* 12. z-50 flex items-center justify-center p-X bg-black/XX backdrop-blur-sm */
  src = src.replace(
    /className="fixed inset-0 z-50 flex items-center justify-center p-(\d+) bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    (_, p) => {
      localReplacements++;
      return `className="modal-backdrop flex items-center justify-center p-${p}"`;
    }
  );

  /* 13. z-[9000] flex items-center justify-center bg-black/XX backdrop-blur-sm */
  src = src.replace(
    /className="fixed inset-0 z-\[9000\] flex items-center justify-center bg-black\/(?:40|50|60) backdrop-blur-sm"/g,
    () => {
      localReplacements++;
      return `className="modal-backdrop flex items-center justify-center" style={{ zIndex: 9000 }}`;
    }
  );

  if (src !== before) {
    writeFileSync(file, src);
    totalReplacements += localReplacements;
    touched.push({ file, n: localReplacements });
  }
}

console.log(`✓ ${touched.length} archivos tocados · ${totalReplacements} reemplazos`);
for (const { file, n } of touched) console.log(`  ${n}× ${file}`);

/* Verificar que no queden patrones viejos */
const leftover = execSync(
  'grep -rln "bg-black/40 backdrop-blur-sm\\|bg-black/50 backdrop-blur-sm\\|bg-black/60 backdrop-blur-sm" components/admin --include="*.tsx" 2>/dev/null || true',
  { encoding: "utf8" }
).trim();

if (leftover) {
  console.log(`\n⚠ Quedan patrones no reconocidos en:`);
  console.log(leftover);
} else {
  console.log(`\n✓ Sin patrones viejos restantes.`);
}
