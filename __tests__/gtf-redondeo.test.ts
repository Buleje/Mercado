/**
 * El redondeo de la GTF (Brandon 2026-10-03): cada fila (científico + tipo) se
 * redondea a 3 decimales HALF_UP y los totales son la suma de esas filas.
 * Fixture: la GTF real de 39 filas (31,188 m³), donde el sistema daba 31,185.
 */
import { describe, expect, it } from "vitest";
import {
  filasGTF,
  m3DeLinea,
  m3OficialDeFila,
  ptDeLinea,
  ptExactoDeLinea,
  redondearGTF,
  sumaExacta,
  totalizarGTF,
} from "@/lib/forestal/gtf-redondeo";
import { GTF_REAL } from "./fixtures/gtf-real-2026-10-03";

describe("redondearGTF (HALF_UP a 3 decimales)", () => {
  it("0,0955 → 0,096 y 0,0954 → 0,095", () => {
    expect(redondearGTF(0.0955)).toBe(0.096);
    expect(redondearGTF(0.0954)).toBe(0.095);
  });

  it("bordes donde el float se equivoca: 1,0005 → 1,001; 2,6745 → 2,675; texto y nulos", () => {
    expect(redondearGTF(1.0005)).toBe(1.001);
    expect(redondearGTF(2.6745)).toBe(2.675);
    expect(redondearGTF("31.1875")).toBe(31.188);
    expect(redondearGTF(null)).toBe(0);
    expect(redondearGTF(Number.NaN)).toBe(0);
  });

  it("negativos: la mitad se aleja del cero", () => {
    expect(redondearGTF(-0.0955)).toBe(-0.096);
  });
});

describe("la GTF real del 2026-10-03", () => {
  it("39 filas · 2 082 piezas · 31,188 m³", () => {
    const t = totalizarGTF(GTF_REAL);
    expect(t.filas).toBe(39);
    expect(t.piezas).toBe(2082);
    expect(t.m3).toBe(31.188);
  });

  it("página 1 (Cachimbo + Ana Caspi) = 5,633 y página 2 = 25,555", () => {
    expect(totalizarGTF(GTF_REAL.filter((f) => f.pagina === 1)).m3).toBe(5.633);
    expect(totalizarGTF(GTF_REAL.filter((f) => f.pagina === 2)).m3).toBe(25.555);
  });

  it("reproduce el error: sumar crudo da 31,185; fila por fila da 31,188", () => {
    // Cada fila llega con dos piezas que suman 0,000077 menos que su valor
    // impreso: cada una redondea a lo mismo, pero el arrastre suma 0,003.
    const piezas = GTF_REAL.flatMap((f, i) => {
      const crudo = f.m3 - 0.000077;
      return [
        { fila: i, m3: crudo * 0.6 },
        { fila: i, m3: crudo * 0.4 },
      ];
    });
    const crudoTotal = redondearGTF(sumaExacta(piezas.map((p) => p.m3)));
    expect(crudoTotal).toBe(31.185);

    const filas = filasGTF(piezas, (p) => String(p.fila), (p) => p.m3);
    expect(filas.map((f) => f.m3)).toEqual(GTF_REAL.map((f) => f.m3));
    expect(totalizarGTF(filas).m3).toBe(31.188);
  });
});

describe("filas y piezas", () => {
  it("m3OficialDeFila suma exacto y redondea UNA vez", () => {
    // 0,1 + 0,2 en float es 0,30000000000000004
    expect(m3OficialDeFila([0.1, 0.2])).toBe(0.3);
    expect(m3OficialDeFila([0.00025, 0.00025])).toBe(0.001);
  });

  it("filasGTF agrupa por la clave en orden de aparición y suma piezas enteras", () => {
    const f = filasGTF(
      [
        { k: "Copal|TABLA", v: 0.05, n: 9 },
        { k: "Cumala|COMERCIAL", v: 1.5, n: 10 },
        { k: "Copal|TABLA", v: 0.046, n: 9 },
      ],
      (p) => p.k,
      (p) => p.v,
      (p) => p.n,
    );
    expect(f.map((x) => [x.clave, x.m3, x.piezas])).toEqual([
      ["Copal|TABLA", 0.096, 18],
      ["Cumala|COMERCIAL", 1.5, 10],
    ]);
  });

  it("m³ de la línea = el del sistema (PT a 2 decimales ÷ 424, a 4 decimales), como está en SERFOR", () => {
    // 3 piezas de 1″ × 4″ × 7′: PT = 7 → m³ = 7/424 = 0,0165 (no 0,016509).
    const p = { cantidad: 3, espesor: 1, ancho: 4, largo: 7, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const, m3: 0, pieTablar: 0 };
    expect(ptDeLinea(p).toNumber()).toBe(7);
    expect(m3DeLinea(p).toNumber()).toBe(0.0165);
    // Un PT que no cierra: 1 × 1 × 1 / 12 = 0,08333… → 0,08 PT en la línea; el
    // Anexo 04 en pie tablar sigue imprimiendo el exacto.
    const q = { ...p, cantidad: 1, ancho: 1, largo: 1 };
    expect(ptDeLinea(q).toNumber()).toBe(0.08);
    expect(ptExactoDeLinea(q).toDecimalPlaces(6).toNumber()).toBe(0.083333);
    // La línea que ya trae su m³/PT (el reparto la prorratea al partirla) usa ESOS.
    expect(m3DeLinea({ ...p, m3: 0.0123 }).toNumber()).toBe(0.0123);
    expect(ptDeLinea({ ...p, pieTablar: 5.21 }).toNumber()).toBe(5.21);
  });

  it("la fila oficial sale de las líneas del sistema: 7 filas de la GTF real ya no se mueven", () => {
    // Una fila cuya Σ de líneas (4 decimales) es 0,1625 → 0,163; desde el PT
    // exacto daba 0,16249… → 0,162 (el 0,005 de Brandon, 2026-10-03).
    const lineas = [0.0812, 0.0813].map((m3) => ({ cantidad: 1, espesor: 1, ancho: 1, largo: 1, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const, m3, pieTablar: 0 }));
    expect(m3OficialDeFila(lineas.map(m3DeLinea))).toBe(0.163);
  });
});

