/**
 * Ningún `<script>` con datos se arma con `JSON.stringify` pelado.
 *
 * `JSON.stringify` no escapa `<`: un título de página, un nombre de tienda o
 * de producto con `</script><script>…` cierra el bloque JSON-LD y ejecuta JS en
 * el dominio de la plataforma — y la CSP de la tienda trae `'unsafe-inline'`.
 * La revisión de seguridad del 01-10-2026 lo explotó con el título de una
 * página del CMS; había 48 iguales en 27 archivos. Se usa `safeJsonLdStringify`
 * (`lib/seo/json-ld.ts`), que escapa `<`, `>`, `&`, U+2028 y U+2029.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib", "extensiones"];

function archivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "generated" ? [] : archivos(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

describe("JSON-LD sin XSS", () => {
  it("ningún __html se arma con JSON.stringify pelado", () => {
    const malos = DIRS.flatMap((d) => archivos(path.join(ROOT, d)))
      .filter((f) => /__html:\s*JSON\.stringify\(/.test(fs.readFileSync(f, "utf-8")))
      .map((f) => path.relative(ROOT, f));
    expect(malos, `Usá safeJsonLdStringify de @/lib/seo/json-ld:\n${malos.join("\n")}`).toEqual([]);
  });

  it("safeJsonLdStringify no deja cerrar el <script> y sigue siendo el mismo JSON", () => {
    const dato = { headline: "T</script><script>alert(1)</script> & co" };
    const salida = safeJsonLdStringify(dato);
    expect(salida).not.toMatch(/<\/script/i);
    expect(JSON.parse(salida)).toEqual(dato);
  });
});
