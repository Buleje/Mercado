/**
 * «Resumen interno» de una GTF del Libro TH (Brandon 08-10): R1 por especie y
 * por árbol, R2 cuadre (declara · suma · libro), R3 dónde está cada troza y R4
 * saldo del permiso antes y después. Funciones puras + la hoja.
 */
import { describe, expect, it } from "vitest";
import { resumenInterno, r1, r2, r3, r4Saldo, diametroDe, type EntradaResumenInterno, type LineaDelResumen, type PiezaDelResumen } from "@/lib/forestal/gtf-resumen-interno";
import { contenidoQrResumen, hojaResumenInterno, qrResumenInterno } from "@/lib/forestal/gtf-resumen-interno-print";
import { declaradoDeLaGuia, lineaDelResumen, pasosCtp, permisoDeLaGuia, piezasDelResumen } from "@/lib/forestal/gtf-resumen-interno-datos";

const pieza = (codigo: string, extra: Partial<PiezaDelResumen> = {}): PiezaDelResumen => ({
  codigo, codigoGuia: null, arbol: null, especie: "TORNILLO", d1M: 0.5, d2M: 0.4, largoM: 3, m3: 0.5, ...extra,
});
const linea = (gtf: string | null, dia: string, codigo: string | null, m3: number | null, extra: Partial<LineaDelResumen> = {}): LineaDelResumen => ({
  gtfNumber: gtf, dia, trozaCode: codigo, m3, arbol: null, trozadoId: codigo ? `tz-${codigo}` : null, ...extra,
});

const GUIA = "019-001-0000002";
const base = (over: Partial<EntradaResumenInterno> = {}): EntradaResumenInterno => ({
  guia: { gtfNumber: GUIA, gtfDate: "2026-10-05", declaradoM3: 1.5, declaradoTrozas: 3, fuenteDeclarado: "serfor" },
  piezas: [
    pieza("12A", { arbol: "12", d1M: 0.6, d2M: 0.4, largoM: 4, m3: 0.6 }),
    pieza("12B", { arbol: "12", d1M: 0.5, d2M: 0.5, largoM: 2, m3: 0.4 }),
    pieza("7A", { especie: "CUMALA", d1M: 0.3, d2M: null, largoM: 3, m3: 0.5, codigoGuia: "7-A" }),
  ],
  lineasDeLaGuia: [linea(GUIA, "2026-10-05", "12A", 0.6), linea(GUIA, "2026-10-05", "12B", 0.4), linea(GUIA, "2026-10-05", "7A", 0.5, { arbol: "7" })],
  lineasDelPermiso: null,
  autorizadoM3: null,
  ctp: null,
  ...over,
});

describe("R1 · por especie y por árbol", () => {
  it("Ø = promedio de las dos puntas; con una sola, ésa", () => {
    expect(diametroDe({ d1M: 0.6, d2M: 0.4 })).toBeCloseTo(0.5);
    expect(diametroDe({ d1M: 0.3, d2M: null })).toBeCloseTo(0.3);
    expect(diametroDe({ d1M: null, d2M: null })).toBeNull();
  });

  it("agrupa por especie (mayor m³ primero) con trozas, m³ y rangos", () => {
    const { porEspecie, total } = r1(base().piezas);
    expect(porEspecie.map((f) => f.clave)).toEqual(["TORNILLO", "CUMALA"]);
    const tor = porEspecie[0];
    expect(tor.trozas).toBe(2);
    expect(tor.m3).toBeCloseTo(1.0);
    expect(tor.diametro?.min).toBeCloseTo(0.5);
    expect(tor.diametro?.max).toBeCloseTo(0.5);
    expect(tor.largo).toEqual({ min: 2, prom: 3, max: 4 });
    expect(total.trozas).toBe(3);
    expect(total.m3).toBeCloseTo(1.5);
  });

  it("el árbol sale de la guía, si no del libro, si no del código", () => {
    const { porArbol } = r1(base().piezas, new Map([["7A", "7"]]));
    expect(porArbol.map((f) => [f.clave, f.trozas])).toEqual([["7", 1], ["12", 2]]);
    const sinLibro = r1([pieza("85A"), pieza("9-B")]).porArbol.map((f) => f.clave);
    expect(sinLibro).toEqual(["9", "85"]);
  });
});

