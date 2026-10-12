import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { carasDe, leerLetras, PARES } from "@/extensiones/pagina-musa/letras";
import { CSS_TEMA, cssTema } from "@/extensiones/pagina-musa/tema";

const archivos = (css: string) => [...css.matchAll(/url\(\/fonts\/musa\/([^)]+)\)/g)].map((m) => m[1]);

describe("letras de Musa: un par por página, sólo sus archivos", () => {
  it("sin parámetro (o con uno raro) va el par A; b y c sólo si se piden", () => {
    expect(leerLetras(undefined)).toBe("a");
    expect(leerLetras("x")).toBe("a");
    expect(leerLetras(["B", "c"])).toBe("b");
    expect(leerLetras(" c ")).toBe("c");
  });

  it("la hoja de la tienda (A) no nombra los archivos de B ni de C: el navegador no los baja", () => {
    const enA = archivos(CSS_TEMA);
    expect(enA).toEqual(["CormorantGaramond-600.woff2", "CormorantGaramond-600-Italic.woff2", "Jost.woff2", "GreatVibes-400.woff2"]);
    expect(CSS_TEMA).not.toMatch(/Playfair|Fraunces|Jakarta|Poppins-/);
  });

  it("cada par apunta a archivos que existen en public/fonts/musa", () => {
    for (const par of Object.keys(PARES) as (keyof typeof PARES)[]) {
      for (const f of archivos(carasDe(par))) expect(existsSync(join(process.cwd(), "public/fonts/musa", f)), `${par}: ${f}`).toBe(true);
    }
  });

  it("la familia de títulos y textos cambia con el par (variables de la hoja)", () => {
    expect(cssTema("b")).toContain('--mu-fuente-display:"Musa Playfair"');
    expect(cssTema("c")).toContain('--mu-fuente-texto:"Musa Jakarta"');
    expect(CSS_TEMA).toContain('--mu-fuente-texto:"Musa Jost"');
  });
});
