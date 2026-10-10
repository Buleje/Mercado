/**
 * Guías del Libro CTP («Guías emitidas») a un formato de Trámites (N5, 08-10):
 * la misma selección que la vista GTF del Libro TH, con las diferencias reales
 * del CTP — el despacho declara producto en su unidad (pt, m³), una GTF puede
 * amparar varias líneas, no hay lista de trozas y el titular de la relación
 * es el CTP. Y las URLs del Libro TH ya generadas (ids sin prefijo) siguen
 * abriendo lo mismo.
 */
import { describe, expect, it } from "vitest";
import {
  contarGuias,
  datosDesdeGuias,
  formatosQueAceptan,
  guiaCtpParaFormato,
  lineasDeLasGuias,
  marcarReemitidas,
  type FilaDespachoCruda,
  type GuiaParaFormato,
} from "@/lib/forestal/tramites-desde-guias";
import {
  agruparPorGuia,
  cantidadesPorUnidad,
  claveDeGuia,
  guiasDeDespachos,
  lineasPorGuia,
  type FilaDespachoGuia,
} from "@/lib/forestal/guias-emitidas";
import { parseGuiasInforme } from "@/lib/forestal/tramites-relacion-guias";
import { idsPorLibro, leerRefGuia, refGuia, urlTramiteConGuias } from "@/components/admin/forestal/tramite-guias-url";

function despacho(over: Partial<FilaDespachoCruda> & { id: string; gtfNumber: string }): FilaDespachoCruda {
  return {
    lineNo: 1,
    entryDate: new Date("2026-10-02T17:00:00.000Z"),
    status: "registrado",
    annulledReason: null,
    updatedAt: new Date("2026-10-02T17:00:00.000Z"),
    destino: "Cliente QA Pucallpa",
    productType: "Madera aserrada",
    speciesCommon: "Tornillo",
    quantity: { toString: () => "1.4876" },
    unit: "m3",
    gtfDatos: {
      titulos: ["25-UCA/C-OPP-J-001-19", "otro"],
      destinatario: { nombre: "Maderas del Oriente SAC" },
      propietario: { nombre: "Tercero Dueño SRL", esElCtp: false },
      vehiculo: { placa: "ABC-123", conductor: "Juan Pérez" },
    },
    ...over,
  };
}

const ctp = (over: Partial<FilaDespachoCruda> & { id: string; gtfNumber: string }): GuiaParaFormato => guiaCtpParaFormato(despacho(over));

describe("tramite-guias-url — el origen de cada id", () => {
  it("el id sin prefijo es del Libro TH (las URLs ya generadas siguen valiendo)", () => {
    expect(leerRefGuia("cmabc123")).toEqual({ libro: "loth", id: "cmabc123" });
    expect(leerRefGuia("loth:cmabc123")).toEqual({ libro: "loth", id: "cmabc123" });
    expect(leerRefGuia("ctp:cmxyz")).toEqual({ libro: "ctp", id: "cmxyz" });
    expect(leerRefGuia("ctp:")).toBeNull();
    expect(leerRefGuia("  ")).toBeNull();
  });

  it("el Libro TH se escribe sin prefijo y el CTP con `ctp:`; se reparten sin repetir", () => {
    expect(refGuia("loth", "a1")).toBe("a1");
    expect(refGuia("ctp", "d1")).toBe("ctp:d1");
    expect(idsPorLibro(["a1", "ctp:d1", "loth:a2", "ctp:d1", "a1"])).toEqual({ loth: ["a1", "a2"], ctp: ["d1"] });
    expect(urlTramiteConGuias("relacion-guias-serfor", ["a1", "a2"])).toBe(
      "/admin?tab=forestal-tramites&formato=relacion-guias-serfor&guias=a1%2Ca2",
    );
    expect(urlTramiteConGuias("relacion-guias-serfor", [refGuia("ctp", "d1")])).toContain("guias=ctp%3Ad1");
  });
});