describe("R2 · cuadre", () => {
  it("declara = suma = libro → cuadra", () => {
    const c = r2(base());
    expect(c.suma).toEqual({ m3: 1.5, trozas: 3 });
    expect(c.libro).toEqual({ m3: 1.5, trozas: 3, sinMedida: 0 });
    expect(c.difSumaM3).toBe(0);
    expect(c.cuadra).toBe(true);
  });

  it("dice la diferencia en m³ y en trozas cuando el libro no tiene una", () => {
    const c = r2(base({ lineasDeLaGuia: base().lineasDeLaGuia.slice(0, 2) }));
    expect(c.difLibroM3).toBeCloseTo(-0.5);
    expect(c.difLibroTrozas).toBe(-1);
    expect(c.cuadra).toBe(false);
  });

  it("tolerancia en la unidad del negocio: 0,0004 m³ no es diferencia; 0,001 sí", () => {
    expect(r2(base({ guia: { ...base().guia, declaradoM3: 1.5004 } })).cuadra).toBe(true);
    expect(r2(base({ guia: { ...base().guia, declaradoM3: 1.501 } })).cuadra).toBe(false);
  });

  it("una línea del libro sin medida no cuadra (se dice cuántas)", () => {
    const c = r2(base({ lineasDeLaGuia: [...base().lineasDeLaGuia.slice(0, 2), linea(GUIA, "2026-10-05", "7A", null)] }));
    expect(c.libro.sinMedida).toBe(1);
    expect(c.cuadra).toBe(false);
  });
});

describe("R3 · dónde está cada troza hoy", () => {
  it("Blas: 22 despachadas, 0 recibidas (el CTP no tiene ninguna)", () => {
    const piezas = Array.from({ length: 22 }, (_, i) => pieza(`${i + 1}A`, { m3: 0.92 }));
    const lineas = piezas.map((p) => linea("019-001-0000001", "2025-10-09", p.codigo, 0.92));
    const d = r3({ piezas, lineasDeLaGuia: lineas, ctp: new Map() });
    expect(d.despachadas).toBe(22);
    expect(d.recibidas).toBe(0);
    expect(d.aserradas).toBe(0);
    expect(d.filas.every((f) => f.estado === "despachada" && f.despachada === "2025-10-09")).toBe(true);
    expect(d.conCtp).toBe(true);
  });

  it("recibida y aserrada con su fecha; los dos códigos siempre", () => {
    const ctp = new Map([
      ["tz-12A", [{ recibida: "2026-10-06", aserrada: "2026-10-07", salioEntera: null }]],
      ["tz-12B", [{ recibida: "2026-10-06", aserrada: null, salioEntera: null }]],
    ]);
    const d = r3({ ...base(), ctp });
    expect(d.filas.map((f) => f.estado)).toEqual(["aserrada", "recibida", "despachada"]);
    expect(d.filas[0].aserrada).toBe("2026-10-07");
    expect(d.filas[2].codigoGuia).toBe("7-A");
    expect(d.filas[2].codigo).toBe("7A");
    expect(d.filas[0].codigoGuia).toBe("12A");
    expect(d.recibidas).toBe(2);
  });

  it("sin Libro CTP no se acusa nada: conCtp=false", () => {
    expect(r3(base()).conCtp).toBe(false);
  });

  it("una troza que no figura en el despacho del libro se dice", () => {
    const d = r3({ ...base(), lineasDeLaGuia: [] });
    expect(d.filas.every((f) => f.estado === "sin_despacho")).toBe(true);
    expect(d.despachadas).toBe(0);
  });
});

