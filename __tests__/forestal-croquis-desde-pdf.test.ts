import { describe, expect, it } from "vitest";
import {
  aplicarMaquinasPdf, areaComponenteM2, ladoMarcaM, numeroDeCodigo, proponerCroquisDesdePdf, tipoSugerido, zonasDesdeComponentes,
  type TextoPdf,
} from "@/lib/forestal/croquis-desde-pdf";
import { areaPoligono, subtrazadosCerrados, trazadosDeOperadores, type Matriz, type TrazadoPdf } from "@/lib/forestal/croquis-pdf-contornos";
import { LEYENDA_V9, MARCAS_V9, V9, ZONAS_V9, textosV9, type TextoV9 } from "./fixtures/croquis-v9-pdf";

/** Como lo entrega pdf.js (ancho aproximado: medio cuerpo por letra). */
const aPdf = (t: TextoV9): TextoPdf => {
  const w = 0.55 * t.h * t.str.length;
  const x = t.alinea === "izq" ? t.px : t.alinea === "centro" ? t.px - w / 2 : t.px - w;
  return { str: t.str, x, y: t.py + 0.36 * t.h, w, h: t.h, angulo: t.angulo ?? 0 };
};
const hoja = { ancho: V9.ancho, alto: V9.alto };
const v9 = () => proponerCroquisDesdePdf({ textos: textosV9().map(aPdf), hoja });
/** Metros reales de un píxel de la lámina. */
const metros = (px: number, py: number) => ({ x: (px - V9.origen.px) / V9.pxPorM.x, y: (V9.origen.py - py) / V9.pxPorM.y });

describe("croquis desde PDF — lámina tipo v9", () => {
  it("toma la escala de los ejes, las medidas escritas y recorta al terreno", () => {
    const p = v9c();
    expect(p.escaneado).toBe(false);
    expect(p.escala).toBe("ejes");
    expect([p.anchoM, p.altoM, p.medidasDe]).toEqual([54, 48, "texto"]);
    expect(p.recorte.x).toBeCloseTo(139, 0);
    expect(p.recorte.x + p.recorte.w).toBeCloseTo(139 + 54 * 14.28, 0);
    expect(p.recorte.y + p.recorte.h).toBeCloseTo(795, 0);
    expect(p.recorte.y).toBeCloseTo(795 - 48 * 14.27, 0);
    expect(p.avisos).toEqual([]);
  });

  it("lee los 37 nombres de la leyenda y ubica a todos", () => {
    const p = v9();
    expect(p.leyenda).toBe(37);
    expect(p.sinUbicar).toEqual([]);
    const numeros = new Set(p.componentes.map((c) => c.numero));
    expect(numeros.size).toBe(37);
    expect(p.componentes.find((c) => c.numero === 21)?.nombre).toBe(LEYENDA_V9[20]);
  });

  it("cada componente cae a menos de 0,3 m de su círculo", () => {
    const p = v9();
    for (const [n, px, py] of MARCAS_V9) {
      const real = metros(px, py);
      if (real.x < 0 || real.y < 0) continue; // los de afuera van al borde (otro test)
      const cerca = p.componentes.filter((c) => c.numero === n).some((c) => Math.hypot(c.fx * 54 - real.x, c.fy * 48 - real.y) < 0.3);
      expect(cerca, `componente ${n}`).toBe(true);
    }
  });

  it("varios puntos del mismo número; el rótulo de ruta (otra letra) queda sin marcar", () => {
    const p = v9();
    const cinco = p.componentes.filter((c) => c.numero === 5);
    expect(cinco).toHaveLength(4);
    expect(cinco.filter((c) => c.sugerido)).toHaveLength(3);
    expect(cinco.every((c) => c.puntos === 4)).toBe(true);
    expect(p.componentes.filter((c) => c.numero === 17 && c.sugerido)).toHaveLength(2);
    const ruta1 = p.componentes.find((c) => c.numero === 1 && !c.sugerido);
    expect(ruta1 && Math.hypot(ruta1.fx * 54 - metros(475, 352).x, ruta1.fy * 48 - metros(475, 352).y)).toBeLessThan(0.3);
  });

  it("lo de afuera del cerco va al borde y se avisa; la caja del proceso y la escala gráfica no son marcas", () => {
    const p = v9();
    const via = p.componentes.find((c) => c.numero === 20)!;
    expect(via.fuera).toBe(true);
    expect(via.fx).toBe(0);
    const cerco = p.componentes.find((c) => c.numero === 1 && c.sugerido)!;
    expect(cerco.fuera).toBe(true);
    // El «1», «2», «3», «4» de la caja del proceso y el 2/4/6/8 de la escala no suman puntos.
    expect(p.componentes.filter((c) => c.numero === 2)).toHaveLength(2); // marca + rótulo de ruta
    expect(p.componentes.filter((c) => c.numero === 6)).toHaveLength(1);
    expect(p.componentes.filter((c) => c.numero === 8)).toHaveLength(1);
  });

  it("el número pegado a un rótulo («34» junto a «Cámara 2») sigue siendo marca", () => {
    const p = v9();
    expect(p.componentes.filter((c) => c.numero === 34)).toHaveLength(1);
  });

  it("sugiere el tipo por el nombre", () => {
    const tipo = (n: number) => v9().componentes.find((c) => c.numero === n)!.tipo;
    expect(tipo(8)).toBe("patio_trozas");
    expect(tipo(14)).toBe("patio_trozas");
    expect(tipo(23)).toBe("aserrado");
    expect(tipo(36)).toBe("aserrado");
    expect(tipo(31)).toBe("entrada");
    expect(tipo(32)).toBe("oficina");
    expect(tipo(21)).toBe("otro"); // cámara (oficina) es una cámara
    expect(tipo(5)).toBe("patio_producto");
    expect(tipo(30)).toBe("patio_producto");
    expect(tipo(27)).toBe("otro");
  });

  it("las máquinas D1–D7 con su rótulo de abajo", () => {
    const p = v9();
    expect(p.maquinas.map((m) => m.codigo)).toEqual(["D1", "D2", "D3", "D4", "D5", "D6", "D7"]);
    const d4 = p.maquinas.find((m) => m.codigo === "D4")!;
    expect(d4.nombre).toBe("Camión Volvo 1");
    expect(Math.hypot(d4.fx * 54 - metros(339, 262).x, d4.fy * 48 - metros(339, 262).y)).toBeLessThan(0.3);
  });
});

