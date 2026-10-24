/**
 * El gate de anidado HTML cruza componentes por nombre — pero debe confirmar
 * que son EL MISMO componente antes de acusar.
 *
 * Por qué existe (2026-09-19): dos `Etapa` distintos (uno exportado en
 * `historia/EtapasDelLote`, otro privado en `LothTraceResumen`) daban dos
 * roturas falsas y bloquearon un commit legítimo. Al arreglarlo apareció el
 * riesgo contrario, que este test también cubre: comparando rutas relativas
 * contra absolutas el gate dejaba de detectar las roturas DE VERDAD — un gate
 * mudo es peor que uno que grita de más.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

let raiz: string;

const ENVOLTURA_CON_P = `import type { ReactNode } from "react";
export function Envoltura({ children }: { children: ReactNode }) {
  return <p className="x">{children}</p>;
}
`;

const LLAMADOR_ROTO = `import { Envoltura } from "./Envoltura";
export function Llamador() {
  return (
    <Envoltura>
      <ul><li>uno</li></ul>
    </Envoltura>
  );
}
`;

/** Mismo nombre, pero es un <div>: pasarle un <ul> NO es una rotura. */
const HOMONIMO_SANO = `import type { ReactNode } from "react";
export function Envoltura({ children }: { children: ReactNode }) {
  return <div className="x">{children}</div>;
}
export function LlamadorSano() {
  return (
    <Envoltura>
      <ul><li>uno</li></ul>
    </Envoltura>
  );
}
`;

function correrGate(sobre: string): { salida: string; codigo: number } {
  try {
    const salida = execFileSync("node", ["scripts/check-html-nesting.mjs", sobre], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    return { salida, codigo: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { salida: err.stdout ?? "", codigo: err.status ?? 1 };
  }
}

describe("gate de anidado HTML — el homónimo no es el mismo componente", () => {
  beforeAll(() => {
    // El gate resuelve los imports contra el cwd, así que el fixture vive
    // dentro del repo (en un nombre que nada más matchea) y se borra al final.
    raiz = mkdtempSync(join(process.cwd(), ".gate-fixture-"));
    mkdirSync(join(raiz, "a"));
    mkdirSync(join(raiz, "b"));
    writeFileSync(join(raiz, "a/Envoltura.tsx"), ENVOLTURA_CON_P);
    writeFileSync(join(raiz, "a/Llamador.tsx"), LLAMADOR_ROTO);
    writeFileSync(join(raiz, "b/Homonimo.tsx"), HOMONIMO_SANO);
  });

  afterAll(() => {
    if (raiz) rmSync(raiz, { recursive: true, force: true });
  });

  it("acusa la rotura REAL: un <ul> dentro del <p> de su propio wrapper", () => {
    const { salida, codigo } = correrGate(raiz);
    expect(salida).toContain("a/Llamador.tsx");
    expect(codigo).not.toBe(0);
  });

  it("NO acusa al homónimo de otro archivo, que envuelve en <div>", () => {
    const { salida } = correrGate(raiz);
    expect(salida).not.toContain("b/Homonimo.tsx");
  });

  it("reporta exactamente una rotura, no dos", () => {
    const { salida } = correrGate(raiz);
    const m = salida.match(/✖ (\d+) rotura/);
    expect(m?.[1]).toBe("1");
  });
});
