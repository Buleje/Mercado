/**
 * Toda lectura de entregas de adelanto filtra las anuladas (ADR-413 §7).
 *
 * La baja lógica de una entrega sale barata porque todo pasa por dos puntos:
 * `INCLUDE_FULL.entregas` y el `aggregate` que recalcula el saldo. Una lectura
 * nueva de entregas sin `anuladaAt` volvería a contar el pago de una
 * liquidación anulada — plata que ya no existe, en silencio. Este test la
 * atrapa al escribirla, venga por la tabla, por la relación o por SQL crudo.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "generated" || nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...archivos(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** Las formas de leer entregas, y cuánto texto después tiene que aparecer `anuladaAt`. */
const LECTURAS: { re: RegExp; ventana: number; que: string }[] = [
  { re: /adelantoEntrega\.(findMany|findFirst|findUnique|aggregate|count|groupBy)\(/g, ventana: 300, que: "consulta a la tabla" },
  /* La relación desde el adelanto: `include`/`select: { entregas: { … } }`. */
  { re: /\bentregas\s*:\s*\{/g, ventana: 200, que: "relación entregas" },
  /* SQL crudo contra la tabla. */
  { re: /"AdelantoEntrega"/g, ventana: 400, que: "SQL crudo" },
];
/* Sin filtro posible: traer o contar TODAS las entregas (`include: { entregas: true }`, `_count`). */
const SIN_FILTRO_POSIBLE = /\bentregas\s*:\s*true\b/g;

/** Las lecturas de `txt` que no filtran las anuladas, como `línea (qué)`. */
function lecturasSinFiltro(txt: string): string[] {
  const linea = (i: number) => txt.slice(0, i).split("\n").length;
  const out: string[] = [];
  for (const l of LECTURAS) {
    for (const m of txt.matchAll(l.re)) {
      const i = m.index ?? 0;
      if (!txt.slice(i, i + l.ventana).includes("anuladaAt")) out.push(`${linea(i)} (${l.que})`);
    }
  }
  for (const m of txt.matchAll(SIN_FILTRO_POSIBLE)) out.push(`${linea(m.index ?? 0)} (entregas: true)`);
  return out;
}

describe("entregas anuladas", () => {
  it("ninguna lectura de entregas de adelanto queda sin el filtro de anuladaAt", () => {
    const sinFiltro: string[] = [];
    for (const f of [...archivos(join(RAIZ, "lib")), ...archivos(join(RAIZ, "app"))]) {
      for (const l of lecturasSinFiltro(readFileSync(f, "utf-8"))) sinFiltro.push(`${relative(RAIZ, f)}:${l}`);
    }
    expect(sinFiltro).toEqual([]);
  });

  it("el detector atrapa cada forma de leer sin filtro (y deja pasar las filtradas)", () => {
    expect(lecturasSinFiltro("prisma.adelanto.findMany({ include: { entregas: true } })")).toHaveLength(1);
    expect(lecturasSinFiltro("select: { _count: { select: { entregas: true } } }")).toHaveLength(1);
    expect(lecturasSinFiltro('await tx.$queryRaw`SELECT SUM("valor") FROM "AdelantoEntrega" WHERE "adelantoId" = ${id}`')).toHaveLength(1);
    expect(lecturasSinFiltro("include: { entregas: { orderBy: { fecha: 'desc' } } }")).toHaveLength(1);
    expect(lecturasSinFiltro("tx.adelantoEntrega.aggregate({ where: { adelantoId }, _sum: { valor: true } })")).toHaveLength(1);

    expect(lecturasSinFiltro("include: { entregas: { where: { anuladaAt: null } } }")).toEqual([]);
    expect(lecturasSinFiltro('SELECT 1 FROM "AdelantoEntrega" WHERE "anuladaAt" IS NULL')).toEqual([]);
    expect(lecturasSinFiltro("select: { entregasPactadas: true }")).toEqual([]);
  });

  it("el include de las entregas del adelanto filtra las anuladas", () => {
    const txt = readFileSync(join(RAIZ, "lib/db/adelantos.db.ts"), "utf-8");
    const include = /const INCLUDE_FULL = \{[\s\S]*?\} satisfies/.exec(txt)?.[0] ?? "";
    expect(include).toMatch(/entregas: \{[^}]*anuladaAt: null/);
  });
});