describe("croquis desde PDF — sin ejes, escaneado, pegado", () => {
  it("sin texto = escaneado: solo el fondo", () => {
    const p = proponerCroquisDesdePdf({ textos: [], hoja, pista: { anchoM: 54, altoM: 48 } });
    expect(p.escaneado).toBe(true);
    expect(p.componentes).toEqual([]);
    expect([p.anchoM, p.altoM, p.medidasDe]).toEqual([54, 48, "pista"]);
    expect(p.recorte).toEqual({ x: 0, y: 0, w: V9.ancho, h: V9.alto });
  });

  it("sin ejes: la hoja entera es el terreno y las fracciones son de la hoja", () => {
    const textos: TextoPdf[] = [
      ...["Patio de trozas", "Despuntadora", "Oficina"].flatMap((nombre, i) => [
        { str: String(i + 1), x: 500, y: 40 + 12 * i, w: 4, h: 7 },
        { str: nombre, x: 510, y: 40 + 12 * i, w: 50, h: 7 },
      ]),
      { str: "1", x: 98, y: 102.52, w: 4, h: 7 }, // centro (100, 100)
      { str: "3", x: 298, y: 302.52, w: 4, h: 7 },
    ];
    const p = proponerCroquisDesdePdf({ textos, hoja: { ancho: 600, alto: 400 }, pista: { anchoM: 30, altoM: 20 } });
    expect(p.escala).toBe("hoja");
    expect(p.avisos[0]).toMatch(/ejes/);
    expect([p.anchoM, p.altoM]).toEqual([30, 20]);
    const uno = p.componentes.find((c) => c.numero === 1)!;
    expect(uno.fx).toBeCloseTo(100 / 600, 3);
    expect(uno.fy).toBeCloseTo(1 - 100 / 400, 3);
    expect(p.sinUbicar).toEqual([{ numero: 2, nombre: "Despuntadora" }]);
  });

  it("un número pegado a una palabra («Cámara 1») no es marca", () => {
    const textos: TextoPdf[] = [
      ...["Cerco", "Malla", "Losa"].flatMap((nombre, i) => [
        { str: String(i + 1), x: 500, y: 40 + 12 * i, w: 4, h: 7 },
        { str: nombre, x: 510, y: 40 + 12 * i, w: 30, h: 7 },
      ]),
      { str: "Cámara", x: 50, y: 200, w: 24, h: 7 },
      { str: "1", x: 76, y: 200, w: 4, h: 7 },
    ];
    const p = proponerCroquisDesdePdf({ textos, hoja: { ancho: 600, alto: 400 } });
    expect(p.componentes).toEqual([]);
  });
});

