/**
 * Tests — el guard de anidado HTML (`scripts/check-html-nesting.mjs`).
 *
 * Un detector que devuelve "todo limpio" es indistinguible de uno roto hasta
 * que se lo prueba contra el bug que debía encontrar. La primera versión de
 * este guard daba 0 hallazgos por un `Map` que pisaba ubicaciones repetidas,
 * y el 0 parecía una buena noticia. Estos tests le ponen delante los tres
 * casos reales y exigen que los vea.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GUARD = "scripts/check-html-nesting.mjs";
let dir: string;

/** Corre el guard sobre un directorio y devuelve salida + código. */
function correr(args: string[]): { salida: string; code: number } {
  try {
    const salida = execFileSync("node", [GUARD, ...args], { encoding: "utf8" });
    return { salida, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { salida: err.stdout ?? "", code: err.status ?? 1 };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nesting-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("check-html-nesting", () => {
  it("ve un bloque dentro de un <p> en el mismo archivo", () => {
    writeFileSync(
      join(dir, "BloqueEnP.tsx"),
      `export function X() {
        return <p>texto<ul><li>uno</li></ul></p>;
      }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(1);
    expect(salida).toContain("<ul> dentro de <p>");
    rmSync(join(dir, "BloqueEnP.tsx"));
  });

  it("ve un control anidado dentro de otro control", () => {
    writeFileSync(
      join(dir, "BotonEnBoton.tsx"),
      `export function X() {
        return <button onClick={() => {}}>fuera<a href="/x">adentro</a></button>;
      }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(1);
    expect(salida).toContain("<a> dentro de <button>");
    rmSync(join(dir, "BotonEnBoton.tsx"));
  });

  it("ve la rotura que cruza dos componentes — el caso del ModalFooter", () => {
    // El `<p>` vive en un archivo y el `<details>` en otro: un escáner que
    // mira de a un archivo devuelve 0 acá. Ese fue el bug real de 2026-08-08.
    writeFileSync(
      join(dir, "Pie.tsx"),
      `export function Pie({ aviso }: { aviso?: React.ReactNode }) {
        return <p className="x">{aviso}</p>;
      }`,
    );
    writeFileSync(
      join(dir, "Llamador.tsx"),
      `import { Pie } from "./Pie";
      export function Y() {
        return <Pie aviso={<details><summary>por qué</summary><ul><li>a</li></ul></details>} />;
      }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(1);
    expect(salida).toContain("Pie.aviso");
    expect(salida).toMatch(/pasa <(details|summary|ul|li)>/);
    rmSync(join(dir, "Llamador.tsx"));
  });

  it("no marca el mismo <p> cuando el llamador manda sólo texto", () => {
    // `Pie.tsx` sigue en el directorio: el wrapper existe, pero sin llamador
    // que le pase bloque no hay rotura. Distinguir riesgo de rotura es lo que
    // evita que el guard grite por 30 wrappers sanos.
    writeFileSync(
      join(dir, "LlamadorSano.tsx"),
      `import { Pie } from "./Pie";
      export function Z() {
        return <Pie aviso={<span>todo bien</span>} />;
      }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(0);
    expect(salida).toContain("Sin anidado inválido");
  });

  it("--strict lista el wrapper en riesgo sin fallar", () => {
    const { salida, code } = correr([dir, "--strict"]);
    expect(code).toBe(0);
    expect(salida).toContain("Pie.aviso");
    expect(salida).toContain("en riesgo");
  });

  // Que el REPO esté limpio no se testea acá a propósito: son ~7s de escaneo
  // completo en cada corrida de la suite, y de eso ya se ocupa el gate de
  // pre-commit (sección 6 de .husky/pre-commit). Acá sólo va el detector.
});