describe("guiaCtpParaFormato", () => {
  it("lleva el despacho tal cual: unidad, permiso impreso (titulos[0]) y SIN titular", () => {
    const g = ctp({ id: "d1", gtfNumber: " 001-0000120 " });
    expect(g).toMatchObject({
      id: "d1",
      origen: "ctp",
      gtfNumber: "001-0000120",
      gtfDate: "2026-10-02",
      status: "emitida",
      tituloHabilitante: "25-UCA/C-OPP-J-001-19",
      titularName: null,
      placaVehiculo: "ABC-123",
      conductor: "Juan Pérez",
      volumenTotalM3: 1.4876,
      items: [],
      despacho: { especie: "Tornillo", producto: "Madera aserrada", cantidad: 1.4876, unidad: "m3", destinatario: "Maderas del Oriente SAC" },
    });
  });

  it("anulado = status distinto de registrado; pie tablar NO se pasa a m³", () => {
    const g = ctp({ id: "d2", gtfNumber: "001-0000121", status: "anulado", annulledReason: "Error de placa", unit: "pt", quantity: 500 });
    expect(g.status).toBe("anulada");
    expect(g.annulledReason).toBe("Error de placa");
    expect(g.volumenTotalM3).toBeNull();
    expect(g.despacho?.unidad).toBe("pt");
  });

  it("tolera gtfDatos nulo (despacho viejo sin datos de guía)", () => {
    const g = ctp({ id: "d3", gtfNumber: "001-0000122", gtfDatos: null });
    expect(g.tituloHabilitante).toBeNull();
    expect(g.despacho?.destinatario).toBeNull();
  });
});

describe("datosDesdeGuias — relación con guías del CTP", () => {
  it("filas de origen CTP con cantidad y unidad declaradas, permiso y motivo; sin aviso de lista de trozas", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [
      ctp({ id: "d1", gtfNumber: "001-0000120" }),
      ctp({ id: "d2", gtfNumber: "001-0000121", status: "anulado", annulledReason: "Se rompió el papel", unit: "pt", quantity: 500 }),
    ]);
    expect(r).not.toBeNull();
    const filas = parseGuiasInforme(r!.datos.guiasJson);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      uid: "ctp-d1",
      origen: "ctp",
      numero: "001-0000120",
      fecha: "2026-10-02",
      destinatario: "Maderas del Oriente SAC",
      especie: "Tornillo",
      producto: "Madera aserrada",
      cantidad: "1.4876",
      unidad: "m3",
      permiso: "25-UCA/C-OPP-J-001-19",
      anulada: false,
      motivo: "",
    });
    expect(filas[1]).toMatchObject({ origen: "ctp", anulada: true, motivo: "Se rompió el papel", cantidad: "500", unidad: "pt" });
    expect(r!.avisos.join(" ")).not.toMatch(/lista de trozas/);
    /* El titular de la relación del CTP es el CTP (Ficha): no se pisa con el dueño de la madera. */
    expect(r!.datos.entidadNombre).toBeUndefined();
  });

  it("la anulada cuyo N° sigue vigente en el CTP (se anuló la línea y se volvió a registrar) no va como anulada", () => {
    const anulada = ctp({ id: "d2", gtfNumber: "001-0000120", status: "anulado", annulledReason: "Corrección de cantidad" });
    const [marcada] = marcarReemitidas([anulada], ["001-0000120"]);
    expect(marcada.reemitida).toBe(true);
    const r = datosDesdeGuias("relacion-guias-serfor", [marcada])!;
    expect(parseGuiasInforme(r.datos.guiasJson)).toHaveLength(0);
    expect(r.reemitidasExcluidas).toEqual(["001-0000120"]);
    expect(r.avisos[0]).toMatch(/anulada y también emitida/);
  });

  it("una anulada del CTP no se da por reemitida con una GTF del Libro TH del mismo N° (talonarios distintos)", () => {
    const deLoth: GuiaParaFormato = { ...ctp({ id: "x", gtfNumber: "001-0000120" }), origen: "loth", despacho: undefined, items: [] };
    const anuladaCtp = ctp({ id: "d2", gtfNumber: "001-0000120", status: "anulado", annulledReason: "Se mojó" });
    const r = datosDesdeGuias("relacion-guias-serfor", [deLoth, anuladaCtp])!;
    expect(r.reemitidasExcluidas).toEqual([]);
    expect(parseGuiasInforme(r.datos.guiasJson).filter((f) => f.anulada)).toHaveLength(1);
  });

  it("dos líneas de despacho con la misma GTF van en UNA fila, sumadas si tienen la misma unidad, y se avisa", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [
      ctp({ id: "d1", gtfNumber: "001-0000130", lineNo: 3, quantity: 300, unit: "pt", speciesCommon: "Tornillo" }),
      ctp({ id: "d2", gtfNumber: "001-0000130", lineNo: 4, quantity: 200.5, unit: "pt", speciesCommon: "Cumala" }),
    ])!;
    const filas = parseGuiasInforme(r.datos.guiasJson);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ uid: "ctp-d1", especie: "Tornillo, Cumala", cantidad: "500.5", unidad: "pt" });
    expect(r.avisos.find((a) => a.includes("001-0000130"))).toMatch(/2 líneas de despacho \(#3, #4\).*sumadas \(500\.5 pt\)/);
  });

  it("con distinta unidad no se suman: van una tras otra", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [
      ctp({ id: "d1", gtfNumber: "001-0000131", quantity: 300, unit: "pt" }),
      ctp({ id: "d2", gtfNumber: "001-0000131", quantity: 1.2, unit: "m3" }),
    ])!;
    const [fila] = parseGuiasInforme(r.datos.guiasJson);
    expect(fila).toMatchObject({ cantidad: "300 pt + 1.2 m3", unidad: "" });
  });
});