describe("de la propuesta a zonas y máquinas", () => {
  it("marca cuadrada dentro del terreno, código tipo + número y letra si se repite", () => {
    const zs = zonasDesdeComponentes([
      { numero: 8, nombre: "Patio de trozas", tipo: "patio_trozas", fx: 0.5, fy: 0.5 },
      { numero: 5, nombre: "Madera apilada", tipo: "patio_producto", fx: 0, fy: 1 },
      { numero: 5, nombre: "Madera apilada", tipo: "patio_producto", fx: 0.2, fy: 0.2 },
    ], { anchoM: 54, altoM: 48 });
    expect(zs.map((z) => z.codigo)).toEqual(["PT-08", "PP-05a", "PP-05b"]);
    expect(JSON.parse(zs[0].poligono)).toEqual([[23, 26], [23, 28], [25, 28], [25, 26]]);
    // En la esquina: no se sale del terreno.
    expect(JSON.parse(zs[1].poligono)).toEqual([[46, 0], [46, 2], [48, 2], [48, 0]]);
    expect(ladoMarcaM(54, 48)).toBe(2);
    expect(ladoMarcaM(10, 8)).toBe(1);
  });

  it("número de la leyenda en un código de zona", () => {
    expect(numeroDeCodigo("PT-08")).toBe(8);
    expect(numeroDeCodigo("pp-05b")).toBe(5);
    expect(numeroDeCodigo("PP-05-3")).toBe(5);
    expect(numeroDeCodigo("Patio")).toBeNull();
    expect(tipoSugerido("Portón principal")).toBe("entrada");
  });

  it("máquinas: mueve las que hay (el nombre tipeado manda) y agrega las nuevas", () => {
    const r = aplicarMaquinasPdf(
      [{ codigo: "D1", nombre: "Mi cargador", x: 0, y: 0, fuera: true }, { codigo: "D9", nombre: "Otra", x: 1, y: 1, fuera: true }],
      [{ codigo: "D1", nombre: "Cargador frontal", fx: 0.5, fy: 0.25 }, { codigo: "D2", nombre: null, fx: 0.1, fy: 0.1 }],
      { anchoM: 54, altoM: 48 },
    );
    expect(r).toEqual([
      { codigo: "D1", nombre: "Mi cargador", x: 27, y: 12, fuera: false },
      { codigo: "D9", nombre: "Otra", x: 1, y: 1, fuera: true },
      { codigo: "D2", nombre: "D2", x: 5.4, y: 4.8, fuera: false },
    ]);
  });
});

// ─── Contornos reales desde los trazados ───────────────────────────────────

