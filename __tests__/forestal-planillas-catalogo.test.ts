/**
 * Planillas de campo (17-10): el catálogo, la hoja impresa y la lectura.
 * Puro: sin red ni base.
 */
import { describe, expect, it } from "vitest";
import {
  MARCA_SALIDA,
  PLANILLAS,
  PLANILLAS_LECTURA_GENERICA,
  bloqueDeSalida,
  columnasAMano,
  encabezadosExcel,
  parteEditable,
  planillaPorId,
  promptParaLeer,
  salidaDePlanilla,
} from "@/lib/forestal/planillas/catalogo";
import { altoDeRenglonMm, htmlDePlanilla } from "@/lib/forestal/planillas/imprimir";
import { esquemasDeLectura, matrizDeLectura, matrizDeLecturaTexto, normalizarLectura } from "@/lib/forestal/planillas/lectura";
import type { PlanillaCampo, PlanillaId } from "@/lib/forestal/planillas/tipos";
import { interpretarOcrPiezas } from "@/lib/forestal/cubicacion-import";
import { interpretarOcrTrozas } from "@/lib/forestal/cubicacion-trozas-import";
import { cubicarSegun } from "@/lib/forestal/cubicacion-trozas-formula";
import { interpretarProduccion } from "@/lib/forestal/produccion-import";
import { parseCensoFilas, volumenCenso } from "@/lib/forestal/loth-censo-import";

const P = (id: PlanillaId): PlanillaCampo => {
  const p = planillaPorId(id);
  if (!p) throw new Error(`falta ${id}`);
  return p;
};
const ej = (p: PlanillaCampo, clave: string): string => {
  const c = p.columnas.find((x) => x.clave === clave);
  if (!c) throw new Error(`falta la columna ${clave} en ${p.id}`);
  return c.ejemplo;
};

describe("catálogo de planillas", () => {
  it("trae las seis, con ids únicos, y planillaPorId las encuentra", () => {
    expect(PLANILLAS.map((p) => p.id)).toEqual([
      "aserrada-pt",
      "rolliza-smalian",
      "rolliza-oxapampa",
      "conteo-patio",
      "parte-produccion",
      "censo-arboles",
    ]);
    expect(planillaPorId("no-existe")).toBeNull();
    for (const p of PLANILLAS) expect(planillaPorId(p.id)).toBe(p);
  });

  it.each(PLANILLAS.map((p) => [p.id, p] as const))("%s: toda columna a mano aparece en su prompt por clave y título", (_id, p) => {
    for (const c of columnasAMano(p)) {
      expect(p.prompt).toContain(`- ${c.clave}: «${c.titulo}»`);
    }
    // Lo calculado se nombra sólo para decir que NO se lee.
    for (const c of p.columnas.filter((x) => x.calculada)) {
      expect(p.prompt).not.toContain(`- ${c.clave}:`);
      expect(p.prompt).toContain(`«${c.titulo}»`);
    }
    expect(p.prompt).toContain(MARCA_SALIDA);
    expect(p.prompt).toContain("Nunca inventes");
    expect(p.prompt).toContain(`Planilla ${p.nombre}`); // reconoce la hoja por su pie
  });

  it.each(PLANILLAS.map((p) => [p.id, p] as const))("%s: tiene destino, versión, filas y método si cubica", (_id, p) => {
    expect(p.destino).toBeTruthy();
    expect(p.versionPrompt).toBeGreaterThanOrEqual(1);
    expect(p.filasPorHoja).toBeGreaterThanOrEqual(10);
    const cubica = p.columnas.some((c) => c.calculada);
    if (cubica) expect(p.metodo, `${p.id} cubica y no dice cómo`).toBeTruthy();
    for (const c of p.columnas) expect(c.ejemplo, `${p.id}.${c.clave} sin ejemplo`).not.toBe("");
  });

  it("las «filas» piden dudosas y cabecera; las de cubicar piden incierto (la forma de sus rutas)", () => {
    for (const p of PLANILLAS) {
      if (salidaDePlanilla(p.id) === "filas") {
        expect(PLANILLAS_LECTURA_GENERICA).toContain(p.id);
        expect(p.prompt).toContain("- dudosas:");
        for (const c of p.cabecera) expect(p.prompt).toContain(`${c.clave} («${c.titulo}»)`);
      } else {
        expect(PLANILLAS_LECTURA_GENERICA).not.toContain(p.id);
        expect(p.prompt).toContain("- incierto:");
      }
    }
  });

  it("la Oxapampina pide pulgadas y pies; la Smalian cm y m", () => {
    expect(P("rolliza-oxapampa").prompt).toMatch(/PULGADAS/);
    expect(P("rolliza-oxapampa").prompt).toMatch(/PIES/);
    expect(P("rolliza-smalian").prompt).toMatch(/CENTÍMETROS/);
    expect(P("rolliza-smalian").prompt).toMatch(/METROS/);
  });

  it("encabezados del Excel: los que reconoce cada importador", () => {
    expect(encabezadosExcel(P("aserrada-pt"))).toEqual(["Especie", "Cantidad", "Espesor", "Ancho", "Largo"]);
    expect(encabezadosExcel(P("rolliza-smalian"))).toEqual(["Especie", "D1 (cm)", "D2 (cm)", "Largo (m)"]);
    expect(encabezadosExcel(P("rolliza-oxapampa"))).toEqual(["Especie", "D1 (pulg)", "D2 (pulg)", "Largo (pies)"]);
  });
});