describe("datosDesdeGuias — una guía del CTP", () => {
  it("anulación: fecha derivada de la última modificación (con aviso) y el motivo del libro", () => {
    const g = ctp({
      id: "d2",
      gtfNumber: "001-0000121",
      status: "anulado",
      annulledReason: "Error en la placa",
      updatedAt: new Date("2026-10-04T02:00:00.000Z"),
    });
    const r = datosDesdeGuias("anulacion-gtf", [g])!;
    expect(r.datos).toMatchObject({ numeroGtfAnulada: "001-0000121", fechaEmisionOriginal: "2026-10-02", motivoAnulacion: "Error en la placa", fechaAnulacion: "2026-10-03" });
    expect(r.avisos[0]).toMatch(/sale de la última modificación/);
  });

  it("anulación de una reemitida del CTP: el aviso habla de la línea corregida, no de una importación", () => {
    const [g] = marcarReemitidas([ctp({ id: "d2", gtfNumber: "001-0000120", status: "anulado" })], ["001-0000120"]);
    const r = datosDesdeGuias("anulacion-gtf", [g])!;
    expect(r.avisos.join(" ")).toMatch(/se anuló la línea del despacho para corregirla/);
  });

  it("pérdida en pie tablar: especie con su producto y cantidad; el m³ es un derivado avisado", () => {
    const r = datosDesdeGuias("comunicacion-perdida-gtf-serfor", [ctp({ id: "d1", gtfNumber: "001-0000140", quantity: 424, unit: "pt" })])!;
    expect(r.datos).toMatchObject({
      numeroGtfPerdidaSerfor: "001-0000140",
      especieProductoPerdidoSerfor: "Tornillo (Madera aserrada, 424 pt)",
      volumenAmparadoPerdidoSerfor: "1.000",
      destinoGuiaPerdida: "Cliente QA Pucallpa",
    });
    expect(r.avisos[0]).toMatch(/convertir 424 pt a m³/);
  });

  it("pérdida en unidades: el volumen queda vacío y se pide completarlo", () => {
    const r = datosDesdeGuias("denuncia-policial-perdida-gtf", [ctp({ id: "d1", gtfNumber: "001-0000141", quantity: 12, unit: "unidad" })])!;
    expect(r.datos.volumenAmparadoPerdido).toBeUndefined();
    expect(r.datos).toMatchObject({ personaACargoGtf: "Juan Pérez", vehiculoPlacaGtf: "ABC-123" });
    expect(r.avisos[0]).toMatch(/12 unidades.*completa el volumen/);
  });
});

describe("cantidadesPorUnidad (barra de «Guías emitidas»)", () => {
  const fila = (over: Partial<FilaDespachoGuia> & { id: string }): FilaDespachoGuia => ({
    lineNo: 1,
    entryDate: "2026-10-02T17:00:00.000Z",
    gtfNumber: `001-${over.id}`,
    docType: "GTF",
    destino: null,
    productType: null,
    speciesCommon: null,
    quantity: 1,
    unit: "m3",
    status: "registrado",
    gtfDatos: null,
    serforNumeroRegistro: null,
    serforVerificadoEn: null,
    ...over,
  });

  it("suma por unidad las vigentes, en el orden PT → m³ → unidades → kg, sin convertir", () => {
    const guias = guiasDeDespachos([
      fila({ id: "1", quantity: 1.25, unit: "m3" }),
      fila({ id: "2", quantity: 300, unit: "pt" }),
      fila({ id: "3", quantity: 0.25, unit: "m3" }),
      fila({ id: "4", quantity: 99, unit: "pt", status: "anulado" }),
      fila({ id: "5", quantity: 10, unit: "unidad" }),
    ]);
    expect(cantidadesPorUnidad(guias)).toEqual([
      { unidad: "pt", total: 300 },
      { unidad: "m3", total: 1.5 },
      { unidad: "unidad", total: 10 },
    ]);
  });
});