const rect = (x0: number, y0: number, x1: number, y1: number): TrazadoPdf => ({ puntos: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const circulo = (cx: number, cy: number, r: number): TrazadoPdf => ({
  puntos: Array.from({ length: 16 }, (_, k) => [cx + r * Math.cos((k * Math.PI) / 8), cy + r * Math.sin((k * Math.PI) / 8)] as [number, number]),
});
/** Lo que trae un PDF vectorial de la v9: los rectángulos, el círculo de cada número, el borde del terreno, la hoja y la caja de la leyenda. */
const trazadosV9 = (): TrazadoPdf[] => [
  rect(0, 0, V9.ancho, V9.alto),
  rect(139, 110, 910, 795),
  rect(1000, 55, 1275, 550),
  ...ZONAS_V9.map(([, , x0, y0, x1, y1]) => rect(x0, y0, x1, y1)),
  ...MARCAS_V9.map(([, px, py]) => circulo(px, py, 9)),
];
const v9c = () => proponerCroquisDesdePdf({ textos: textosV9().map(aPdf), hoja, trazados: trazadosV9() });
/** La caja [fx0, fy0, fx1, fy1] de un rectángulo de la lámina en fracción del terreno recortado. */
const cajaFrac = (x0: number, y0: number, x1: number, y1: number, p: ReturnType<typeof v9c>) => {
  const r = p.recorte, l = (n: number) => Math.min(1, Math.max(0, n));
  return [l((x0 - r.x) / r.w), l((r.y + r.h - y1) / r.h), l((x1 - r.x) / r.w), l((r.y + r.h - y0) / r.h)];
};
const cajaDe = (pts: [number, number][]) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];

describe("contornos — trazados de pdf.js", () => {
  const vista: Matriz = [1, 0, 0, -1, 0, 300];

  it("rectángulo cerrado, círculo de curvas, línea abierta y relleno que cierra solo", () => {
    expect(subtrazadosCerrados([0, 0, 0, 1, 100, 0, 1, 100, 40, 1, 0, 40, 4], vista, false)).toEqual([[[0, 300], [100, 300], [100, 260], [0, 260]]]);
    expect(subtrazadosCerrados([0, 0, 0, 1, 50, 50], vista, false)).toEqual([]);
    expect(subtrazadosCerrados([0, 0, 0, 1, 30, 0, 1, 30, 20], vista, true)).toHaveLength(1);
    // Círculo de pdf-lib: 4 curvas, sin closePath, relleno.
    const k = 8 * 0.5523;
    const c = subtrazadosCerrados([0, 192, 150, 2, 192, 150 - k, 200 - k, 142, 200, 142, 2, 200 + k, 142, 208, 150 - k, 208, 150,
      2, 208, 150 + k, 200 + k, 158, 200, 158, 2, 200 - k, 158, 192, 150 + k, 192, 150], vista, true);
    expect(c).toHaveLength(1);
    expect(areaPoligono(c[0])).toBeCloseTo(Math.PI * 64, -0.5);
  });

  it("sigue la matriz (save/transform/restore), ignora el recorte y no repite relleno + borde", () => {
    const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, fill: 22, stroke: 20, fillStroke: 24, endPath: 28, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
    const caja = new Float32Array([0, 0, 0, 1, 100, 0, 1, 100, 40, 1, 0, 40, 4]);
    const t = trazadosDeOperadores(
      [10, 12, 91, 91, 11, 91, 74, 91, 75],
      [null, [1, 0, 0, 1, 50, 60], [24, [caja], null], [20, [caja], null], null, [28, [caja], null], [[2, 0, 0, 2, 0, 0], null], [22, [caja], null], null],
      vista, OPS,
    );
    expect(t.map((x) => cajaDe(x.puntos))).toEqual([[50, 200, 150, 240], [0, 220, 200, 300]]);
  });
});

describe("contornos — lámina tipo v9 con sus rectángulos", () => {
  it("cada número toma su rectángulo (adentro o al lado) con su área real", () => {
    const p = v9c();
    expect(p.trazados).toBeGreaterThan(30);
    for (const [nombre, numero, x0, y0, x1, y1] of ZONAS_V9) {
      if (numero == null) continue;
      const esperado = cajaFrac(x0, y0, x1, y1, p);
      const c = p.componentes.find((k) => k.numero === numero && k.contorno && cajaDe(k.contorno).every((v, i) => Math.abs(v - esperado[i]) < 0.002));
      expect(c, `${numero} ${nombre}`).toBeDefined();
    }
    const ramada = p.componentes.find((c) => c.numero === 3)!;
    expect(ramada.contornoDe).toBe("adentro");
    expect(ramada.encierra).toEqual([4, 5, 7]);
    // 205 × 162 px a 14,28 × 14,27 px/m = 163 m² (fórmula plana).
    expect(areaComponenteM2(ramada, { anchoM: 54, altoM: 48 })).toBeCloseTo((205 / 14.28) * (162 / 14.27), 0);
    expect(p.componentes.find((c) => c.numero === 8)?.contornoDe).toBe("al_lado");
    expect(p.componentes.find((c) => c.numero === 27)?.contornoDe).toBe("adentro");
  });

  it("nunca el círculo del número, el borde del terreno, la hoja ni un trazado para dos", () => {
    const p = v9c();
    const usados = p.componentes.filter((c) => c.contorno).map((c) => JSON.stringify(c.contorno));
    expect(new Set(usados).size).toBe(usados.length);
    for (const c of p.componentes.filter((k) => k.contorno)) {
      const a = areaPoligono(c.contorno!);
      expect(a, `${c.numero}`).toBeGreaterThan(0.0005);
      expect(a, `${c.numero}`).toBeLessThan(0.4);
      expect(c.contorno!.flat().every((v) => v >= 0 && v <= 1)).toBe(true);
    }
    // Sin rectángulo a su alcance: cuadrado (y la revisión dice «sin contorno»).
    for (const n of [1, 2, 9, 18, 21, 22, 26, 31]) expect(p.componentes.find((c) => c.numero === n)?.contorno, `${n}`).toBeNull();
    // Los rótulos de ruta (sin marcar) no se llevan el patio de máquinas.
    expect(p.componentes.filter((c) => !c.sugerido).every((c) => c.contorno === null)).toBe(true);
  });

  it("dos números en un trazado: gana el que nombran los rótulos de adentro", () => {
    const p = v9c();
    // Almacén: el 6 «Almacén de herramientas» y no el 34 «Cámara 2 (esquina del almacén)».
    expect(p.componentes.find((c) => c.numero === 6)?.encierra).toEqual([34]);
    expect(p.componentes.find((c) => c.numero === 34)?.contorno).toBeNull();
    // Techo parabólico: lo encierra casi todo, pero lo nombra su rótulo.
    const techo = p.componentes.find((c) => c.numero === 36)!;
    expect(techo.contornoDe).toBe("adentro");
    expect(techo.encierra.length).toBeGreaterThan(8);
  });

  it("sin trazados (texto sin dibujos o escaneado): todo cuadrado, sin romper", () => {
    const p = v9();
    expect(p.trazados).toBe(0);
    expect(p.componentes.every((c) => c.contorno === null && c.contornoDe === null)).toBe(true);
    expect(p.avisos.some((a) => /trazados/.test(a))).toBe(true);
    const esc = proponerCroquisDesdePdf({ textos: [], hoja, trazados: trazadosV9() });
    expect([esc.escaneado, esc.componentes.length, esc.trazados]).toEqual([true, 0, 0]);
  });

  it("un trazado gigante solo si no hay otro", () => {
    const textos: TextoPdf[] = [
      ...["Patio de maniobras", "Balanza", "Oficina"].flatMap((nombre, i) => [
        { str: String(i + 1), x: 500, y: 40 + 12 * i, w: 4, h: 7 },
        { str: nombre, x: 510, y: 40 + 12 * i, w: 50, h: 7 },
      ]),
      { str: "1", x: 98, y: 102.52, w: 4, h: 7 },
      { str: "2", x: 298, y: 302.52, w: 4, h: 7 },
    ];
    const p = proponerCroquisDesdePdf({
      textos, hoja: { ancho: 600, alto: 400 }, pista: { anchoM: 30, altoM: 20 },
      trazados: [rect(20, 20, 420, 380), rect(260, 280, 340, 330)],
    });
    expect(p.componentes.find((c) => c.numero === 1)?.contornoDe).toBe("grande");
    expect(p.componentes.find((c) => c.numero === 2)?.contornoDe).toBe("adentro");
  });
});

describe("contornos — a zonas en metros", () => {
  it("el contorno pasa a [y, x] en metros; las grandes salen primero y el cuadrado queda de respaldo", () => {
    const zs = zonasDesdeComponentes([
      { numero: 4, nombre: "Losa", tipo: "aserrado", fx: 0.5, fy: 0.5 },
      { numero: 3, nombre: "Ramada", tipo: "patio_producto", fx: 0.1, fy: 0.1, contorno: [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], contornoDe: "adentro" },
    ], { anchoM: 54, altoM: 48 });
    expect(zs.map((z) => z.codigo)).toEqual(["PP-03", "AS-04"]);
    expect(JSON.parse(zs[0].poligono)).toEqual([[0, 0], [0, 27], [24, 27], [24, 0]]);
    expect(zs[0].notas).toMatch(/contorno del plano \(648 m²\) que encierra el número 3/);
    expect(zs[1].notas).toMatch(/marca de 2 × 2 m/);
  });
});