describe("prompt del negocio", () => {
  const p = P("censo-arboles");
  const guardado = (texto: string) => ({ planillaId: p.id, texto, basadoEnVersion: 1, actualizadoPor: "x", actualizadoEn: "" });

  it("sin guardado = el de fábrica", () => {
    expect(promptParaLeer(p, null)).toBe(p.prompt);
  });

  it("con guardado: su texto + el bloque de salida de HOY (aunque haya pegado uno viejo o roto)", () => {
    const propio = "Leé el censo de la brigada 2: escriben la altura en pies y el DAP en pulgadas.";
    const viejo = `${propio}\n\n${MARCA_SALIDA}\n- basura: que ya no existe`;
    const r = promptParaLeer(p, guardado(viejo));
    expect(r.startsWith(propio)).toBe(true);
    expect(r).toContain(bloqueDeSalida(p));
    expect(r).not.toContain("basura");
    expect(parteEditable(viejo)).toBe(propio);
  });

  it("un guardado vacío (sólo el bloque) cae al de fábrica", () => {
    expect(promptParaLeer(p, guardado(`${MARCA_SALIDA}\nlo que sea`))).toBe(p.prompt);
  });
});

describe("hoja impresa", () => {
  it.each(PLANILLAS.map((p) => [p.id, p] as const))("%s: filasPorHoja renglones + 1 de ejemplo, unidades y pie con versión", (_id, p) => {
    const html = htmlDePlanilla(p);
    const renglones = html.match(/<tr style="height:/g) ?? [];
    expect(renglones).toHaveLength(p.filasPorHoja);
    expect(html.match(/<tr class="ej"/g)).toHaveLength(1);
    for (const c of p.columnas.filter((x) => x.unidad)) expect(html).toContain(`(${c.unidad!.replace(/&/g, "&amp;")})`);
    expect(html).toContain(`Planilla ${p.nombre} · v${p.versionPrompt}`);
    if (p.metodo) expect(html).toContain("Método:");
    expect(html).toContain(p.orientacion === "horizontal" ? "A4 landscape" : "A4 portrait");
    // Las filas + cabecera + pie entran en UNA hoja.
    expect(altoDeRenglonMm(p)).toBeGreaterThanOrEqual(6);
  });

  it("escapa el negocio y lo que venga de la planilla", () => {
    const p = P("conteo-patio");
    const malo: PlanillaCampo = { ...p, nombre: `<script>alert("x")</script>`, descripcion: "a & b", cabecera: [{ clave: "f", titulo: "<b>F</b>", ejemplo: "" }] };
    const html = htmlDePlanilla(malo, { negocio: `Blas <img src=x onerror=alert(1)> 'S.A.'` });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>F</b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("&#39;S.A.&#39;");
  });

  it("copias: una hoja por copia, cada una con su corte de página menos la última", () => {
    const p = P("aserrada-pt");
    const html = htmlDePlanilla(p, { copias: 3 });
    expect(html.match(/<section class="hoja/g)).toHaveLength(3);
    expect(html.match(/<section class="hoja corte"/g)).toHaveLength(2);
    expect(html.match(/<tr style="height:/g)).toHaveLength(3 * p.filasPorHoja);
    expect(htmlDePlanilla(p, { copias: 999 }).match(/<section class="hoja/g)).toHaveLength(20);
  });
});

describe("la fila de ejemplo cubica lo que dice", () => {
  it("aserrada: 5 × 2 × 8 × 10 → 66,67 pt", () => {
    const p = P("aserrada-pt");
    const r = interpretarOcrPiezas([
      { cantidad: Number(ej(p, "cantidad")), espesor: Number(ej(p, "espesor")), ancho: Number(ej(p, "ancho")), largo: Number(ej(p, "largo")), especie: ej(p, "especie"), incierto: false },
    ]);
    expect(r.errores).toEqual([]);
    expect(r.piezas[0]!.pieTablar).toBeCloseTo(66.67, 2);
    expect(ej(p, "pt")).toBe("66.67");
  });

  it("Smalian: 40/45 cm × 3,5 m → el m³ del ejemplo", () => {
    const p = P("rolliza-smalian");
    const r = interpretarOcrTrozas([{ d1: Number(ej(p, "d1")), d2: Number(ej(p, "d2")), largo: Number(ej(p, "largo")), especie: "", incierto: false }]);
    expect(r.errores).toEqual([]);
    expect(r.trozas[0]!.m3).toBeCloseTo(Number(ej(p, "m3")), 4);
    expect(cubicarSegun("smalian", 40, 3.5, 45)).toBeCloseTo(0.4965, 4);
  });

  it("Oxapampina: 20″ y 22″ × 10 pies → 21² × 10 ÷ 24,5 ≈ 180 pt", () => {
    const p = P("rolliza-oxapampa");
    const pt = cubicarSegun("oxapampina", Number(ej(p, "d1")), Number(ej(p, "largo")), Number(ej(p, "d2")));
    expect(pt).toBeCloseTo((21 * 21 * 10) / 24.5, 2);
    expect(pt).toBeCloseTo(180, 0);
    expect(Number(ej(p, "pt"))).toBeCloseTo(pt, 0);
  });

  it("censo: DAP 85 cm × 18 m → el volumen del ejemplo", () => {
    const p = P("censo-arboles");
    expect(volumenCenso(Number(ej(p, "dap")) / 100, Number(ej(p, "altura")), 0.65)).toBe(Number(ej(p, "vol")));
  });
});

describe("lectura genérica (conteo, parte, censo)", () => {
  it("el JSON Schema nombra cada columna a mano y cada casillero, estricto", () => {
    const p = P("parte-produccion");
    const { jsonSchema } = esquemasDeLectura(p);
    const filas = (jsonSchema.properties as Record<string, { items: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } }>).filas;
    expect(filas.items.required).toEqual([...columnasAMano(p).map((c) => c.clave), "dudosas"]);
    expect(filas.items.additionalProperties).toBe(false);
    const cab = (jsonSchema.properties as Record<string, { required: string[] }>).cabecera;
    expect(cab.required).toEqual(p.cabecera.map((c) => c.clave));
  });

  it("normaliza: números con coma, no-número = texto dudoso, vacías fuera, calculadas ignoradas, dudosas sólo conocidas", () => {
    const p = P("censo-arboles");
    const { schema } = esquemasDeLectura(p);
    const cruda = schema.safeParse({
      cabecera: { fecha: "2026-10-17", responsable: " Brigada 1 ", permiso: "", parcela: "PC-03", zonaUtm: "18", hoja: "1" },
      filas: [
        { codigo: "A-001", especie: "Shihuahuaco", cientifico: "", dap: "85,5", altura: "18", este: "512345", norte: "8956789", condicion: "Aprovechable", observaciones: "", vol: "99", dudosas: ["norte", "inventada"] },
        { codigo: "", especie: "", cientifico: "", dap: "", altura: "", este: "", norte: "", condicion: "", observaciones: "", dudosas: [] },
        { codigo: "A-002", especie: "Tornillo", cientifico: "", dap: "7?", altura: "15", este: "512400", norte: "8956800", condicion: "", observaciones: "", dudosas: [] },
      ],
      advertencia: "",
    });
    expect(cruda.success).toBe(true);
    if (!cruda.success) return;
    const l = normalizarLectura(p, cruda.data, { origen: "fabrica", version: 1 });
    expect(l.planillaId).toBe("censo-arboles");
    expect(l.cabecera).toMatchObject({ responsable: "Brigada 1", permiso: null, parcela: "PC-03" });
    expect(l.filas).toHaveLength(2);
    expect(l.filas[0]!.valores).toMatchObject({ codigo: "A-001", dap: 85.5, este: 512345, norte: 8956789, cientifico: null });
    expect(l.filas[0]!.valores).not.toHaveProperty("vol");
    expect(l.filas[0]!.dudosas).toEqual(["norte"]);
    expect(l.filas[1]!.valores.dap).toBe("7?");
    expect(l.filas[1]!.dudosas).toEqual(["dap"]);
    expect(l).not.toHaveProperty("advertencia");
  });

  it("parte de producción: la lectura entra por interpretarProduccion con la fecha de la cabecera", () => {
    const p = P("parte-produccion");
    const valores = Object.fromEntries(columnasAMano(p).map((c) => [c.clave, c.ejemplo]));
    const l = normalizarLectura(p, { cabecera: {}, filas: [{ ...valores, dudosas: [] }], advertencia: "" }, { origen: "fabrica", version: 1 });
    const r = interpretarProduccion(matrizDeLecturaTexto(p, l), { fechaPorDefecto: "2026-10-17" });
    expect(r.errores).toEqual([]);
    expect(r.corridas).toHaveLength(1);
    expect(r.corridas[0]).toMatchObject({ fecha: "2026-10-17", productType: "Tabla", especie: "Tornillo", cantidad: 2.35, unit: "m3", lineaProduccion: "LP", codigoRaiz: "T-0412" });
  });

  it("censo: la lectura entra por parseCensoFilas con cada columna en su campo", () => {
    const p = P("censo-arboles");
    const valores = Object.fromEntries(columnasAMano(p).map((c) => [c.clave, c.ejemplo]));
    const l = normalizarLectura(p, { cabecera: {}, filas: [{ ...valores, dudosas: [] }], advertencia: "" }, { origen: "fabrica", version: 1 });
    const r = parseCensoFilas(matrizDeLectura(p, l));
    expect(r.conEncabezado).toBe(true);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      treeCode: "A-001",
      speciesCommon: "Shihuahuaco",
      speciesScientific: "Dipteryx micrantha",
      dapM: 0.85,
      alturaComercialM: 18,
      utmX: 512345,
      utmY: 8956789,
      condicion: "Aprovechable",
      notes: "Fuste recto",
      volumenDeLaHoja: false,
    });
    expect(r.filas[0]!.volumenEstimadoM3).toBe(Number(ej(p, "vol")));
  });
});
