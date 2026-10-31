/**
 * Ronda 2 del talonario (Brandon 15-10: lupa, alinear en fila y en columna,
 * «y otras funciones»): la lógica pura de `gtf-matricial-edicion`.
 */
import { describe, expect, it } from "vitest";
import { CATALOGO, hojaDeFabrica, hojaSchema } from "@/lib/forestal/gtf-matricial-disposicion";
import {
  alinear,
  aplicarMovimientos,
  cajasDeLaHoja,
  deshacer,
  elegirAlineados,
  empujar,
  enRecuadro,
  guiasDeAlineacion,
  historialVacio,
  igualar,
  imantar,
  moverDesde,
  rehacer,
  repartir,
  zoomQueEntra,
  zoomSiguiente,
  type CajaMm,
} from "@/lib/forestal/gtf-matricial-edicion";

const caja = (x: number, y: number, ancho = 10, alto = 4): CajaMm => ({ x, y, ancho, alto });
const mapa = (o: Record<string, CajaMm>) => new Map(Object.entries(o));

describe("alinear: todos a la medida del primero elegido", () => {
  const c = mapa({ "campo:a": caja(10, 20, 30, 4), "campo:b": caja(50, 27, 10, 6), "campo:c": caja(70, 33, 20, 2) });
  const k = ["campo:a", "campo:b", "campo:c"];

  it("en fila: arriba, al medio y abajo; el primero no se mueve", () => {
    expect(alinear(c, k, "arriba")).toEqual({ "campo:b": { y: 20 }, "campo:c": { y: 20 } });
    expect(alinear(c, k, "medio")).toEqual({ "campo:b": { y: 19 }, "campo:c": { y: 21 } });
    expect(alinear(c, k, "abajo")).toEqual({ "campo:b": { y: 18 }, "campo:c": { y: 22 } });
  });

  it("en columna: izquierda, centro y derecha", () => {
    expect(alinear(c, k, "izq")).toEqual({ "campo:b": { x: 10 }, "campo:c": { x: 10 } });
    expect(alinear(c, k, "centro")).toEqual({ "campo:b": { x: 20 }, "campo:c": { x: 15 } });
    expect(alinear(c, k, "der")).toEqual({ "campo:b": { x: 30 }, "campo:c": { x: 20 } });
  });

  it("una columna de la tabla alineada en Y corre la tabla entera", () => {
    const h = hojaDeFabrica("guia");
    const cajas = cajasDeLaHoja(h, CATALOGO.guia);
    const nueva = aplicarMovimientos(h, alinear(cajas, ["campo:38", "columna:37b"], "arriba"));
    expect(nueva.tabla.y).toBe(h.campos["38"].y);
    expect(nueva.tabla.columnas["37a"]).toEqual(h.tabla.columnas["37a"]);
  });
});

describe("repartir parejo", () => {
  it("a lo ancho: mismo hueco entre campos y las puntas quietas", () => {
    const c = mapa({ "campo:a": caja(0, 0, 10), "campo:b": caja(12, 0, 10), "campo:c": caja(50, 0, 20), "campo:d": caja(90, 0, 10) });
    const m = repartir(c, ["campo:c", "campo:a", "campo:d", "campo:b"], "h");
    /* tramo 0..100, ocupado 50 → 3 huecos de 16,67 */
    expect(m).toEqual({ "campo:b": { x: 26.67 }, "campo:c": { x: 53.33 } });
  });

  it("si no entran sin pisarse, reparte los comienzos", () => {
    const c = mapa({ "campo:a": caja(0, 0, 50), "campo:b": caja(5, 0, 50), "campo:c": caja(30, 0, 50) });
    expect(repartir(c, ["campo:a", "campo:b", "campo:c"], "h")).toEqual({ "campo:b": { x: 15 } });
  });

  it("a lo alto, sin las columnas (comparten la Y de la tabla); con menos de 3 no hace nada", () => {
    const c = mapa({ "campo:a": caja(0, 0, 10, 4), "campo:b": caja(0, 5, 10, 4), "columna:x": caja(0, 50, 10, 4), "campo:c": caja(0, 40, 10, 4) });
    expect(repartir(c, ["campo:a", "campo:b", "campo:c", "columna:x"], "v")).toEqual({ "campo:b": { y: 20 } });
    expect(repartir(c, ["campo:a", "campo:b"], "h")).toEqual({});
  });
});

describe("igualar, mover y acotar", () => {
  it("igualar ancho y letra toma los del primero", () => {
    const h = hojaDeFabrica("guia");
    const a = igualar(h, ["campo:7", "campo:14", "columna:37a"], "ancho");
    expect(a.campos["14"].anchoMm).toBe(h.campos["7"].anchoMm);
    expect(a.tabla.columnas["37a"].anchoMm).toBe(h.campos["7"].anchoMm);
    const l = igualar({ ...h, campos: { ...h.campos, "7": { ...h.campos["7"], letraPt: 12 } } }, ["campo:7", "campo:14", "columna:37a"], "letra");
    expect(l.campos["14"].letraPt).toBe(12);
    expect(l.tabla.letraPt).toBe(12);
  });

  it("mover un grupo lo corre junto y nunca sale de lo que el servidor acepta", () => {
    const h = hojaDeFabrica("guia");
    const cajas = cajasDeLaHoja(h, CATALOGO.guia);
    const c13 = cajas.get("campo:13") as CajaMm;
    const c14 = cajas.get("campo:14") as CajaMm;
    const inicio = new Map([["campo:13", c13], ["campo:14", c14]]);
    const m = aplicarMovimientos(h, moverDesde(inicio, 2.5, -1));
    /* Las posiciones de fábrica salen de la plantilla de la imprenta (`RANURAS`): se comparan contra ellas, no contra números copiados. */
    expect(m.campos["13"].x).toBeCloseTo(c13.x + 2.5, 5);
    expect(m.campos["13"].y).toBeCloseTo(c13.y - 1, 5);
    expect(m.campos["14"].x).toBeCloseTo(c14.x + 2.5, 5);
    const fuera = aplicarMovimientos(h, moverDesde(inicio, -500, 5000));
    expect(fuera.campos["13"].x).toBe(-50);
    /* El grupo se frena entero: el (14) sigue a la misma distancia del (13), no se aplasta contra el borde. */
    expect(fuera.campos["14"].x - fuera.campos["13"].x).toBeCloseTo(c14.x - c13.x, 5);
    expect(hojaSchema.safeParse(fuera).success).toBe(true);
  });
});