describe("la GTF que imprime el sistema (tabla 37a–37g)", () => {
  it("con la guía real: 39 filas y «Volumen Total: 31.188», aunque los asientos sumen 31,185 crudos", async () => {
    const { tablaProductos, volumenTotalDeLaGuia } = await import("@/lib/forestal/ctp-gtf-formato");
    // Cada fila llega en DOS asientos de la misma especie y producto, con el
    // arrastre de 0,000077 m³ que hacía que la suma cruda diera 31,185.
    const lineas = GTF_REAL.flatMap((f) => {
      const crudo = f.m3 - 0.000077;
      const base = { cientifico: f.cientifico, comun: f.comun, tipoProducto: `MADERA ASERRADA (${f.tipo})`, presentacion: "PIEZAS", unidad: "Metros Cúbicos" };
      return [
        { ...base, cantidad: Math.floor(f.piezas / 2), total: crudo * 0.6 },
        { ...base, cantidad: f.piezas - Math.floor(f.piezas / 2), total: crudo * 0.4 },
      ];
    });
    const html = tablaProductos(lineas);
    expect((html.match(/<tr>\s*<td>/g) ?? []).length).toBe(39);
    expect(html).toContain('<td class="num tot">31.188</td>');
    expect(html).not.toContain("31.185");
    expect(volumenTotalDeLaGuia(lineas)).toBe(31.188);
    // La fila de Copal COMERCIAL se imprime con su valor oficial.
    expect(html).toContain("Protium spruceanum (Benth.) Engl.");
    expect(html).toMatch(/MADERA ASERRADA \(COMERCIAL\)<\/td>[\s\S]*?<td class="num">0\.096<\/td>/);
  });
});

describe("repartir las filas oficiales entre otras tablas (mayor resto)", () => {
  it("repartirAlTotal: suma EXACTO el total, en milésimos enteros", async () => {
    const { repartirAlTotal } = await import("@/lib/forestal/gtf-redondeo");
    // 3 partes iguales de 0,1 → 0,1 oficial: 0,034 + 0,033 + 0,033
    expect(repartirAlTotal([1, 1, 1], 0.1)).toEqual([0.034, 0.033, 0.033]);
    const r = repartirAlTotal([0.0165, 0.0035, 0.0566], 0.078);
    expect(Math.round(r.reduce((a, v) => a + v, 0) * 1000)).toBe(78);
    expect(repartirAlTotal([0, 0], 0.005)).toEqual([0.005, 0]);
    expect(repartirAlTotal([], 1)).toEqual([]);
  });

  it("repartirFilasGTF: cualquier tabla armada con las partes suma el total de las filas", async () => {
    const { repartirFilasGTF, filaGtf } = await import("@/lib/forestal/gtf-redondeo");
    // Una fila (Tornillo Comercial) con 3 medidas cuyo redondeo propio suma de más.
    const partes = [
      { fila: filaGtf("Tornillo", "Comercial"), parte: "2x6x6", exacto: 0.0005 * 3 },
      { fila: filaGtf("Tornillo", "Comercial"), parte: "2x6x8", exacto: 0.0005 * 3 },
      { fila: filaGtf("TORNILLO", "Comercial"), parte: "2x6x10", exacto: 0.0005 * 3 },
      { fila: filaGtf("Tornillo", "Tabla"), parte: "1x4x8", exacto: 0.0124 },
    ];
    const r = repartirFilasGTF(partes);
    // «Tornillo» y «TORNILLO» son la misma fila: 0,0045 → 0,005 oficial.
    expect(r.porFila.get(filaGtf("tornillo", "comercial"))).toBe(0.005);
    expect(r.total).toBe(0.017);
    const sumaPartes = Math.round([...r.porParte.values()].reduce((a, v) => a + v, 0) * 1000) / 1000;
    expect(sumaPartes).toBe(r.total);
  });
});
