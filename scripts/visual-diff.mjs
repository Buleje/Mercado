// Compara dos screenshots con pixelmatch y emite diff PNG + porcentaje cambio.
// Uso: node scripts/visual-diff.mjs <baseline.png> <current.png> <diff.png>
//
// Exit code:
//   0 — diff < 1%
//   1 — diff entre 1% y 5% (regresión menor)
//   2 — diff > 5% (regresión grave)
//
// Print: JSON {pixels, total, pct, verdict} a stdout.
import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [, , basePath, currPath, diffPath] = process.argv;
if (!basePath || !currPath) {
  console.error("Usage: visual-diff.mjs <baseline> <current> [diff-out]");
  process.exit(0);
}
if (!fs.existsSync(basePath) || !fs.existsSync(currPath)) {
  console.log(JSON.stringify({ pixels: 0, total: 0, pct: 0, verdict: "missing-baseline" }));
  process.exit(0);
}

try {
  const base = PNG.sync.read(fs.readFileSync(basePath));
  const curr = PNG.sync.read(fs.readFileSync(currPath));
  const { width, height } = base;
  if (curr.width !== width || curr.height !== height) {
    console.log(JSON.stringify({ pixels: -1, total: 0, pct: -1, verdict: "size-mismatch", baseSize: [width, height], currSize: [curr.width, curr.height] }));
    process.exit(1);
  }
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(base.data, curr.data, diff.data, width, height, { threshold: 0.12, alpha: 0.4 });
  if (diffPath) fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const total = width * height;
  const pct = +(pixels / total * 100).toFixed(3);
  const verdict = pct < 1 ? "ok" : pct < 5 ? "minor-change" : "major-change";
  console.log(JSON.stringify({ pixels, total, pct, verdict, basePath, currPath, diffPath }));
  process.exit(verdict === "major-change" ? 2 : verdict === "minor-change" ? 1 : 0);
} catch (err) {
  console.log(JSON.stringify({ pixels: 0, total: 0, pct: 0, verdict: "error", error: err.message?.slice(0, 200) }));
  process.exit(0);
}