describe("elegir", () => {
  const h = hojaDeFabrica("guia");
  const cajas = cajasDeLaHoja(h, CATALOGO.guia);

  it("la fila del (15) son los de su Y a ±2 mm; la columna del (14b), los de su X", () => {
    /* En el papel 2024 el RUC (15), el DNI (14) y el domicilio (16) van en un renglón. */
    const y15 = (cajas.get("campo:15") as CajaMm).y;
    const fila = elegirAlineados(cajas, "campo:15", "fila");
    expect(fila[0]).toBe("campo:15");
    expect(fila).toEqual(expect.arrayContaining(["campo:14", "campo:16"]));
    expect(fila).not.toContain("campo:13");
    for (const k of fila) expect(Math.abs((cajas.get(k) as CajaMm).y - y15)).toBeLessThanOrEqual(2);
    /* La columna de los valores que arrancan después de su rótulo: (11a), (14b), (20b), (26). */
    const x17 = (cajas.get("campo:17") as CajaMm).x;
    const col = elegirAlineados(cajas, "campo:17", "columna");
    expect(col[0]).toBe("campo:17");
    expect(col).toEqual(expect.arrayContaining(["campo:10", "campo:p20b", "campo:26"]));
    expect(col).not.toContain("campo:18");
    for (const k of col) expect(Math.abs((cajas.get(k) as CajaMm).x - x17)).toBeLessThanOrEqual(2);
  });

  it("el recuadro elige lo que toca", () => {
    const c15 = cajas.get("campo:15") as CajaMm;
    const c14 = cajas.get("campo:14") as CajaMm;
    expect(enRecuadro(cajas, { x: c15.x, y: c15.y, ancho: c14.x + c14.ancho - c15.x, alto: 1 })).toEqual(["campo:14", "campo:15"]);
  });
});

describe("imán y guías", () => {
  it("imán a 0,5 / 1 / 5 mm; apagado deja décimas", () => {
    expect([imantar(12.26, 0.5), imantar(12.26, 1), imantar(12.6, 5), imantar(12.26, 0)]).toEqual([12.5, 12, 15, 12.3]);
  });

  it("se pega al borde o al centro más cercano y dice dónde dibujar la línea", () => {
    const g = guiasDeAlineacion(caja(20.6, 50, 10, 4), [caja(20, 10, 30, 4), caja(80, 51.3, 10, 4)], 1);
    expect(g.dx).toBeCloseTo(-0.6);
    expect(g.guias.x).toEqual([20]);
    /* centro 52 → borde 51,3 del otro: −0,7 (el 1,3 de los bordes pasa la tolerancia) */
    expect(g.dy).toBeCloseTo(-0.7);
    expect(g.guias.y).toEqual([51.3]);
    const lejos = guiasDeAlineacion(caja(60, 200), [caja(0, 0)], 1);
    expect(lejos).toEqual({ dx: 0, dy: 0, guias: { x: [], y: [] } });
  });
});

describe("deshacer y rehacer", () => {
  it("guarda hasta el tope, deshace, rehace y un cambio nuevo borra lo rehecho", () => {
    let h = historialVacio<number>();
    for (let i = 0; i < 120; i++) h = empujar(h, i);
    expect(h.pasado).toHaveLength(100);
    const d = deshacer(h, 120);
    expect(d?.valor).toBe(119);
    const r = rehacer(d!.h, 119);
    expect(r?.valor).toBe(120);
    expect(empujar(d!.h, 119).futuro).toEqual([]);
    expect(deshacer(historialVacio<number>(), 1)).toBeNull();
  });
});

describe("lupa", () => {
  it("de a 25 % entre 25 % y 400 %, también desde un «ajustar» que cae entre dos", () => {
    expect([zoomSiguiente(1, 1), zoomSiguiente(1, -1), zoomSiguiente(0.83, 1), zoomSiguiente(0.83, -1)]).toEqual([1.25, 0.75, 1, 0.75]);
    expect([zoomSiguiente(4, 1), zoomSiguiente(0.25, -1)]).toEqual([4, 0.25]);
  });

  it("«hoja completa» hace entrar ancho Y alto; «ajustar» sólo el ancho", () => {
    const hoja = { anchoMm: 210, altoMm: 297 };
    const ancho = zoomQueEntra(800, 500, hoja, "ancho");
    const completa = zoomQueEntra(800, 500, hoja, "hoja");
    expect(hoja.anchoMm * ancho * (96 / 25.4)).toBeCloseTo(800, 0);
    expect(hoja.altoMm * completa * (96 / 25.4)).toBeCloseTo(500, 0);
    expect(completa).toBeLessThan(ancho);
  });
});
