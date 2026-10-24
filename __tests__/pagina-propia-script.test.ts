/**
 * ADR-458 · `npm run pagina-propia -- crear <id> "<nombre>"` sobre una COPIA de
 * los registros (`PAGINA_PROPIA_RAIZ`): crea la carpeta con manifiesto,
 * servidor y LEEME, suma las líneas bajo el ancla «páginas propias» de los dos
 * registros, y rechaza ids malos o repetidos sin tocar nada.
 *
 * La copia vive dentro de `__tests__/` para que el manifiesto generado se
 * pueda IMPORTAR (zod se resuelve) y pasar por el mismo `validarOpciones` que
 * usa el sistema.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tenant-pieza.db", () => ({ TenantPiezaDB: {} }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: {} }));

import { validarOpciones } from "@/lib/extensiones/resolver";
import type { ManifiestoPieza } from "@/extensiones/_contrato";

const REPO = path.resolve(__dirname, "..");
const RAIZ = path.join(__dirname, `.tmp-pagina-propia-${process.pid}`);
const EXT = path.join(RAIZ, "extensiones");
const REG_S = path.join(EXT, "registro.servidor.ts");
const REG_C = path.join(EXT, "registro.cliente.ts");

function crear(...args: string[]) {
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/pagina-propia.mjs"), "crear", ...args], {
    env: { ...process.env, PAGINA_PROPIA_RAIZ: RAIZ },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const leer = (p: string) => readFileSync(p, "utf8");

beforeAll(() => {
  mkdirSync(EXT, { recursive: true });
  copyFileSync(path.join(REPO, "extensiones/registro.servidor.ts"), REG_S);
  copyFileSync(path.join(REPO, "extensiones/registro.cliente.ts"), REG_C);
});
afterAll(() => {
  rmSync(RAIZ, { recursive: true, force: true });
});

describe("registro real", () => {
  it("toda página propia del registro trae su `pagina` perezosa y llena SÓLO tienda.pagina", async () => {
    const { PIEZAS_SERVIDOR } = await import("@/extensiones/registro.servidor");
    for (const e of PIEZAS_SERVIDOR.filter((x) => x.manifiesto.enchufes.includes("tienda.pagina"))) {
      expect(typeof e.pagina, `${e.manifiesto.id} llena tienda.pagina y no trae \`pagina\``).toBe("function");
      // Una página entera no se mezcla con otros enchufes: la exclusividad es por pieza.
      expect(e.manifiesto.enchufes).toEqual(["tienda.pagina"]);
    }
  });
});

describe("scripts/pagina-propia.mjs crear", () => {
  it("crea la carpeta y suma las líneas bajo el ancla de los DOS registros", () => {
    const r = crear("pagina-test-script", "Pollería «Test» \"uno\"");
    expect(r.code, r.out).toBe(0);
    const dir = path.join(EXT, "pagina-test-script");
    for (const f of ["manifest.ts", "servidor.tsx", "LEEME.md"]) expect(existsSync(path.join(dir, f))).toBe(true);

    expect(leer(path.join(dir, "servidor.tsx"))).toContain("<PaginaGeneral slug={ctx.slug} searchParams={searchParams} />");

    const s = leer(REG_S).split("\n");
    const anclaImports = s.findIndex((l) => l.trim() === "// ── páginas propias (imports) ──");
    const imp = s.indexOf('import { manifiesto as paginaTestScript } from "./pagina-test-script/manifest";');
    expect(imp).toBeGreaterThan(anclaImports);
    // La página NO se importa arriba (círculo registro → página → PaginaGeneral → resolver → registro):
    // va perezosa en la lista.
    expect(s.join("\n")).not.toMatch(/^import .*pagina-test-script\/servidor/m);
    const anclaLista = s.findIndex((l) => l.trim() === "// ── páginas propias ──");
    const linea = s.indexOf(
      '  piezaServidor(paginaTestScript, { pagina: () => import("./pagina-test-script/servidor").then((m) => m.pagina) }),',
    );
    expect(linea).toBeGreaterThan(anclaLista);
    expect(s.slice(linea + 1).find((l) => l.trim() !== "")?.trim()).toBe("];");

    const c = leer(REG_C);
    expect(c).toContain('import { manifiesto as paginaTestScript } from "./pagina-test-script/manifest";');
    expect(c).toContain("  [paginaTestScript.id]: piezaCliente(paginaTestScript),");
    expect(c).not.toContain("pagina-test-script/servidor");
  });

  it("el manifiesto generado cumple el contrato: tienda.pagina, opciones vacías .strict(), nombre con comillas a salvo", async () => {
    const { manifiesto } = (await import(path.join(EXT, "pagina-test-script", "manifest.ts"))) as { manifiesto: ManifiestoPieza };
    expect(manifiesto.id).toBe("pagina-test-script");
    expect(manifiesto.nombre).toBe("Pollería «Test» \"uno\"");
    expect(manifiesto.enchufes).toEqual(["tienda.pagina"]);
    expect(manifiesto.version).toBe("1.0.0");
    expect(validarOpciones(manifiesto, {})).toEqual({ ok: true, opciones: {} });
    expect(validarOpciones(manifiesto, { tenantId: "otro" }).ok).toBe(false);
    // Sin ids de negocio en lo generado (la asignación vive en la tabla).
    const todo = ["manifest.ts", "servidor.tsx"].map((f) => leer(path.join(EXT, "pagina-test-script", f))).join("\n");
    expect(todo).not.toMatch(/\bc[a-z0-9]{24}\b/);
    expect(todo).not.toMatch(/(tenantId|slug)\s*[!=]==?\s*["'`]/);
  });

  it("una segunda página va DESPUÉS de la primera, en los dos registros", () => {
    expect(crear("pagina-otra", "Otra").code).toBe(0);
    const s = leer(REG_S);
    expect(s.indexOf("piezaServidor(paginaOtra,")).toBeGreaterThan(s.indexOf("piezaServidor(paginaTestScript,"));
    const c = leer(REG_C);
    expect(c.indexOf("[paginaOtra.id]")).toBeGreaterThan(c.indexOf("[paginaTestScript.id]"));
  });

  it("id repetido, mal escrito o sin nombre → código 1 y no toca los registros", () => {
    const antes = [leer(REG_S), leer(REG_C)];
    const malos: Array<[string[], RegExp]> = [
      [["pagina-test-script", "Otra vez"], /Ya existe/],
      [["Mal_Id", "x"], /no sirve/],
      [["1-pagina", "x"], /no sirve/],
      [["a--b", "x"], /no sirve/],
      [["pagina-sin-nombre"], /Falta el nombre/],
      [["pagina-sin-nombre", "   "], /Falta el nombre/],
      // Chocan con nombres que ya usa el registro (TS2300 «Duplicate identifier»).
      [["pieza-servidor", "x"], /ya usa el nombre «piezaServidor»/],
      [["pieza-cliente", "x"], /ya usa el nombre «piezaCliente»/],
      [["dynamic", "x"], /ya usa el nombre «dynamic»/],
      [["class", "x"], /palabra reservada/],
    ];
    for (const [args, msg] of malos) {
      const r = crear(...args);
      expect(r.code, args.join(" ")).toBe(1);
      expect(r.out).toMatch(msg);
    }
    for (const d of ["pagina-sin-nombre", "pieza-servidor", "pieza-cliente", "dynamic", "class"]) {
      expect(existsSync(path.join(EXT, d)), d).toBe(false);
    }
    expect([leer(REG_S), leer(REG_C)]).toEqual(antes);
  });
});
