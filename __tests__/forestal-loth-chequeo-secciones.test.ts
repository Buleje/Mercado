/**
 * loth-chequeo-catalogo + loth-chequeo-secciones — el texto de cada chequeo
 * avanzado, el reparto por sección y que sumen al MISMO puntaje que el panel
 * y el PDF (26-10). Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { armarChequeos, CLAVES_CHEQUEO, TOPE_CASOS } from "@/lib/forestal/loth-chequeo-catalogo";
import { agruparPorSeccion, cuentaPorSeveridad, normaDe, seccionDe, SECCIONES } from "@/lib/forestal/loth-chequeo-secciones";
import { AJUSTES_CHEQUEO_DEFECTO, DIAS_PRELIMINAR_DEFECTO } from "@/lib/forestal/loth-chequeo-tipos";
import { DIAS_AVISO_REGISTRO } from "@/lib/forestal/loth-aviso-plazos";
import { computeLothCompliance } from "@/lib/forestal/loth-compliance";

const CARATULA_OK = { titularName: "Maderera Blas SAC", tituloHabilitante: "CONC-25-001" };

describe("catálogo", () => {
  it("el aviso de preliminares arranca donde el de plazos (10 de 15)", () => {
    expect(DIAS_PRELIMINAR_DEFECTO).toBe(DIAS_AVISO_REGISTRO);
  });

  it("cada chequeo trae sección, norma, severidad y destino", () => {
    const todos = Object.fromEntries(CLAVES_CHEQUEO.map((k) => [k, ["un caso"]]));
    const checks = armarChequeos(todos, AJUSTES_CHEQUEO_DEFECTO);
    expect(checks).toHaveLength(CLAVES_CHEQUEO.length);
    for (const c of checks) {
      expect(c.seccion, c.key).toBeTruthy();
      expect(c.norma, c.key).toBeTruthy();
      expect(["error", "warning"]).toContain(c.severity);
      expect(c.title.startsWith("1 "), c.key).toBe(true);
      expect(c.navigateLabel, c.key).toBeTruthy();
    }
  });

  it("lo que no se pudo leer no sale (ni en rojo ni «en orden»)", () => {
    const checks = armarChequeos({ guia_repetida: null, despacho_sin_guia: [] }, AJUSTES_CHEQUEO_DEFECTO);
    expect(checks.map((c) => c.key)).toEqual(["despacho_sin_guia"]);
    expect(checks[0].count).toBe(0);
  });

  it("la cuenta es la real y la lista tiene techo", () => {
    const casos = Array.from({ length: TOPE_CASOS + 7 }, (_, i) => `caso ${i}`);
    const [c] = armarChequeos({ guia_sin_transporte: casos }, AJUSTES_CHEQUEO_DEFECTO);
    expect(c.count).toBe(TOPE_CASOS + 7);
    expect(c.casos).toHaveLength(TOPE_CASOS);
  });

  it("los ajustes cambian el texto: licencia y días de aviso", () => {
    const sin = armarChequeos({ guia_sin_transporte: [], preliminar_vieja: [] }, { diasPreliminar: 7, pedirLicencia: false });
    expect(sin[0].okTitle).not.toContain("licencia");
    expect(sin[1].description).toContain("7 días");
    const con = armarChequeos({ guia_sin_transporte: [] }, AJUSTES_CHEQUEO_DEFECTO);
    expect(con[0].okTitle).toContain("licencia");
  });
});

describe("secciones y puntaje", () => {
  const extra = armarChequeos(
    { guia_repetida: ["GTF 1: 2 guías"], guia_sin_transporte: ["GTF 2: falta la placa"], plan_por_vencer: [], fechas_fuera_de_orden: [] },
    AJUSTES_CHEQUEO_DEFECTO,
  );

  it("los avanzados suman al mismo puntaje y bloqueos que el panel y el PDF", () => {
    const solo = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10 });
    const con = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10, extra });
    expect(solo.score).toBe(100);
    expect(con.score).toBe(100 - 20 - 5);
    expect(con.bloqueos).toBe(1);
    expect(con.advertencias).toBe(1);
    expect(con.problemas[0].key).toBe("guia_repetida");
    expect(con.enOrden.map((c) => c.key)).toEqual(expect.arrayContaining(["plan_por_vencer", "fechas_fuera_de_orden", "gtf_fantasma"]));
  });

  it("los de siempre caen en su sección con su norma", () => {
    const r = computeLothCompliance({ anomalias: [], caratula: null, totalLineas: 0 });
    const caratula = r.checks.find((c) => c.key === "caratula");
    const fantasma = r.checks.find((c) => c.key === "gtf_fantasma");
    expect(caratula && seccionDe(caratula)).toBe("libro");
    expect(fantasma && seccionDe(fantasma)).toBe("guias");
    expect(fantasma && normaDe(fantasma)).toContain("Ley 29763");
  });

  it("agrupa en las 5 secciones, filtra por severidad y deja lo en orden aparte", () => {
    const { checks } = computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10, extra });
    const todas = agruparPorSeccion(checks, "todas");
    expect(todas.map((s) => s.id)).toEqual(SECCIONES.map((s) => s.id));
    const guias = todas.find((s) => s.id === "guias");
    expect(guias?.problemas.map((c) => c.key)).toEqual(["guia_repetida", "guia_sin_transporte"]);
    expect(guias?.multas).toBe(1);
    expect(guias?.advertencias).toBe(1);

    const multas = agruparPorSeccion(checks, "multa").find((s) => s.id === "guias");
    expect(multas?.problemas.map((c) => c.key)).toEqual(["guia_repetida"]);
    expect(multas?.enOrden.map((c) => c.key)).toContain("gtf_fantasma");

    expect(cuentaPorSeveridad(checks)).toEqual({ todas: 2, multa: 1, advertencia: 1 });
  });
});