describe("R4 · saldo del permiso antes y después de esta guía", () => {
  const permiso = [
    linea("019-001-0000001", "2026-10-01", "1A", 2),
    linea("019-001-0000001", "2026-10-01", "1B", 1),
    /* El mismo día que esta guía, con N° menor: va antes. */
    linea("019-001-0000000", "2026-10-05", "2A", 0.5),
    ...base().lineasDeLaGuia,
    /* Después: no entra. */
    linea("019-001-0000003", "2026-10-09", "3A", 4),
  ];

  it("antes = guías anteriores; después = antes + esta; saldo = autorizado − cada uno", () => {
    const s = r4Saldo(base({ lineasDelPermiso: permiso, autorizadoM3: 10 }));
    expect(s).not.toBeNull();
    expect(s?.antes).toBeCloseTo(3.5);
    expect(s?.estaGuia).toBeCloseTo(1.5);
    expect(s?.despues).toBeCloseTo(5);
    expect(s?.saldoAntes).toBeCloseTo(6.5);
    expect(s?.saldoDespues).toBeCloseTo(5);
    expect(s?.posteriores).toBe(1);
    expect(s?.estaDesdeLaGuia).toBe(false);
  });

  it("sin permiso o sin autorizado no hay saldo que decir", () => {
    expect(r4Saldo(base({ lineasDelPermiso: null, autorizadoM3: 10 }))).toBeNull();
    expect(r4Saldo(base({ lineasDelPermiso: permiso, autorizadoM3: 0 }))).toBeNull();
  });

  it("la guía sin líneas en el libro: «esta guía» = la suma de sus trozas (se dice)", () => {
    const s = r4Saldo(base({ lineasDeLaGuia: [], lineasDelPermiso: permiso.filter((l) => l.gtfNumber !== GUIA), autorizadoM3: 10 }));
    expect(s?.estaDesdeLaGuia).toBe(true);
    expect(s?.estaGuia).toBeCloseTo(1.5);
  });
});

describe("de la API al resumen", () => {
  it("los m³ de un despacho de troza son los de su Trozado", () => {
    const l = lineaDelResumen({
      gtfNumber: GUIA, entryDate: "2026-10-05T00:00:00.000Z", trozaCode: "12A", volumeM3: null, quantity: null, unit: null,
      section: "despacho_troza", treeCode: null,
      trozado: { lineaId: "tz1", lineNo: 4, treeCode: "12", speciesCommon: "TORNILLO", speciesScientific: null, cites: false, diamMayorM: "0.6", diamMenorM: "0.4", lengthM: "4", volumeM3: "0.7854", anulada: false },
    });
    expect(l).toEqual({ gtfNumber: GUIA, dia: "2026-10-05", trozaCode: "12A", m3: 0.7854, arbol: "12", trozadoId: "tz1" });
  });

  it("producto en m³ cuenta su cantidad; en pt no se convierte", () => {
    const p = (unit: string) =>
      lineaDelResumen({ gtfNumber: GUIA, entryDate: "2026-10-05", trozaCode: null, volumeM3: null, quantity: "2.5", unit, section: "despacho_producto", treeCode: null, trozado: null });
    expect(p("m3").m3).toBe(2.5);
    expect(p("pt").m3).toBeNull();
  });

  it("los dos códigos de la lista: el de la guía cae al único si no lo trae", () => {
    const ps = piezasDelResumen([{ code: "12A-0001", codigoGuia: "12A", species: "TORNILLO", volumeM3: 1 }, { code: "13A" }]);
    expect(ps[0]).toMatchObject({ codigo: "12A-0001", codigoGuia: "12A" });
    expect(ps[1]).toMatchObject({ codigo: "13A", codigoGuia: null });
  });

  it("declara: la ficha de SERFOR si se importó; si no, el registro", () => {
    expect(declaradoDeLaGuia({ gtfDatos: null, volumenTotalM3: "20.3030", piezasTotal: 22 })).toEqual({ declaradoM3: 20.303, declaradoTrozas: 22, fuenteDeclarado: "registro" });
    const ficha = { fichaSerfor: { gtfNumber: "019-001-0000001", volumenTotal: 20.303, productos: [{ comun: "TORNILLO", cantidad: 22, volumen: 20.303 }] } };
    expect(declaradoDeLaGuia({ gtfDatos: ficha, volumenTotalM3: "19", piezasTotal: 21 })).toEqual({ declaradoM3: 20.303, declaradoTrozas: 22, fuenteDeclarado: "serfor" });
  });

  it("el permiso: el de la guía; si no tiene, el único de sus líneas", () => {
    expect(permisoDeLaGuia("p1", [{ planId: "p2" }])).toBe("p1");
    expect(permisoDeLaGuia(null, [{ planId: "p2" }, { planId: "p2" }, { planId: null }])).toBe("p2");
    expect(permisoDeLaGuia(null, [{ planId: "p2" }, { planId: "p3" }])).toBeNull();
  });

  it("las piezas del CTP por trozado", () => {
    const m = pasosCtp([
      { trozadoId: "t1", llegada: { dia: "2026-10-06", fuente: "pieza" }, corrida: null, despacho: null } as never,
      { trozadoId: "t1", llegada: { dia: "2026-10-06", fuente: "pieza" }, corrida: { lineNo: 1, dia: "2026-10-08", producto: null, cantidad: null, unidad: null }, despacho: null } as never,
    ]);
    expect(m.get("t1")).toEqual([
      { recibida: "2026-10-06", aserrada: null, salioEntera: null },
      { recibida: "2026-10-06", aserrada: "2026-10-08", salioEntera: null },
    ]);
  });
});

