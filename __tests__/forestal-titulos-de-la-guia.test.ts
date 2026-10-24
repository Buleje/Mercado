import { describe, it, expect } from "vitest";
import {
  buscarTitulo,
  completarGuiaConTitulo,
  enumerar,
  titulosElegibles,
  type TituloDeFicha,
} from "@/lib/forestal/titulos-de-la-guia";
import type { Contrato } from "@/lib/forestal/contratos";

/**
 * Con qué título habilitante sale la madera en la GTF.
 *
 * Los casos NO son inventados: salen de lo medido en el tenant de QA (`main`,
 * 2026-09-21) con `GET /api/admin/forestal/contratos` y `GET .../ctp-ficha` —
 * la Ficha declaraba UN título (`CONC-25-001`, con su resolución y su plan) y
 * había SEIS permisos cargados, uno de ellos el mismo `CONC-25-001` escrito por
 * otra pantalla, con titular «(por confirmar)» y sin resolución.
 */

const permiso = (p: Partial<Contrato> & { id: string; codigo: string }): Contrato => ({
  codigoNorm: p.codigo.toUpperCase(),
  alias: null,
  titularNombre: "",
  titularId: null,
  titularDoc: null,
  titularDocTipo: null,
  resolucionNumero: null,
  resolucionFecha: null,
  tipo: null,
  arffs: null,
  region: null,
  provincia: null,
  distrito: null,
  areaHa: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  estado: "vigente",
  planId: null,
  notas: null,
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  ...p,
});

/** El único título de la Ficha del tenant de QA, tal cual está guardado. */
const TITULO_FICHA: TituloDeFicha = {
  tipo: "concesion",
  codigo: "CONC-25-001",
  resolucion: "R.D. N° 0142-2025-GORE-UCAYALI",
  planManejo: "Plan de Manejo Forestal Intermedio (PMFI)",
  vencimiento: "2030-12-31",
};

