/**
 * «Importar guías despachadas» (ADR-461) — lo puro de la pantalla: leer los N°
 * de registro pegados, agrupar la vista previa por permiso y la decisión
 * inicial de cada grupo (permiso + tala referencial).
 */

import { describe, expect, it } from "vitest";
import {
  agruparPorPermiso,
  decisionInicial,
  enOrdenDeImportacion,
  esImportable,
  estadoEfectivo,
  faltaMotivoDeCupo,
  planNuevoCompleto,
  registrosDelTexto,
  respuestaDe,
} from "@/components/admin/forestal/hooks/importar-guias-pantalla";
import type {
  GuiaVistaPrevia,
  SobreCupoDeLaGuia,
  PlanNuevoPropuesto,
  PermisoDetectado,
} from "@/lib/forestal/loth-importar-guia-tipos";

const propuesta = (over: Partial<PlanNuevoPropuesto> = {}): PlanNuevoPropuesto => ({
  planType: "PMFI",
  planNumber: null,
  tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007",
  titularName: "PEREZ MUÑOZ JUAN CARLOS",
  representanteLegal: null,
  resolucionNumber: null,
  region: "HUANUCO",
  provincia: "PUERTO INCA",
  distrito: null,
  arffs: null,
  contratoId: null,
  ...over,
});

function guia(
  clave: string,
  permiso: PermisoDetectado | null,
  over: Partial<GuiaVistaPrevia> = {},
): GuiaVistaPrevia {
  return {
    clave,
    fuente: { tipo: "serfor", numeroRegistro: clave },
    estado: "lista",
    estadoSinTala: "lista",
    mensaje: null,
    guia: {
      numeroRegistro: clave,
      gtfNumber: `010-001-${clave}`,
      fecha: "2026-09-10",
      estadoSerfor: "Activa",
      anulada: false,
      titular: "PEREZ MUÑOZ JUAN CARLOS",
      representanteLegal: null,
      numeroTitulo:
        permiso?.estado === "existente" ? permiso.plan.codigo : "10-hua-pue/PER-FMP-2026-007",
      origenRecurso: "PERMISO",
      destinatario: null,
      volumenDeclaradoM3: 5,
      volumenTrozasM3: 5,
      piezas: 2,
      especies: ["Copaiba"],
      verificadaEnSerfor: true,
    },
    permiso,
    trozas: [],
    talas: [],
    crearTalaPorDefecto: true,
    avisos: [],
    ...over,
  };
}

describe("registrosDelTexto", () => {
  it("lee uno por línea, separados por coma o con rótulo, y deja los guiones", () => {
    const r = registrosDelTexto(
      "1-19-0313629\n110-19-0469791, 1-10-0474633;N° REGISTRO: 1-19-0300920.",
    );
    expect(r.validos).toEqual(["1-19-0313629", "110-19-0469791", "1-10-0474633", "1-19-0300920"]);
    expect(r.invalidos).toEqual([]);
    expect(r.gtf).toEqual([]);
  });

  it("un N° de GTF impreso no se manda como registro: se avisa", () => {
    const r = registrosDelTexto("019-001-0000004 019-0000001 1-19-0313629");
    expect(r.gtf).toEqual(["019-001-0000004", "019-0000001"]);
    expect(r.validos).toEqual(["1-19-0313629"]);
  });

  it("no repite y marca lo que no tiene forma de registro", () => {
    const r = registrosDelTexto("1-19-0313629 1-19-0313629 12 abc");
    expect(r.validos).toEqual(["1-19-0313629"]);
    expect(r.invalidos).toEqual(["12"]);
  });
});

describe("agruparPorPermiso", () => {
  const existente: PermisoDetectado = {
    estado: "existente",
    plan: {
      planId: "p1",
      planType: "PO",
      codigo: "PO-2026-001",
      titularName: "X",
      via: "plan",
      especies: [],
    },
  };
  const nuevo: PermisoDetectado = { estado: "nuevo", propuesta: propuesta() };

  it("una decisión por título (sin importar mayúsculas) y lo que no tiene permiso al final", () => {
    const g = agruparPorPermiso([
      guia("a", nuevo),
      guia("b", null, { estado: "no_encontrada", guia: null }),
      guia("c", existente),
      guia("d", nuevo, {
        guia: { ...guia("d", nuevo).guia!, numeroTitulo: "10-HUA-PUE/PER-FMP-2026-007" },
      }),
    ]);
    expect(g.map((x) => x.clave)).toEqual([
      "titulo:10-HUA-PUE/PER-FMP-2026-007",
      "plan:p1",
      "sin-permiso",
    ]);
    expect(g[0].guias.map((x) => x.clave)).toEqual(["a", "d"]);
  });
});

describe("decisionInicial", () => {
  it("existente y nuevo vienen decididos; ambiguo espera a la persona", () => {
    const [ex] = agruparPorPermiso([
      guia("a", {
        estado: "existente",
        plan: {
          planId: "p1",
          planType: "DEMA",
          codigo: "c",
          titularName: "t",
          via: "plan",
          especies: [],
        },
      }),
    ]);
    expect(decisionInicial(ex).destino).toEqual({ tipo: "existente", planId: "p1" });

    const [nu] = agruparPorPermiso([guia("a", { estado: "nuevo", propuesta: propuesta() })]);
    expect(decisionInicial(nu).destino).toEqual({ tipo: "nuevo", plan: propuesta() });

    const [am] = agruparPorPermiso([
      guia("a", { estado: "ambiguo", candidatos: [], propuesta: propuesta() }),
    ]);
    expect(decisionInicial(am).destino).toBeNull();
  });

  it("la tala sigue al servidor: apagada en plantación", () => {
    const [pl] = agruparPorPermiso([
      guia(
        "a",
        { estado: "nuevo", propuesta: propuesta({ planType: "PLANTACION" }) },
        { crearTalaPorDefecto: false },
      ),
    ]);
    expect(decisionInicial(pl).crearTala).toBe(false);
    const [pm] = agruparPorPermiso([guia("a", { estado: "nuevo", propuesta: propuesta() })]);
    expect(decisionInicial(pm).crearTala).toBe(true);
  });
});

