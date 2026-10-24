/**
 * El ANEXO N° 04 contra el resumen por especie y tipo.
 *
 * Las piezas se cubican por el mismo camino que el cubicador (`cubicarPieza`,
 * PT redondeado a 2 decimales por fila) y el lado «anexo» sale de
 * `construirAnexo04`, el mismo que dibuja la hoja: la prueba compara lo que se
 * vería en las dos pantallas, no una fórmula propia.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { compararAnexoConResumen } from "@/lib/forestal/anexo04-comparar";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie, ...cubicarPieza(dims), ...extra };
}

const LOTE: PiezaCubicada[] = [
  pieza(5, 2, 8, 10, "Tornillo"),
  pieza(3, 2, 6, 10, "Cumala"),
  pieza(8, 2, 4, 10, "Tornillo"),
];

const comparar = (filasAnexo: PiezaCubicada[], referencia: readonly PiezaCubicada[], extra: { especieGlobal?: string; totalManualM3?: number | null } = {}) =>
  compararAnexoConResumen({ filasAnexo, referencia, unidadImpresa: "pt", ...extra });

describe("compararAnexoConResumen", () => {
  it("mismas piezas → todas las líneas exactas y el total cuadra con lo que imprime la hoja", () => {
    const c = comparar(LOTE, LOTE);
    expect(c.filas.map((f) => f.estado)).toEqual(["exacto", "exacto", "exacto"]);
    expect(c.difieren).toBe(0);
    expect(c.total.estado).toBe("exacto");
    const hoja = construirAnexo04(LOTE, { unidadV: "pt", modo: "oficial" });
    expect(c.total.anexo?.piezas).toBe(hoja.totalPiezas);
    expect(c.totalImpresoM3).toBe(hoja.totalM3);
    expect(c.totalDeclaradoM3).toBeNull();
  });

  it("una medida editada en la hoja → esa línea difiere, con signo, y las otras siguen exactas", () => {
    const editadas = LOTE.map((r) => (r.id === LOTE[0].id ? { ...r, largo: 12, ...cubicarPieza({ ...r, largo: 12 }) } : r));
    const c = comparar(editadas, LOTE);
    const tornilloComercial = c.filas.find((f) => f.especie === "Tornillo" && f.tipo === "Comercial");
    expect(tornilloComercial?.estado).toBe("difiere");
    expect(tornilloComercial?.dif.piezas).toBe(0);
    // 5 piezas de 2"×8" pasan de 10' a 12': +5 × 2×8×2/12 = +13,333 PT.
    expect(tornilloComercial?.dif.pt).toBeCloseTo(13.333, 2);
    expect(c.difieren).toBe(1);
    expect(c.exactas).toBe(2);
  });

  it("el PT redondeado por fila del cubicador vs el exacto de la hoja es «redondeo», no «difiere»", () => {
    // 2"×5"×7' = 5,8333 PT: el cubicador guarda 5,83 por fila (lo que muestra
    // Resúmenes y lo que ya está en SERFOR); la hoja en PT imprime 58,333.
    const filas = Array.from({ length: 10 }, () => pieza(1, 2, 5, 7, "Tornillo"));
    const c = comparar(filas, filas);
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0].dif.pt).toBeCloseTo(0.033, 3);
    expect(c.filas[0].dif.m3).toBeCloseTo(0, 6);
    expect(c.filas[0].estado).toBe("redondeo");
    expect(c.difieren).toBe(0);
  });

  it("tolerancia en la unidad del negocio: 0,001 m³ es exacto, 0,002 m³ sin redondeo que lo explique difiere", () => {
    // 4 × 2"×8"×10' = 53,333 PT → fila oficial 0,126 m³ en la hoja. El resumen
    // de referencia viene sin medidas (sólo su m³/PT declarado, mismo tipo).
    const base = pieza(4, 2, 8, 10, "Tornillo");
    const ref = (m3: number, pt = 53.333) => [{ ...base, espesor: 0, tipo: "Comercial" as const, m3, pieTablar: pt }];
    expect(comparar([base], ref(0.127)).filas[0].estado).toBe("exacto");
    expect(comparar([base], ref(0.128)).filas[0].estado).toBe("difiere");
    expect(comparar([base], ref(0.126, 53.343)).filas[0].estado).toBe("exacto");
  });

  it("una especie·tipo que no llegó al papel (otro dueño) queda al final, con el anexo vacío", () => {
    const c = comparar(LOTE.filter((r) => r.especie !== "Cumala"), LOTE);
    const ultima = c.filas.at(-1);
    expect(ultima?.especie).toBe("Cumala");
    expect(ultima?.anexo).toBeNull();
    expect(ultima?.estado).toBe("difiere");
    expect(ultima?.dif.piezas).toBe(-3);
    expect(c.total.estado).toBe("difiere");
  });

  it("más de 35 medidas: los bloques de continuación se suman en UNA línea y dicen dónde van", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => pieza(1, 2, 8, 10 + (i % 3), "Tornillo"));
    const c = comparar(muchas, muchas);
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0].anexo?.filas).toBe(40);
    expect(c.filas[0].anexo?.piezas).toBe(40);
    expect(c.filas[0].ubicacion).toEqual(["Hoja 1 · bloque 1", "Hoja 1 · bloque 2"]);
    expect(c.filas[0].estado).toBe("exacto");
  });

  it("la pieza sin especie va con la especie del lote en los dos lados (como en el papel)", () => {
    const filas = [pieza(2, 2, 8, 10, "Tornillo"), pieza(3, 2, 8, 10)];
    const c = comparar(filas, filas, { especieGlobal: "Tornillo" });
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0].resumen?.piezas).toBe(5);
    expect(c.filas[0].anexo?.piezas).toBe(5);
  });

  it("con el (3) VOLUMEN TOTAL declarado a mano lo informa aparte, sin tocar las líneas", () => {
    const c = comparar(LOTE, LOTE, { totalManualM3: 0.4 });
    expect(c.totalDeclaradoM3).toBe(0.4);
    expect(c.totalImpresoM3).toBe(0.4);
    expect(c.difieren).toBe(0);
  });
});
