/**
 * ADR-461 — importar al Libro TH guías ya despachadas: el armado y la revisión
 * PUROS, sobre fichas REALES de SERFOR guardadas en el Libro CTP de Blas
 * (`forestal-loth-importar-guia.fichas-blas.json`, leídas con SELECT de sólo
 * lectura el 02-10-2026; DNI y brevete del conductor redactados).
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { LothCierrePeriodo } from "@/lib/forestal/loth-cierre-types";
import { repararFichaSerfor } from "@/lib/forestal/serfor-texto-danado";
import {
  arbolDeCodificacion,
  citaElRegistro,
  claveDeFuente,
  claveTitulo,
  codigoSinCodigo,
  detectarPermiso,
  esSinCodigo,
  estadoDeLaRevision,
  fechaIsoDeSerfor,
  gtfDatosDesdeFicha,
  guiaYaEnElLibro,
  leerReferencial,
  llavePlanNuevo,
  marcaReferencial,
  ordenDeImportacion,
  propuestaDePlan,
  revisarGuia,
  talasAEscribir,
  tipoPlanDeLaGuia,
  trozasDeLaGuia,
  vistaPreviaDeTanda,
  type ContextoImportacion,
  type DestinoDeLaGuia,
  type GuiaDelLibro,
  type GuiaParaRevisar,
  type LibroDeLaGuia,
  type LineaDelLibro,
  type PlanDelLibro,
} from "@/lib/forestal/loth-importar-guia";
import { fichaGtfSchema, pedidoImportarSchema, planDestinoSchema } from "@/lib/forestal/loth-importar-guia-esquemas";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;
const ficha = (registro: string): GtfSerfor => structuredClone(FICHAS[registro]);
/** GTF 010-001-0000014 · PMFI 10-HUA-PUE/PER-FMP-2026-007 · 186A, 186B, 62B, 62C, 85B · 13,806 m³. */
const G14 = "1-10-0474633";
/** GTF 010-001-0000007 · 161-C, 173-A, 173-B, 173-C. */
const G07 = "1-10-0473187";
/** GTF 010-001-0000008 · 173-D, 189-B, 226-A, 243-A, 243-B (el 173 sigue de la 7). */
const G08 = "1-10-0473188";
/** GTF 019-001-0000013 · plantación REG-PLT-2018-020 · 49 trozas con codificación «-». */
const G13PLT = "110-19-0472267";
/** GTF 019-0000001 · PER-FMC (comunidad nativa) · «84/A (0000005)». */
const G01FMC = "1-19-0300920";

const LIBRO_VACIO: LibroDeLaGuia = { trozados: [], talas: [], salidas: [], guias: [], cierres: [] };
const destinoNuevo = (g: GtfSerfor, plantacion = false): DestinoDeLaGuia => ({
  planId: llavePlanNuevo(g),
  nuevo: true,
  plantacion,
  especies: [],
  nombre: "PMFI nuevo",
});
const PLAN_ID = "plan-fmp";
const destinoExistente = (especies: PlanDelLibro["especies"] = [], plantacion = false): DestinoDeLaGuia => ({
  planId: PLAN_ID,
  nuevo: false,
  plantacion,
  especies,
  nombre: "PMFI 10-HUA-PUE/PER-FMP-2026-007",
});
const linea = (p: Partial<LineaDelLibro> & Pick<LineaDelLibro, "section">): LineaDelLibro => ({
  id: `l-${Math.random()}`,
  lineNo: 1,
  planId: PLAN_ID,
  treeCode: null,
  trozaCode: null,
  speciesCommon: null,
  speciesScientific: null,
  diamMayorM: null,
  diamMenorM: null,
  lengthM: null,
  volumeM3: null,
  fecha: "2026-09-01",
  referencial: null,
  ...p,
});