describe("la hoja", () => {
  const r = resumenInterno(base({ lineasDelPermiso: base().lineasDeLaGuia, autorizadoM3: 10 }));
  const hoja = hojaResumenInterno(
    { gtfNumber: GUIA, gtfDate: "2026-10-05", titular: "Blas <SAC>", permiso: "19-SEC/REG-PLT-2025-096", listaTrozasNro: "001-0000002", destino: null, anulada: null },
    r,
    "<svg></svg>",
  );

  it("trae R1-R4, los dos códigos y el N° de lista", () => {
    for (const t of ["R1 · Por especie y por árbol", "R2 · Cuadre", "R3 · Dónde está cada troza hoy", "R4 · Saldo del permiso", "Código en la guía", "Código único", "Lista de trozas N° 001-0000002"]) {
      expect(hoja.html).toContain(t);
    }
    expect(hoja.html).toContain("<svg></svg>");
    expect(hoja.archivo).toBe(`Resumen interno GTF ${GUIA}`);
  });

  it("escapa lo que viene de la base", () => {
    expect(hoja.html).toContain("Blas &lt;SAC&gt;");
    expect(hoja.html).not.toContain("Blas <SAC>");
  });

  it("el QR sigue el patrón de verificación interna", () => {
    expect(qrResumenInterno({ gtfNumber: GUIA, titularName: "Blas", tituloHabilitante: "TH-1", gtfDate: "2026-10-05" }, 1.5)).toBe(
      `BSM-GTF|N:${GUIA}|TIT:Blas|TH:TH-1|VOL:1.5000m3|F:05/10/2026`,
    );
  });

  it("el QR abre la lista pública de la guía con la base del negocio; sin línea o sin base, la cadena interna", () => {
    const g = { gtfNumber: GUIA, titularName: "Blas", tituloHabilitante: "TH-1", gtfDate: "2026-10-05" };
    expect(contenidoQrResumen(g, 1.5, { base: "https://blas.example.pe/", lineaDespachoId: "lin/1" })).toBe(
      "https://blas.example.pe/verificar/guia/lin%2F1",
    );
    expect(contenidoQrResumen(g, 1.5, { base: null, lineaDespachoId: "lin1" })).toBe(qrResumenInterno(g, 1.5));
    expect(contenidoQrResumen(g, 1.5, { base: "https://blas.example.pe", lineaDespachoId: null })).toBe(qrResumenInterno(g, 1.5));
  });
});
