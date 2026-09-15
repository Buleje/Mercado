/**
 * El `<th>` manda sobre el default de alineación del DataTable.
 *
 * El bug (2026-09-06): `[&_thead_th]:text-left` es un selector DESCENDIENTE
 * (especificidad 0,1,2) y le ganaba a la clase `.text-right` (0,1,0) puesta en
 * el propio `<th>`. Resultado medido con getComputedStyle: los encabezados de
 * las columnas de m³ y soles quedaban a la izquierda mientras sus valores iban
 * a la derecha — 84 archivos pedían `text-right` y ninguno lo conseguía. Y el
 * `<tfoot>`, sin regla propia, conservaba el `px-4` del consumidor contra el
 * `px-3` del cuerpo: la fila de totales caía 4px corrida respecto a la columna
 * que suma.
 *
 * Es CSS puro, así que no hay assertion de DOM que lo pruebe en jsdom (no
 * resuelve especificidad de utilidades de Tailwind). Lo que sí se puede
 * blindar es que las reglas que lo arreglan sigan ahí: si alguien vuelve a
 * poner el `text-left` incondicional o borra el padding del pie, esto avisa.
 * La prueba de que se ve bien es la medición en navegador, no este archivo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(
  resolve(process.cwd(), "packages/design-system/src/data-display.tsx"),
  "utf8",
);

describe("DataTable — alineación de columnas", () => {
  it("el default de alineación cede ante text-right / text-center del <th>", () => {
    expect(fuente).toContain("[&_thead_th:not(.text-right):not(.text-center)]:text-left");
  });

  it("no queda ningún text-left incondicional que pise al <th>", () => {
    expect(fuente).not.toContain("[&_thead_th]:text-left");
  });

  it("el pie usa el mismo padding horizontal que el cuerpo", () => {
    const padCuerpo = fuente.match(/\[&_tbody_td\]:px-(\d+)/)?.[1];
    const padPie = fuente.match(/\[&_tfoot_td\]:px-(\d+)/)?.[1];
    expect(padCuerpo).toBeDefined();
    expect(padPie).toBe(padCuerpo);
  });

  it("el pie también cubre <th> (tablas que rotulan la fila de totales)", () => {
    expect(fuente).toContain("[&_tfoot_th]:px-");
  });
});