describe("códigos y fechas", () => {
  it("claveTitulo iguala el título escrito distinto, tramo a tramo", () => {
    expect(claveTitulo("10-HUA-PUE/PER-FMP-2026-007")).toBe("10-HUA-PUE-PER-FMP-2026-7");
    expect(claveTitulo(" 10 hua pue per fmp 2026 7 ")).toBe(claveTitulo("10-HUA-PUE/PER-FMP-2026-007"));
    expect(claveTitulo("19-SEC/REG-PLT-2021-017")).not.toBe(claveTitulo("19-SEC/REG-PLT-2021-018"));
    expect(claveTitulo("")).toBeNull();
    expect(claveTitulo(null)).toBeNull();
  });

  it("arbolDeCodificacion entiende las tres escrituras de Blas y el libro", () => {
    expect(arbolDeCodificacion("186A")).toBe("186");
    expect(arbolDeCodificacion("173-D")).toBe("173");
    expect(arbolDeCodificacion("84/A (0000005)")).toBe("84");
    expect(arbolDeCodificacion("85-TOR-A")).toBe("85-TOR");
    expect(arbolDeCodificacion("186 B")).toBe("186");
    // Sin sufijo de pieza: el código ES el árbol.
    expect(arbolDeCodificacion("35")).toBe("35");
    expect(arbolDeCodificacion("001-BOL")).toBe("001-BOL");
    // Sin código.
    expect(arbolDeCodificacion("-")).toBeNull();
    expect(arbolDeCodificacion("")).toBeNull();
  });

  it("«-», rayas y puntos son SIN código (no un código repetido)", () => {
    expect(esSinCodigo("-")).toBe(true);
    expect(esSinCodigo(" — ")).toBe(true);
    expect(esSinCodigo("..")).toBe(true);
    expect(esSinCodigo(null)).toBe(true);
    expect(esSinCodigo("5")).toBe(false);
    expect(codigoSinCodigo("110-19-0472267", 3)).toBe("SC-110-19-0472267-3");
  });

  it("fechaIsoDeSerfor lee dd/mm/aaaa y rechaza fechas que no existen", () => {
    expect(fechaIsoDeSerfor("07/09/2026")).toBe("2026-09-07");
    expect(fechaIsoDeSerfor("2026-09-07")).toBe("2026-09-07");
    expect(fechaIsoDeSerfor("31/02/2026")).toBeNull();
    expect(fechaIsoDeSerfor("ayer")).toBeNull();
    expect(fechaIsoDeSerfor(null)).toBeNull();
  });

  it("citaElRegistro no confunde un registro con su prefijo", () => {
    const obs = "Importada al Libro TH desde SERFOR · registro SERFOR 1-10-0474633 (ADR-461).";
    expect(citaElRegistro(obs, "1-10-0474633")).toBe(true);
    expect(citaElRegistro(obs, "1-10-047463")).toBe(false);
    expect(citaElRegistro(null, "1-10-0474633")).toBe(false);
  });
});

describe("las trozas de la guía (fichas reales)", () => {
  it("GTF 0000014: 5 trozas con su árbol, medidas en metros y el volumen de la guía", () => {
    const g = ficha(G14);
    const t = trozasDeLaGuia(g);
    expect(t.map((x) => x.trozaCode)).toEqual(["186A", "186B", "62B", "62C", "85B"]);
    expect(t.map((x) => x.treeCode)).toEqual(["186", "186", "62", "62", "85"]);
    expect(t[0]).toMatchObject({ diamMayorM: 0.76, diamMenorM: 0.68, lengthM: 7.92, volumeM3: 3.225, speciesCommon: "Panguana", sinCodigo: false });
    // El volumen es el de la guía: la suma de la lista es lo que SERFOR declara.
    const suma = Math.round(t.reduce((a, x) => a + (x.volumeM3 ?? 0), 0) * 1000) / 1000;
    expect(suma).toBe(g.volumenTotal);
  });

  it("sección mayor/menor: si SERFOR publica el menor primero, se ordenan", () => {
    const g = ficha(G14);
    g.trozas[0] = { ...g.trozas[0], dimensiones: "56.0 X 61.0 X 3.9" };
    expect(trozasDeLaGuia(g)[0]).toMatchObject({ diamMayorM: 0.61, diamMenorM: 0.56, lengthM: 3.9 });
  });

  it("plantación 0000013: las 49 «-» entran como SC-<registro>-<n>, sin árbol", () => {
    const t = trozasDeLaGuia(ficha(G13PLT));
    expect(t).toHaveLength(49);
    expect(t.every((x) => x.sinCodigo && x.treeCode === null)).toBe(true);
    expect(t[0].trozaCode).toBe("SC-110-19-0472267-1");
    expect(t[48].trozaCode).toBe("SC-110-19-0472267-49");
    expect(new Set(t.map((x) => x.trozaCode)).size).toBe(49);
  });

  it("«84/A (0000005)» del permiso de comunidad: árbol 84", () => {
    const t = trozasDeLaGuia(ficha(G01FMC));
    expect(t[0]).toMatchObject({ trozaCode: "84/A (0000005)", treeCode: "84" });
  });
});