describe("planNuevoCompleto y esImportable", () => {
  it("sin titular o sin código no se crea; el código va donde corresponde al tipo", () => {
    expect(planNuevoCompleto(propuesta())).toBe(true);
    expect(planNuevoCompleto(propuesta({ titularName: " " }))).toBe(false);
    expect(planNuevoCompleto(propuesta({ planType: "PLANTACION", planNumber: null }))).toBe(false);
    expect(
      planNuevoCompleto(
        propuesta({ planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2021-017" }),
      ),
    ).toBe(true);
  });

  it("sólo «lista» y «elegir permiso» se importan", () => {
    expect(esImportable(guia("a", null))).toBe(true);
    expect(esImportable(guia("a", null, { estado: "elegir_permiso" }))).toBe(true);
    for (const estado of ["ya_importada", "bloqueada", "no_encontrada", "sin_respuesta"] as const) {
      expect(esImportable(guia("a", null, { estado }))).toBe(false);
    }
  });
});

describe("con y sin tala", () => {
  it("apagar la tala usa el estado «sin tala»: un choque de tala deja de bloquear", () => {
    const g = guia("a", null, { estado: "bloqueada", estadoSinTala: "lista" });
    expect(estadoEfectivo(g, true)).toBe("bloqueada");
    expect(estadoEfectivo(g, false)).toBe("lista");
    expect(esImportable(g, true)).toBe(false);
    expect(esImportable(g, false)).toBe(true);
  });

  it("la decisión inicial mira la primera guía importable CON tala (no el índice del find)", () => {
    const nuevo: PermisoDetectado = { estado: "nuevo", propuesta: propuesta() };
    const [grupo] = agruparPorPermiso([
      guia("a", nuevo, { estado: "bloqueada", estadoSinTala: "lista", crearTalaPorDefecto: false }),
      guia("b", nuevo, { crearTalaPorDefecto: true }),
    ]);
    expect(decisionInicial(grupo).crearTala).toBe(true);
  });
});

describe("T9: el motivo para pasar lo autorizado (04-10)", () => {
  const fila = (fuente: "autorizado" | "censo"): SobreCupoDeLaGuia => ({
    especie: "Tornillo",
    fuente,
    cupoM3: 7,
    totalConLaGuiaM3: 8,
    excesoM3: 1,
    pct: 114.3,
    exigeMotivo: fuente === "autorizado",
    mensaje: "Tornillo: 8,000 de 7,000 m³ autorizados — exceso 1,000 m³",
  });

  it("sobre lo autorizado falta el motivo hasta que tenga 5 letras (el criterio de la ruta)", () => {
    const g = guia("a", null, { sobreCupo: { conTala: [fila("autorizado")], sinTala: [] } });
    expect(faltaMotivoDeCupo(g, true, undefined)).toBe(true);
    expect(faltaMotivoDeCupo(g, true, "....... ")).toBe(true);
    expect(faltaMotivoDeCupo(g, true, "Ampliación en trámite")).toBe(false);
    // Con la tala apagada sólo cuentan las que se agrandan: acá ninguna pasa.
    expect(faltaMotivoDeCupo(g, false, undefined)).toBe(false);
  });

  it("sobre lo censado sólo avisa; sin `sobreCupo` (plan nuevo o vista vieja) no pide nada", () => {
    expect(faltaMotivoDeCupo(guia("a", null, { sobreCupo: { conTala: [fila("censo")], sinTala: [] } }), true, undefined)).toBe(false);
    expect(faltaMotivoDeCupo(guia("b", null), true, undefined)).toBe(false);
  });
});

describe("orden de importación y conteos", () => {
  it("por fecha y N° de guía (numérico), sin fecha al final", () => {
    const xs = [
      { fecha: "2026-09-12", gtfNumber: "010-001-0000010" },
      { fecha: null, gtfNumber: "010-001-0000001" },
      { fecha: "2026-09-10", gtfNumber: "010-001-0000009" },
      { fecha: "2026-09-12", gtfNumber: "010-001-0000008" },
    ];
    expect(enOrdenDeImportacion(xs).map((x) => x.gtfNumber)).toEqual([
      "010-001-0000009",
      "010-001-0000008",
      "010-001-0000010",
      "010-001-0000001",
    ]);
  });

  it("cuenta importadas, ya estaban y rechazadas de lo que volvió", () => {
    const base = {
      mensaje: "",
      codigo: null,
      gtfId: null,
      gtfNumber: null,
      planId: null,
      planCreado: false,
      lineas: null,
      volumenM3: null,
    };
    const r = respuestaDe([
      { ...base, clave: "a", estado: "importada" },
      { ...base, clave: "b", estado: "ya_estaba" },
      { ...base, clave: "c", estado: "rechazada" },
      { ...base, clave: "d", estado: "importada" },
    ]);
    expect([r.importadas, r.yaEstaban, r.rechazadas]).toEqual([2, 1, 1]);
  });
});
