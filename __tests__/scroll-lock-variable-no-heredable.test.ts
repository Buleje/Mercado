/**
 * El scroll-lock de Radix (react-remove-scroll-bar) pone
 * `--removed-body-scroll-bar-size` en <body> al abrir cada modal. Heredable,
 * ese cambio recalcula el estilo de la página entera (medido 23-09: abrir
 * «Dueños» sobre «Producir sin lote» con 60 piezas, 576 → 455 ms). Por eso
 * `app/globals.css` la registra NO heredable.
 *
 * La contracara: un hijo que la lea con `var()` recibe 0px, no el ancho de la
 * barra. Si algún día alguien la necesita, este test lo frena para que decida
 * a conciencia (leerla en <body> sí funciona).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(tsx?|css)$/.test(n)) out.push(p);
  }
  return out;
}

describe("variable del scroll-lock de Radix", () => {
  it("globals.css la registra NO heredable", () => {
    const css = readFileSync(join(RAIZ, "app/globals.css"), "utf8");
    const bloque = /@property\s+--removed-body-scroll-bar-size\s*\{([^}]*)\}/.exec(css);
    expect(bloque).not.toBeNull();
    expect(bloque![1]).toMatch(/inherits:\s*false/);
    expect(bloque![1]).toMatch(/syntax:\s*"<length>"/);
  });

  it("nadie la lee con var() desde el código de la app", () => {
    const lectores = ["app", "components", "hooks", "lib", "contexts", "packages/design-system/src"]
      .flatMap((d) => archivos(join(RAIZ, d)))
      .filter((f) => readFileSync(f, "utf8").includes("var(--removed-body-scroll-bar-size"));
    expect(lectores).toEqual([]);
  });
});
