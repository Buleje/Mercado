import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("CMS: el negocio sale del host, nunca de «main» por defecto", () => {
  it("nada bajo app/cms ni app/api/cms cae a \"main\"", () => {
    for (const dir of ["app/cms", "app/api/cms"]) {
      for (const f of archivos(join(RAIZ, dir))) {
        expect(readFileSync(f, "utf8"), f).not.toMatch(/\?\?\s*["']main["']/);
      }
    }
  });

  it("el acceso viejo (lib/cms-db/pages) ya no existe ni se importa", () => {
    expect(existsSync(join(RAIZ, "lib/cms-db/pages.ts"))).toBe(false);
    for (const dir of ["app", "components", "lib", "hooks"]) {
      for (const f of archivos(join(RAIZ, dir))) {
        expect(readFileSync(f, "utf8"), f).not.toContain("cms-db/pages");
      }
    }
  });
});
