// @vitest-environment node
import { describe, it, expect } from "vitest";
import { maquetarEtiquetas, posicionDelCasillero, urlDelPapel, recortarLineas, ETIQUETAS_POR_HOJA } from "@/lib/documentos/etiquetas-qr";

const papeles = (n: number, desde = 1) => Array.from({ length: n }, (_, i) => ({ id: `id${desde + i}`, codigo: desde + i, name: `Papel ${desde + i}` }));

describe("etiquetas con QR — maquetado", () => {
  it("24 por hoja y la 25 abre la hoja 2 en el primer casillero", () => {
    const m = maquetarEtiquetas(papeles(25));
    expect(ETIQUETAS_POR_HOJA).toBe(24);
    expect(m.hojas).toBe(2);
    expect(m.etiquetas[23].pagina).toBe(0);
    expect(m.etiquetas[24]).toMatchObject({ pagina: 1, casillero: 0, ...posicionDelCasillero(0) });
  });

  it("3 columnas × 8 filas: el casillero 3 baja de fila y 23 es la esquina de abajo", () => {
    const a = posicionDelCasillero(0);
    expect(posicionDelCasillero(1).x - a.x).toBe(70);
    expect(posicionDelCasillero(3)).toEqual({ x: a.x, y: a.y + 37 });
    const z = posicionDelCasillero(23);
    expect(z.x + 70).toBeCloseTo(210 - a.x);
    expect(z.y + 37).toBeCloseTo(297 - a.y);
  });

  it("empezar en 5 corre las posiciones (deja 4 casilleros vacíos)", () => {
    const m = maquetarEtiquetas(papeles(3), 5);
    expect(m.etiquetas[0]).toMatchObject({ casillero: 4, ...posicionDelCasillero(4) });
    expect(m.hojas).toBe(1);
  });

  it("empezar en 23 con 3 papeles: dos en la hoja 1 y uno en la 2", () => {
    const m = maquetarEtiquetas(papeles(3), 23);
    expect(m.etiquetas.map((e) => [e.pagina, e.casillero])).toEqual([[0, 22], [0, 23], [1, 0]]);
    expect(m.hojas).toBe(2);
  });

  it("los papeles sin código se saltan y no gastan casillero", () => {
    const m = maquetarEtiquetas([{ id: "a", codigo: null, name: "x" }, ...papeles(2, 367), { id: "b", name: "y" }]);
    expect(m.sinCodigo).toBe(2);
    expect(m.etiquetas.map((e) => e.codigo)).toEqual(["DOC-000367", "DOC-000368"]);
    expect(m.etiquetas[0].casillero).toBe(0);
  });

  it("nada que imprimir → 0 hojas; «empezar en» fuera de rango se acota", () => {
    expect(maquetarEtiquetas([]).hojas).toBe(0);
    expect(maquetarEtiquetas(papeles(1), 99).etiquetas[0].casillero).toBe(23);
    expect(maquetarEtiquetas(papeles(1), 0).etiquetas[0].casillero).toBe(0);
  });
});

describe("etiquetas con QR — enlace y texto", () => {
  it("el QR abre el papel en el panel", () => {
    expect(urlDelPapel("https://mi.negocio.pe/", "abc 1")).toBe("https://mi.negocio.pe/admin?tab=documentos&doc=abc%201");
  });
  it("el nombre largo se corta a 2 líneas con «…»", () => {
    expect(recortarLineas(["uno", "dos"], 2)).toEqual(["uno", "dos"]);
    const r = recortarLineas(["uno", "dos palabras", "tres"], 2);
    expect(r).toHaveLength(2);
    expect(r[1].endsWith("…")).toBe(true);
  });
});