describe("el permiso", () => {
  it("tipo de plan por origen y código", () => {
    expect(tipoPlanDeLaGuia("PERMISO", "10-HUA-PUE/PER-FMP-2026-007")).toBe("PMFI");
    expect(tipoPlanDeLaGuia("PERMISO", "19-SEC/PER-FMC-2024-008")).toBe("DEMA");
    expect(tipoPlanDeLaGuia("PLANTACION", "19-SEC/REG-PLT-2018-020")).toBe("PLANTACION");
    expect(tipoPlanDeLaGuia("PERMISO", "19-SEC/REG-PLT-2021-017")).toBe("PLANTACION");
    expect(tipoPlanDeLaGuia("CONCESION", "17-CPO/C-J-045-26")).toBe("PO");
  });

  it("propuesta desde la ficha: el código va al N° en plantación y al título en los demás", () => {
    const pmfi = propuestaDePlan(ficha(G14), "ctr-1");
    expect(pmfi).toMatchObject({
      planType: "PMFI",
      planNumber: null,
      tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007",
      titularName: "PEREZ MUÑOZ JUAN CARLOS",
      contratoId: "ctr-1",
    });
    const plt = propuestaDePlan(ficha(G13PLT));
    expect(plt).toMatchObject({ planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2018-020", tituloHabilitante: null });
    expect(plt.arffs).toBeTruthy();
  });

  it("nuevo, con el permiso (ForestContrato) del mismo código para atarlo", () => {
    const p = detectarPermiso(ficha(G14), [], [{ id: "ctr-fmp", codigo: "10-HUA-PUE/PER-FMP-2026-007", planId: null }]);
    expect(p.estado).toBe("nuevo");
    expect(p.estado === "nuevo" && p.propuesta.contratoId).toBe("ctr-fmp");
  });

  it("existente por el código del plan escrito distinto", () => {
    const planes: PlanDelLibro[] = [
      { id: "p1", planType: "PMFI", planNumber: null, tituloHabilitante: "10-HUA-PUE PER-FMP-2026-7", titularName: "PEREZ", contratoId: null, especies: [] },
      { id: "p2", planType: "PO", planNumber: "PO-2026-001", tituloHabilitante: "17-CPO/C-J-045-26", titularName: "Otra", contratoId: null, especies: [] },
    ];
    const p = detectarPermiso(ficha(G14), planes, []);
    expect(p).toMatchObject({ estado: "existente", plan: { planId: "p1", via: "plan" } });
  });

  it("existente por el permiso atado a un plan (Blas: REG-PLT-2021-017 → «PO1»)", () => {
    const planes: PlanDelLibro[] = [
      { id: "po1", planType: "PLANTACION", planNumber: "PO1", tituloHabilitante: null, titularName: "COMUNIDAD SANTA ROSA DE CHIVIS", contratoId: null, especies: [] },
    ];
    const p = detectarPermiso(ficha(G13PLT), planes, [{ id: "ctr", codigo: "19-SEC/REG-PLT-2018-020", planId: "po1" }]);
    expect(p).toMatchObject({ estado: "existente", plan: { planId: "po1", via: "contrato" } });
  });

  it("ambiguo con dos planes del mismo código: la persona elige", () => {
    const base = { planType: "PMFI", planNumber: null, tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", contratoId: null, especies: [] };
    const p = detectarPermiso(ficha(G14), [{ ...base, id: "a", titularName: "A" }, { ...base, id: "b", titularName: "B" }], []);
    expect(p.estado).toBe("ambiguo");
    expect(p.estado === "ambiguo" && p.candidatos.map((c) => c.planId)).toEqual(["a", "b"]);
  });
});

describe("la revisión contra el libro", () => {
  it("tala referencial del pedido: 186A + 186B → 15,69 m · D1 0,76 · D2 0,52 · 5,422 m³", () => {
    const g = ficha(G14);
    const rev = revisarGuia(g, destinoNuevo(g), LIBRO_VACIO, { verificada: true });
    const t186 = rev.talas.find((t) => t.treeCode === "186");
    /* ADR-477: las trozas entran con su código único (código de la guía + correlativo). */
    expect(t186).toMatchObject({ trozas: ["186A-0014", "186B-0014"], lengthM: 15.69, diamMayorM: 0.76, diamMenorM: 0.52, volumeM3: 5.422, estado: "nueva" });
    expect(rev.talas.map((t) => t.treeCode)).toEqual(["186", "62", "85"]);
    expect(rev.trozas.every((t) => t.estado === "nueva")).toBe(true);
    expect(rev.avisos.filter((a) => a.nivel === "bloquea")).toEqual([]);
    expect(rev.avisos.some((a) => a.codigo === "plan_nuevo_sin_especies")).toBe(true);
    // Σ talas = Σ trozas: T4 cierra exacto.
    const sumaTalas = rev.talas.reduce((a, t) => a + (t.volumeM3 ?? 0), 0);
    expect(Math.round(sumaTalas * 1000) / 1000).toBe(13.806);
  });

  it("ya está en el libro: mismo N° escrito distinto y mismo titular, vigente", () => {
    const g = ficha(G14);
    const guia: GuiaDelLibro = {
      id: "gtf1", gtfNumber: "10-001-14", status: "emitida", titularName: "Perez Muñoz Juan Carlos",
      tituloHabilitante: null, planId: null, observations: null,
    };
    expect(guiaYaEnElLibro(g, [guia], null)?.id).toBe("gtf1");
    const rev = revisarGuia(g, destinoNuevo(g), { ...LIBRO_VACIO, guias: [guia] }, { verificada: true });
    expect(estadoDeLaRevision(rev, null, true, true)).toBe("ya_importada");
    // Anulada: no está (se vuelve a anotar, con aviso).
    const anulada = { ...guia, status: "anulada" };
    const rev2 = revisarGuia(g, destinoNuevo(g), { ...LIBRO_VACIO, guias: [anulada] }, { verificada: true });
    expect(rev2.yaImportada).toBeNull();
    expect(rev2.avisos.some((a) => a.codigo === "ya_importada" && a.nivel === "info")).toBe(true);
    // Mismo N° de OTRO titular y otro permiso: otra guía.
    const ajena = { ...guia, titularName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", tituloHabilitante: "19-SEC/REG-PLT-2021-017" };
    expect(guiaYaEnElLibro(g, [ajena], null)).toBeNull();
    // Por el N° de registro citado en la observación.
    const porRegistro = { ...ajena, gtfNumber: "999", observations: "Importada al Libro TH desde SERFOR · registro SERFOR 1-10-0474633 (ADR-461)." };
    expect(guiaYaEnElLibro(g, [porRegistro], null)?.id).toBe("gtf1");
  });

  it("anulada en SERFOR, mes cerrado, sin trozas: bloquean", () => {
    const g = ficha(G14);
    g.estado = "Anulada";
    expect(revisarGuia(g, destinoNuevo(g), LIBRO_VACIO, { verificada: true }).avisos.map((a) => a.codigo)).toContain("anulada");

    const septiembre: LothCierrePeriodo = {
      periodKey: "2026-09", from: new Date(2026, 8, 1).toISOString(), to: new Date(2026, 9, 0, 23, 59, 59, 999).toISOString(),
      label: "septiembre de 2026", closedAt: "", closedBy: "x", totales: { lineasCount: 0, taladoM3: 0, trozadoM3: 0 },
    };
    const g2 = ficha(G14);
    const rev = revisarGuia(g2, destinoNuevo(g2), { ...LIBRO_VACIO, cierres: [septiembre] }, { verificada: true });
    expect(rev.avisos.find((a) => a.codigo === "mes_cerrado")?.nivel).toBe("bloquea");
    // Reabierto: no bloquea.
    const reabierto = { ...septiembre, reabierto: { at: "", by: "x", motivo: "corrección" } };
    expect(revisarGuia(g2, destinoNuevo(g2), { ...LIBRO_VACIO, cierres: [reabierto] }, { verificada: true }).avisos.some((a) => a.codigo === "mes_cerrado")).toBe(false);

    const g3 = ficha(G14);
    g3.trozas = [];
    expect(revisarGuia(g3, destinoNuevo(g3), LIBRO_VACIO, { verificada: true }).avisos.find((a) => a.codigo === "sin_trozas")?.nivel).toBe("bloquea");
  });

  it("una troza que ya salió, o trozada en otro permiso, choca", () => {
    const g = ficha(G14);
    const libro: LibroDeLaGuia = {
      ...LIBRO_VACIO,
      salidas: [{ trozaCode: "62B", section: "despacho_troza", lineNo: 4, gtfNumber: "019-0000002" }],
      trozados: [linea({ section: "trozado", trozaCode: "85B", treeCode: "85", planId: "otro-plan", lineNo: 9 })],
    };
    const rev = revisarGuia(g, destinoExistente(), libro, { verificada: true });
    expect(rev.trozas.find((t) => t.trozaCode === "62B")).toMatchObject({ estado: "conflicto" });
    expect(rev.trozas.find((t) => t.trozaCode === "62B")?.detalle).toMatch(/ya salió/);
    expect(rev.trozas.find((t) => t.trozaCode === "85B")?.detalle).toMatch(/otro permiso/);
    expect(estadoDeLaRevision(rev, null, true, true)).toBe("bloqueada");
  });

  it("la misma troza ya trozada en ESTE plan se reutiliza (no se duplica) y entra en la tala", () => {
    const g = ficha(G14);
    const libro: LibroDeLaGuia = {
      ...LIBRO_VACIO,
      trozados: [linea({ section: "trozado", trozaCode: "186A", treeCode: "186", speciesCommon: "Panguana", diamMayorM: 0.76, diamMenorM: 0.68, lengthM: 7.92, volumeM3: 3.225, lineNo: 3 })],
    };
    const rev = revisarGuia(g, destinoExistente(), libro, { verificada: true });
    expect(rev.trozas.find((t) => t.trozaCode === "186A")?.estado).toBe("ya_trozada");
    expect(rev.talas.find((t) => t.treeCode === "186")).toMatchObject({ estado: "nueva", volumeM3: 5.422, trozas: ["186A", "186B-0014"] });
    expect(estadoDeLaRevision(rev, null, true, true)).toBe("lista");
  });

  it("tala medida en campo: se respeta si alcanza; si no, choca (T4)", () => {
    const g = ficha(G14);
    const alcanza = { ...LIBRO_VACIO, talas: [linea({ section: "tala", treeCode: "186", volumeM3: 6, lineNo: 2 })] };
    expect(revisarGuia(g, destinoExistente(), alcanza, { verificada: true }).talas.find((t) => t.treeCode === "186")?.estado).toBe("existente");
    const corta = { ...LIBRO_VACIO, talas: [linea({ section: "tala", treeCode: "186", volumeM3: 5, lineNo: 2 })] };
    const rev = revisarGuia(g, destinoExistente(), corta, { verificada: true });
    expect(rev.talas.find((t) => t.treeCode === "186")).toMatchObject({ estado: "conflicto" });
    // Choca con y sin talas: el trozado igual mide contra esa tala.
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("bloqueada");
  });

  it("árbol con trozas en otro permiso y sin tala: sólo choca si se arma la tala", () => {
    const g = ficha(G14);
    const libro = { ...LIBRO_VACIO, trozados: [linea({ section: "trozado", trozaCode: "186C", treeCode: "186", planId: "otro" })] };
    const rev = revisarGuia(g, destinoExistente(), libro, { verificada: true });
    expect(rev.talas.find((t) => t.treeCode === "186")).toMatchObject({ estado: "conflicto", soloConTala: true });
    expect(estadoDeLaRevision(rev, null, true, true)).toBe("bloqueada");
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("lista");
  });

  it("T8: árbol del censo bajo el DMC → la tala choca, sin tala se importa", () => {
    const g = ficha(G14);
    const rev = revisarGuia(g, destinoExistente(), LIBRO_VACIO, { verificada: true, bajoDmc: new Map([["62", "El árbol 62 tiene 35.0 cm de DAP…"]]) });
    expect(rev.talas.find((t) => t.treeCode === "62")).toMatchObject({ estado: "conflicto", soloConTala: true });
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("lista");
  });

  it("T7: especie fuera del plan bloquea; dentro (por científico) no", () => {
    const g = ficha(G14);
    const fuera = revisarGuia(g, destinoExistente([{ speciesCommon: "Tornillo", speciesScientific: null }]), LIBRO_VACIO, { verificada: true });
    expect(fuera.avisos.find((a) => a.codigo === "especie_fuera_del_plan")?.nivel).toBe("bloquea");
    const especies = [
      { speciesCommon: "Panguana (Brosimum utile)", speciesScientific: "Brosimum utile (Kunth) Oken" },
      { speciesCommon: "Cachimbo", speciesScientific: null },
      { speciesCommon: "Mashonaste", speciesScientific: null },
      { speciesCommon: "Lupuna", speciesScientific: null },
    ];
    const dentro = revisarGuia(g, destinoExistente(especies), LIBRO_VACIO, { verificada: true });
    const fueraDentro = dentro.avisos.find((a) => a.codigo === "especie_fuera_del_plan");
    // Lo que la guía trae y el plan no tiene, se nombra.
    const especiesGuia = [...new Set(trozasDeLaGuia(g).map((t) => t.speciesCommon))];
    for (const e of especiesGuia.filter((x) => !["Panguana", "Cachimbo", "Mashonaste", "Lupuna"].includes(x as string))) {
      expect(fueraDentro?.mensaje).toContain(e as string);
    }
    expect(fueraDentro?.mensaje ?? "").not.toContain("Panguana");
  });

  it("plantación: la tala no va por defecto y las sin código no arman tala", () => {
    const g = ficha(G13PLT);
    const rev = revisarGuia(g, destinoNuevo(g, true), LIBRO_VACIO, { verificada: true });
    expect(rev.talas).toEqual([]);
    expect(rev.avisos.find((a) => a.codigo === "sin_codigo")?.nivel).toBe("atencion");
    expect(estadoDeLaRevision(rev, null, false, true)).toBe("lista");
  });

  it("ficha de una foto: se avisa que no está verificada", () => {
    const g = ficha(G14);
    expect(revisarGuia(g, destinoNuevo(g), LIBRO_VACIO, { verificada: false }).avisos.find((a) => a.codigo === "no_verificada")?.nivel).toBe("atencion");
  });

  it("tala referencial existente del mismo plan: se AMPLÍA con las trozas nuevas", () => {
    const g = ficha(G08); // 173-D
    const previa = linea({
      section: "tala", treeCode: "173", lineNo: 5, volumeM3: 1, lengthM: 18,
      referencial: { gtfs: ["010-001-0000007"], registros: [G07], trozas: ["173-A", "173-B", "173-C"] },
    });
    const yaTrozadas = ["173-A", "173-B", "173-C"].map((c, i) =>
      linea({ section: "trozado", trozaCode: c, treeCode: "173", volumeM3: [6.668, 2, 1][i], lengthM: 6, diamMayorM: 1.2, diamMenorM: 0.9 }),
    );
    const rev = revisarGuia(g, destinoExistente(), { ...LIBRO_VACIO, talas: [previa], trozados: yaTrozadas }, { verificada: true });
    const t173 = rev.talas.find((t) => t.treeCode === "173");
    expect(t173?.estado).toBe("ampliar");
    expect(t173?.trozas).toEqual(["173-A", "173-B", "173-C", "173-D-0008"]);
    expect(t173?.volumeM3).toBe(Math.round((6.668 + 2 + 1 + 3.139) * 10000) / 10000);
    // `ampliar` se escribe aunque el interruptor de talas esté apagado (si no, T4 frena la troza nueva).
    expect(talasAEscribir(rev.talas, false).map((t) => t.treeCode)).toEqual(["173"]);
  });
});

describe("la vista previa de una tanda", () => {
  const ctx = (p: Partial<ContextoImportacion> = {}): ContextoImportacion => ({
    planes: [], contratos: [], libro: LIBRO_VACIO, bajoDmc: new Map(), ...p,
  });
  const entrada = (registro: string, extra: Partial<GuiaParaRevisar> = {}): GuiaParaRevisar => ({
    clave: `serfor:${registro}`,
    fuente: { tipo: "serfor", numeroRegistro: registro },
    ficha: ficha(registro),
    verificada: true,
    falla: null,
    planElegido: null,
    ...extra,
  });

  it("el árbol 173 en dos guías: la 7 arma la tala y la 8 la amplía (aunque se pida al revés)", () => {
    const out = vistaPreviaDeTanda([entrada(G08), entrada(G07)], ctx());
    expect(out.map((x) => x.clave)).toEqual([`serfor:${G08}`, `serfor:${G07}`]);
    expect(out.map((x) => x.estado)).toEqual(["lista", "lista"]);
    expect(out[1].talas.find((t) => t.treeCode === "173")).toMatchObject({ estado: "nueva", trozas: ["173-A-0007", "173-B-0007", "173-C-0007"] });
    const amp = out[0].talas.find((t) => t.treeCode === "173");
    expect(amp).toMatchObject({ estado: "ampliar", trozas: ["173-A-0007", "173-B-0007", "173-C-0007", "173-D-0008"] });
    // Las dos van al MISMO permiso nuevo.
    expect(out[0].permiso?.estado).toBe("nuevo");
    expect(out[1].permiso?.estado).toBe("nuevo");
  });

  it("la misma guía dos veces en la tanda: la segunda ya está", () => {
    const out = vistaPreviaDeTanda([entrada(G14), { ...entrada(G14), clave: "otra" }], ctx());
    expect(out.map((x) => x.estado)).toEqual(["lista", "ya_importada"]);
  });

  it("SERFOR sin respuesta / ingreso inexistente: la guía sale con su falla y las demás siguen", () => {
    const out = vistaPreviaDeTanda(
      [entrada(G14), { ...entrada("9-9-9"), ficha: null, falla: { estado: "sin_respuesta", mensaje: "SERFOR no respondió" } }],
      ctx(),
    );
    expect(out[0].estado).toBe("lista");
    expect(out[1]).toMatchObject({ estado: "sin_respuesta", estadoSinTala: "sin_respuesta", mensaje: "SERFOR no respondió", guia: null });
  });

  it("ambiguo: pide elegir; con el plan elegido, revisa contra ése", () => {
    const base = { planType: "PMFI", planNumber: null, tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", contratoId: null, especies: [] };
    const planes = [{ ...base, id: "a", titularName: "A" }, { ...base, id: "b", titularName: "B" }];
    expect(vistaPreviaDeTanda([entrada(G14)], ctx({ planes }))[0].estado).toBe("elegir_permiso");
    expect(vistaPreviaDeTanda([entrada(G14, { planElegido: "b" })], ctx({ planes }))[0].estado).toBe("lista");
    expect(vistaPreviaDeTanda([entrada(G14, { planElegido: "no-existe" })], ctx({ planes }))[0].estado).toBe("bloqueada");
  });

  it("plantación: la tala viene apagada; DEMA/PMFI: prendida", () => {
    const out = vistaPreviaDeTanda([entrada(G13PLT), entrada(G01FMC)], ctx());
    expect(out[0].crearTalaPorDefecto).toBe(false);
    expect(out[1].crearTalaPorDefecto).toBe(true);
    expect(out[1].permiso).toMatchObject({ estado: "nuevo", propuesta: { planType: "DEMA" } });
    expect(out[1].talas.map((t) => t.treeCode)).toEqual(["84", "85"]);
  });

  it("la clave de cada fuente y el orden por fecha", () => {
    expect(claveDeFuente({ tipo: "serfor", numeroRegistro: " 1-10-0474633 " }, 0)).toBe("serfor:1-10-0474633");
    expect(claveDeFuente({ tipo: "ctp", woodEntryId: "w1" }, 0)).toBe("ctp:w1");
    expect(claveDeFuente({ tipo: "ficha", ficha: ficha(G14) }, 3)).toBe("ficha:1-10-0474633");
    const orden = ordenDeImportacion([ficha(G14), ficha(G01FMC), ficha(G08), ficha(G07)], (g) => fechaIsoDeSerfor(g.fechaExpedicion), (g) => g.gtfNumber);
    expect(orden).toEqual([1, 3, 2, 0]);
  });
});

describe("lo que se guarda", () => {
  it("el cuerpo de la guía (GtfDatos) sale completo y válido desde la ficha", () => {
    const g = ficha(G14);
    const d = gtfDatosDesdeFicha(g);
    expect(d.titulos).toEqual(["10-HUA-PUE/PER-FMP-2026-007"]);
    expect(d.traslado.fechaInicio).toBe("2026-09-07");
    expect(d.guia.autoridad).toBe(g.instanciaRegistra);
    /* «ABC-109 /»: la placa sin la barra del remolque (02-10 noche). */
    expect(d.vehiculo.placa).toBe("ABC-109");
    expect(d.propietario.esElCtp).toBe(false);
    // Un nombre de 300 letras no tumba el cuerpo entero.
    const largo = { ...g, destinatario: "X".repeat(300) };
    expect(gtfDatosDesdeFicha(largo).destinatario.nombre).toHaveLength(200);
  });

  it("la marca referencial se lee de vuelta", () => {
    const m = marcaReferencial({ lengthM: 15.69, trozas: ["186A", "186B"] }, ["010-001-0000014"], [G14]);
    expect(leerReferencial(m)).toEqual({ gtfs: ["010-001-0000014"], registros: [G14], trozas: ["186A", "186B"] });
    expect(leerReferencial({ forma: "cruzadas", mayor: [], menor: [] })).toBeNull();
    expect(leerReferencial(null)).toBeNull();
  });

  it("SERFOR publica «MUÃ?OZ» en el propietario: la ficha se repara con su propio contexto", () => {
    const g = ficha(G14);
    expect(g.propietario).toContain("Ã");
    expect(repararFichaSerfor(g).propietario).toBe("PEREZ MUÑOZ JUAN CARLOS");
  });
});

describe("esquemas de los pedidos", () => {
  it("la ficha real pasa el esquema; 501 trozas no", () => {
    const r = fichaGtfSchema.safeParse(ficha(G14));
    expect(r.success).toBe(true);
    const g = ficha(G14);
    g.trozas = Array.from({ length: 501 }, () => g.trozas[0]);
    expect(fichaGtfSchema.safeParse(g).success).toBe(false);
  });

  it("plan destino: existente o nuevo con titular", () => {
    expect(planDestinoSchema.safeParse({ tipo: "existente", planId: "p1" }).success).toBe(true);
    expect(planDestinoSchema.safeParse({ tipo: "nuevo", plan: { ...propuestaDePlan(ficha(G14)), titularName: "" } }).success).toBe(false);
    expect(planDestinoSchema.safeParse({ tipo: "nuevo", plan: propuestaDePlan(ficha(G14)) }).success).toBe(true);
    expect(planDestinoSchema.safeParse({ tipo: "nuevo", plan: { ...propuestaDePlan(ficha(G14)), planType: "OTRO" } }).success).toBe(false);
  });

  it("importar: hasta 10 guías por pedido", () => {
    const item = { fuente: { tipo: "serfor", numeroRegistro: G14 }, planDestino: { tipo: "existente", planId: "p" }, crearTala: true };
    expect(pedidoImportarSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(pedidoImportarSchema.safeParse({ items: Array.from({ length: 11 }, () => item) }).success).toBe(false);
    expect(pedidoImportarSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