/** Los seis permisos cargados en QA, con sus datos reales. */
const PERMISOS_QA: Contrato[] = [
  permiso({ id: "c1", codigo: "QA-ADR425-0001", titularNombre: "QA ADR-425 Permisos", tipo: "PER-FMC", areaHa: 850.25, estado: "cerrado" }),
  permiso({ id: "c2", codigo: "19-SEC/PER-FMC-2024-008", titularNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", tipo: "PER-FMC", areaHa: 1250.5 }),
  permiso({ id: "c3", codigo: "CON-25-PAS-0033", titularNombre: "Maderera El Aguajal SAC", tipo: "CONCESION" }),
  permiso({ id: "c4", codigo: "CON-25-UCA-0142", titularNombre: "Maderera El Aguajal SAC", tipo: "CONCESION" }),
  permiso({ id: "c5", codigo: "CON-25-UCA-0207", titularNombre: "Forestal Río Pachitea EIRL", tipo: "CONCESION" }),
  permiso({ id: "c6", codigo: "CONC-25-001", titularNombre: "(por confirmar)", tipo: "otro" }),
];

describe("titulosElegibles — qué se le ofrece a la guía", () => {
  it("ofrece las dos fuentes sin mezclarlas y sin repetir el que está en las dos", () => {
    const { ficha, permisos } = titulosElegibles([TITULO_FICHA], PERMISOS_QA);

    expect(ficha.map((t) => t.codigo)).toEqual(["CONC-25-001"]);
    // Los cinco que ANTES sólo se podían tipear a mano.
    expect(permisos.map((t) => t.codigo)).toEqual([
      "QA-ADR425-0001",
      "19-SEC/PER-FMC-2024-008",
      "CON-25-PAS-0033",
      "CON-25-UCA-0142",
      "CON-25-UCA-0207",
    ]);
    expect(permisos.every((t) => t.fuente === "permiso")).toBe(true);
  });

  it("la opción del permiso muestra lo que la distingue: código, titular y área", () => {
    const { permisos } = titulosElegibles([], PERMISOS_QA);
    expect(permisos[1].etiqueta).toBe("19-SEC/PER-FMC-2024-008 · COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI · 1,250.50 ha");
    // Sin área cargada NO se escribe «0 ha»: se omite.
    expect(permisos[2].etiqueta).toBe("CON-25-PAS-0033 · Maderera El Aguajal SAC");
  });

  it("dedup por código normalizado: la Ficha y el permiso escriben el mismo papel distinto", () => {
    const { ficha, permisos } = titulosElegibles(
      [{ ...TITULO_FICHA, codigo: "  conc-25-001 " }],
      [permiso({ id: "c6", codigo: "CONC-25-001", titularNombre: "(por confirmar)" })],
    );
    expect(permisos).toHaveLength(0);
    // Se conserva la grafía de la Ficha: es la que se imprime en el papel.
    expect(ficha[0].codigo).toBe("conc-25-001");
    expect(ficha[0].fuente).toBe("ficha");
  });

  it("el permiso completa lo que la Ficha no tiene, pero la Ficha manda donde las dos escribieron", () => {
    const { ficha } = titulosElegibles(
      [{ codigo: "CONC-25-001", resolucion: "R.D. 0142", planManejo: "" }],
      [permiso({ id: "c6", codigo: "CONC-25-001", titularNombre: "Maderera X", tipo: "CONCESION", arffs: "GORE Ucayali · DRSAFFS", resolucionNumero: "OTRA-999", areaHa: 12.5 })],
    );
    expect(ficha[0].resolucion).toBe("R.D. 0142");
    expect(ficha[0].planManejo).toBe("Plan Operativo (PO)"); // lo aporta el permiso
    expect(ficha[0].arffs).toBe("GORE Ucayali · DRSAFFS");
    expect(ficha[0].area).toBe("12.50 ha");
    expect(ficha[0].contratoId).toBe("c6");
  });

  it("un permiso dado de baja no se ofrece, y dos filas del mismo código son una sola opción", () => {
    const { permisos } = titulosElegibles([], [
      permiso({ id: "a", codigo: "CON-25-UCA-0142", titularNombre: "Aguajal" }),
      permiso({ id: "b", codigo: "con-25-uca-0142", titularNombre: "Aguajal (repetido)" }),
      permiso({ id: "z", codigo: "CON-25-PAS-0033", isActive: false }),
    ]);
    expect(permisos.map((t) => t.codigo)).toEqual(["CON-25-UCA-0142"]);
  });

  it("aguanta listas vacías, nulas y títulos sin código", () => {
    expect(titulosElegibles(null, null).todos).toEqual([]);
    expect(titulosElegibles([{ codigo: "   " }], []).ficha).toEqual([]);
    expect(titulosElegibles([], [permiso({ id: "x", codigo: "  " })]).permisos).toEqual([]);
  });
});

describe("buscarTitulo — el código elegido, ¿está cargado?", () => {
  const { todos } = titulosElegibles([TITULO_FICHA], PERMISOS_QA);

  it("encuentra sin importar caja ni espacios", () => {
    expect(buscarTitulo(todos, " con-25-uca-0207 ")?.codigo).toBe("CON-25-UCA-0207");
    expect(buscarTitulo(todos, "CONC-25-001")?.fuente).toBe("ficha");
  });

  it("devuelve null para un código que nadie cargó y para el vacío", () => {
    expect(buscarTitulo(todos, "CON-99-XXX-0001")).toBeNull();
    expect(buscarTitulo(todos, "")).toBeNull();
    expect(buscarTitulo(todos, null)).toBeNull();
  });
});

describe("completarGuiaConTitulo — lo que el permiso sabe y la guía pide", () => {
  const vacia = { autoridad: "", planManejoTipo: "" };

  it("completa los casilleros vacíos y dice cuáles", () => {
    const t = titulosElegibles([], [permiso({ id: "c", codigo: "CON-25-UCA-0142", tipo: "CONCESION", arffs: "GORE Ucayali · DRSAFFS" })]).permisos[0];
    const r = completarGuiaConTitulo(vacia, t);
    expect(r.guia).toEqual({ autoridad: "GORE Ucayali · DRSAFFS", planManejoTipo: "Plan Operativo (PO)" });
    expect(r.completados).toEqual(["la autoridad (2)", "el plan de manejo (9)"]);
  });

  it("NUNCA pisa lo que alguien escribió", () => {
    const t = titulosElegibles([], [permiso({ id: "c", codigo: "X-1", tipo: "PER-FMC", arffs: "ATFFS Selva Central" })]).permisos[0];
    const r = completarGuiaConTitulo({ autoridad: "GORE Pasco", planManejoTipo: "DEMA a mano" }, t);
    expect(r.guia).toEqual({});
    expect(r.completados).toEqual([]);
  });

  it("no inventa: sin ARFFS cargada el casillero (2) queda como estaba", () => {
    // 4 de los 6 permisos de QA no tienen ARFFS ni resolución cargadas.
    const t = titulosElegibles([], [permiso({ id: "c", codigo: "CON-25-PAS-0033", tipo: "CONCESION" })]).permisos[0];
    const r = completarGuiaConTitulo(vacia, t);
    expect(r.guia).toEqual({ planManejoTipo: "Plan Operativo (PO)" });
    expect(r.completados).toEqual(["el plan de manejo (9)"]);
  });

  it("un papel que no decide documento de gestión («otro») no completa el (9)", () => {
    const t = titulosElegibles([], [permiso({ id: "c", codigo: "CONC-25-001", tipo: "otro" })]).permisos[0];
    expect(completarGuiaConTitulo(vacia, t)).toEqual({ guia: {}, completados: [] });
  });

  it("sin título elegido no toca nada", () => {
    expect(completarGuiaConTitulo(vacia, null)).toEqual({ guia: {}, completados: [] });
  });

  it("el permiso en comunidad nativa declara DEMA (RJ 001-2018-OSINFOR)", () => {
    const t = titulosElegibles([], [permiso({ id: "c", codigo: "19-SEC/PER-FMC-2024-008", tipo: "PER-FMC" })]).permisos[0];
    expect(completarGuiaConTitulo(vacia, t).guia.planManejoTipo).toBe("Declaración de Manejo (DEMA)");
  });
});

describe("enumerar", () => {
  it("arma la línea que se le muestra al operador", () => {
    expect(enumerar([])).toBe("");
    expect(enumerar(["el plan de manejo (9)"])).toBe("el plan de manejo (9)");
    expect(enumerar(["la autoridad (2)", "el plan de manejo (9)"])).toBe("la autoridad (2) y el plan de manejo (9)");
  });
});
