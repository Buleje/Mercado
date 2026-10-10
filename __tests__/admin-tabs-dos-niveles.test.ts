/**
 * Máximo 2 niveles de pestañas (plan «panel unificado», regla R4; contrato de
 * diseño del panel, ADR-489).
 *
 * Un nivel = un archivo que dibuja `<AdminTabBar`. Desde cada pestaña de la
 * barra (los `import()` de app/admin/_components/TabRouter.tsx) se sigue el
 * grafo de imports —estáticos y `import()` de next/dynamic— por components/ y
 * app/admin/, y se cuenta cuántos archivos con barra hay, como máximo, en un
 * mismo camino. Es una cota por imports, no por render: un archivo que se
 * importa sólo por una constante también suma. Por eso el mensaje trae la
 * cadena entera, para juzgarla.
 *
 * Sólo se miden barras `AdminTabBar` (lo que pide el contrato). Los libros
 * (riel + pestaña interna) y las navegaciones propias (`SeccionesNav` de Mi
 * Plata, `role="tablist"` a mano) no suman acá: por eso Mi Plata › Por cobrar ›
 * Adelantos da 2 y no 3. Un modal (`*Modal|Drawer|Dialog|Sheet.tsx`) es una
 * superficie aparte: sus pestañas no anidan en las de la página.
 *
 * PERMITIDOS = las pestañas que HOY pasan de 2 (medido 2026-10-09), con su
 * profundidad. Sólo puede achicarse: si una baja, el test pide actualizar el
 * número o sacarla.
 *
 * Ejecutar: npx vitest run __tests__/admin-tabs-dos-niveles.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const RAIZ = path.resolve(__dirname, "..");
const TAB_ROUTER = "app/admin/_components/TabRouter.tsx";
const BARRA = "components/admin/shared/AdminTabBar.tsx";
const MAXIMO = 2;

/** Pestaña (ruta del módulo que monta TabRouter) → profundidad medida hoy. */
const PERMITIDOS: Record<string, number> = {};

/* Sin comentarios: `module-depth.tsx` nombra «<AdminTabBar>» en un comentario
   y, leído crudo, contaba como una barra más en 10 pestañas. */
const sinComentarios = (t: string) =>
  t
    // `/*` sólo como comentario (no el de «components/*» dentro de otro texto)
    .replace(/(^|[\s{(;,])\/\*[\s\S]*?\*\//g, "$1")
    // `//` precedido de espacio o inicio (no el de «https://»)
    .replace(/(^|\s)\/\/.*$/gm, "$1");

const fuentes = new Map<string, string>();
function leer(rel: string): string {
  let t = fuentes.get(rel);
  if (t === undefined) {
    t = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
    fuentes.set(rel, t);
  }
  return t;
}

/** `@/x` o `./x` → ruta relativa al repo de un .tsx/.ts dentro de components/ o app/admin/. */
function resolver(espec: string, desde: string): string | null {
  let base: string;
  if (espec.startsWith("@/")) base = espec.slice(2);
  else if (espec.startsWith(".")) base = path.posix.join(path.posix.dirname(desde), espec);
  else return null;
  if (!base.startsWith("components/") && !base.startsWith("app/admin/")) return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (/\.(tsx|ts)$/.test(c) && fs.existsSync(path.join(RAIZ, c))) return c;
  }
  return null;
}

const IMPORT_ESTATICO = /(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?["']([^"']+)["']/g;
const IMPORT_DINAMICO = /import\(\s*["']([^"']+)["']\s*\)/g;

const hijosMemo = new Map<string, string[]>();
function hijos(rel: string): string[] {
  const hecho = hijosMemo.get(rel);
  if (hecho) return hecho;
  const src = leer(rel);
  const out = new Set<string>();
  for (const m of src.matchAll(IMPORT_ESTATICO)) {
    if (m[1]) continue; // `import type`: no dibuja nada
    const r = resolver(m[2], rel);
    if (r) out.add(r);
  }
  for (const m of src.matchAll(IMPORT_DINAMICO)) {
    const r = resolver(m[1], rel);
    if (r) out.add(r);
  }
  const lista = [...out].sort();
  hijosMemo.set(rel, lista);
  return lista;
}

const tieneBarra = (rel: string) => rel !== BARRA && /<AdminTabBar\b/.test(leer(rel));
const esSuperficieAparte = (rel: string) => /(Modal|Drawer|Dialog|Sheet)\.tsx$/.test(rel);

interface Medida {
  prof: number;
  cadena: string[];
}
const memo = new Map<string, Medida>();
const enCurso = new Set<string>();
function medir(rel: string): Medida {
  const hecho = memo.get(rel);
  if (hecho) return hecho;
  if (enCurso.has(rel) || esSuperficieAparte(rel)) return { prof: 0, cadena: [] }; // ciclo, o modal
  enCurso.add(rel);
  let mejor: Medida = { prof: 0, cadena: [] };
  for (const h of hijos(rel)) {
    const m = medir(h);
    if (m.prof > mejor.prof) mejor = m;
  }
  enCurso.delete(rel);
  const propia = tieneBarra(rel);
  const res: Medida = propia
    ? { prof: mejor.prof + 1, cadena: [rel, ...mejor.cadena] }
    : mejor;
  memo.set(rel, res);
  return res;
}

/** Los módulos que TabRouter monta con next/dynamic, en su orden. */
export function modulosDeTabRouter(): string[] {
  const src = leer(TAB_ROUTER);
  const out: string[] = [];
  for (const m of src.matchAll(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g)) {
    const r = resolver(m[1], TAB_ROUTER);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

const corto = (rel: string) => rel.replace(/^components\/admin\//, "");

describe("Pestañas del panel — como máximo 2 niveles de AdminTabBar", () => {
  const modulos = modulosDeTabRouter();

  it("TabRouter monta al menos 30 pestañas (hoy 34)", () => {
    expect(modulos.length).toBeGreaterThanOrEqual(30);
  });

  for (const rel of modulos) {
    it(`${corto(rel)} no pasa de ${PERMITIDOS[rel] ?? MAXIMO} niveles`, () => {
      const { prof, cadena } = medir(rel);
      const tope = PERMITIDOS[rel] ?? MAXIMO;
      expect(
        prof,
        `${prof} niveles: ${cadena.map(corto).join(" › ")}. ` +
          "El 3.er nivel pasa a bloque plegable recordado (components/admin/shared/Plegable.tsx).",
      ).toBeLessThanOrEqual(tope);
      if (PERMITIDOS[rel] !== undefined) {
        expect(
          prof,
          `${corto(rel)} bajó a ${prof} niveles: actualizá PERMITIDOS (o sacala si ya es ≤ ${MAXIMO}).`,
        ).toBe(PERMITIDOS[rel]);
      }
    });
  }

  it("PERMITIDOS sólo nombra pestañas que TabRouter monta y que pasan de 2", () => {
    for (const [rel, n] of Object.entries(PERMITIDOS)) {
      expect(modulos, `${rel} ya no está en TabRouter: sacalo de PERMITIDOS`).toContain(rel);
      expect(n).toBeGreaterThan(MAXIMO);
    }
  });
});