describe("una guía del CTP = todas sus líneas (08-10)", () => {
  /* La GTF 001-0000150 ampara dos líneas (dos especies en el mismo camión). */
  const l3 = despacho({ id: "d1", gtfNumber: "001-0000150", lineNo: 3, quantity: 300, unit: "pt", speciesCommon: "Tornillo" });
  const l4 = despacho({ id: "d2", gtfNumber: "001-0000150", lineNo: 4, quantity: 200.5, unit: "pt", speciesCommon: "Cumala" });
  const otra = despacho({ id: "d3", gtfNumber: "001-0000151", lineNo: 5 });
  const comoFila = (f: FilaDespachoCruda): FilaDespachoGuia => ({
    id: f.id,
    lineNo: f.lineNo ?? null,
    entryDate: String(f.entryDate instanceof Date ? f.entryDate.toISOString() : f.entryDate),
    gtfNumber: f.gtfNumber,
    docType: "GTF",
    destino: f.destino ?? null,
    productType: f.productType ?? null,
    speciesCommon: f.speciesCommon ?? null,
    quantity: Number(f.quantity),
    unit: f.unit ?? null,
    status: f.status,
    gtfDatos: null,
    serforNumeroRegistro: null,
    serforVerificadoEn: null,
  });

  it("elegir 1 de 2 líneas = la guía entera", () => {
    /* En la lista: la casilla de cualquiera de las dos líneas elige las dos. */
    const lista = guiasDeDespachos([l3, l4, otra].map(comoFila));
    const porGuia = lineasPorGuia(lista);
    expect([...(porGuia.get(claveDeGuia(lista.find((g) => g.despachoId === "d1")!)) ?? [])].sort()).toEqual(["d1", "d2"]);
    /* La barra cuenta guías, no líneas. */
    expect(agruparPorGuia(lista.filter((g) => g.despachoId !== "d3"))).toHaveLength(1);

    /* El servidor: con el id de UNA línea (una URL vieja) vuelve la guía entera. */
    const { filas, faltan } = lineasDeLasGuias(["d1"], [l3], [l3, l4]);
    expect(filas.map((f) => f.id)).toEqual(["d1", "d2"]);
    expect(faltan).toBe(0);
    const guias = filas.map(guiaCtpParaFormato);

    /* La relación declara la carga entera, en una fila y con aviso. */
    const rel = datosDesdeGuias("relacion-guias-serfor", guias)!;
    const [fila, ...resto] = parseGuiasInforme(rel.datos.guiasJson);
    expect(resto).toHaveLength(0);
    expect(fila).toMatchObject({ cantidad: "500.5", unidad: "pt", especie: "Tornillo, Cumala" });

    /* Es UNA guía: la pérdida no se bloquea con «elegiste 2» y declara las dos líneas. */
    expect(contarGuias(guias)).toBe(1);
    const perdida = formatosQueAceptan(guias).find((o) => o.formato.id === "comunicacion-perdida-gtf-serfor");
    expect(perdida).toMatchObject({ habilitado: true });
    const p = datosDesdeGuias("comunicacion-perdida-gtf-serfor", guias)!;
    expect(p.datos.especieProductoPerdidoSerfor).toBe("Tornillo, Cumala (Madera aserrada, 500.5 pt)");
    expect(p.avisos[0]).toMatch(/ampara 2 líneas de despacho \(#3, #4\): se toman juntas/);
  });

  it("la línea anulada del mismo N° (se corrigió) es otro registro: no se suma a la vigente", () => {
    const corregida = despacho({ id: "d0", gtfNumber: "001-0000150", lineNo: 2, quantity: 999, unit: "pt", status: "anulado" });
    const { filas, vigentes } = lineasDeLasGuias(["d1"], [l3], [corregida, l3, l4]);
    expect(filas.map((f) => f.id)).toEqual(["d1", "d2"]);
    expect(vigentes).toEqual(["001-0000150", "001-0000150"]);
    const lista = guiasDeDespachos([corregida, l3].map(comoFila));
    expect(claveDeGuia(lista[0])).not.toBe(claveDeGuia(lista[1]));
  });

  it("faltan = ids pedidos que ya no están, no la diferencia con las líneas que vuelven", () => {
    expect(lineasDeLasGuias(["d1", "borrado"], [l3], [l3, l4]).faltan).toBe(1);
  });

  it("anuladas repetidas del CTP: el aviso no habla de reimportar (eso es del Libro TH)", () => {
    const a1 = ctp({ id: "a1", gtfNumber: "001-0000160", status: "anulado", lineNo: 1 });
    const a2 = ctp({ id: "a2", gtfNumber: "001-0000160", status: "anulado", lineNo: 2 });
    const r = datosDesdeGuias("relacion-guias-serfor", [a1, a2])!;
    expect(parseGuiasInforme(r.datos.guiasJson).filter((f) => f.anulada)).toHaveLength(1);
    const aviso = r.avisos.find((a) => a.includes("001-0000160"))!;
    expect(aviso).toMatch(/Libro CTP/);
    expect(aviso).not.toMatch(/reimport/);
  });
});
