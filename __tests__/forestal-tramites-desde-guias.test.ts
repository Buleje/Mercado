/**
 * De las guías elegidas en la vista GTF del Libro TH a los casilleros de un
 * formato de Trámites (Brandon 07-10). El caso real que se fija acá: en Blas la
 * GTF 019-001-0000001 está anulada («Importación deshecha») y emitida otra vez
 * — la relación no puede declararla anulada a SERFOR.
 */
import { describe, expect, it } from "vitest";
import {
  datosDesdeGuias,
  esImportacionDeshecha,
  filasNuevas,
  formatosQueAceptan,
  guiaParaFormato,
  marcarReemitidas,
  motivoImportacionDeshecha,
  sumarFilas,
  type GuiaParaFormato,
} from "@/lib/forestal/tramites-desde-guias";
import { parseGuiasInforme } from "@/lib/forestal/tramites-relacion-guias";
import { tablaGuiasHtml } from "@/lib/forestal/tramites-relacion-papel";

function guia(over: Partial<GuiaParaFormato> & { id: string; gtfNumber: string }): GuiaParaFormato {
  return {
    gtfDate: "2026-09-02",
    tipo: "trozas",
    status: "emitida",
    annulledReason: null,
    updatedAt: "2026-09-02T15:00:00.000Z",
    tituloHabilitante: "19-SEC/REG-PLT-2025-096",
    titularName: "INVERSIONES AGROFORESTALES BLAS SAC",
    destino: "Aserradero Blas",
    placaVehiculo: "V2H-901",
    conductor: "RUBEN BAZAN ROSALES",
    volumenTotalM3: 1.43,
    piezasTotal: 2,
    items: [
      { code: "1", species: "TORNILLO", diamMayorM: 0.56, diamMenorM: 0.52, lengthM: 3.1, volumeM3: 0.71 },
      { code: "12A (0000002)", codigoGuia: "12A", species: "TORNILLO", lengthM: 3, volumeM3: 0.72 },
    ],
    ...over,
  };
}

describe("formatosQueAceptan", () => {
  it("la relación va primero y acepta varias; los de una sola guía dicen por qué no", () => {
    const ops = formatosQueAceptan([
      { gtfNumber: "019-001-0000001", status: "emitida" },
      { gtfNumber: "019-001-0000002", status: "anulada" },
      { gtfNumber: "019-001-0000003", status: "emitida" },
    ]);
    expect(ops[0].formato.id).toBe("relacion-guias-serfor");
    expect(ops[0].habilitado).toBe(true);
    const anulacion = ops.find((o) => o.formato.id === "anulacion-gtf")!;
    expect(anulacion.habilitado).toBe(false);
    expect(anulacion.motivo).toMatch(/elegiste 3/);
    expect(ops.find((o) => o.formato.id === "reposicion-talonario-gtf")!.habilitado).toBe(true);
  });

  it("la anulación pide una anulada; la pérdida, una vigente", () => {
    const vigente = formatosQueAceptan([{ gtfNumber: "001-0000120", status: "emitida" }]);
    expect(vigente.find((o) => o.formato.id === "anulacion-gtf")!.motivo).toMatch(/anulada/);
    expect(vigente.find((o) => o.formato.id === "comunicacion-perdida-gtf-serfor")!.habilitado).toBe(true);
    const anulada = formatosQueAceptan([{ gtfNumber: "001-0000122", status: "anulada" }]);
    expect(anulada.find((o) => o.formato.id === "anulacion-gtf")!.habilitado).toBe(true);
    expect(anulada.find((o) => o.formato.id === "denuncia-policial-perdida-gtf")!.habilitado).toBe(false);
  });

  it("el rango no mezcla talonarios, pero 019-001 y 19-001 son la misma serie", () => {
    const mezcla = formatosQueAceptan([
      { gtfNumber: "019-001-0000001", status: "emitida" },
      { gtfNumber: "010-001-0000009", status: "anulada" },
    ]);
    expect(mezcla.find((o) => o.formato.id === "reposicion-talonario-gtf")!.motivo).toMatch(/series distintas/);
    const misma = formatosQueAceptan([
      { gtfNumber: "019-001-0000001", status: "emitida" },
      { gtfNumber: "19-001-0000004", status: "emitida" },
    ]);
    expect(misma.find((o) => o.formato.id === "reposicion-talonario-gtf")!.habilitado).toBe(true);
  });

  it("sin guías nada se puede usar", () => {
    expect(formatosQueAceptan([]).every((o) => !o.habilitado)).toBe(true);
  });
});

describe("datosDesdeGuias — relación de guías", () => {
  it("llena la tabla con permiso, trozas con el código como lo imprime la guía (SNIFFS), período y serie", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [
      guia({ id: "b", gtfNumber: "019-001-0000002", gtfDate: "2026-09-05" }),
      guia({ id: "a", gtfNumber: "019-001-0000001", gtfDate: "2026-09-02" }),
    ])!;
    const filas = parseGuiasInforme(r.datos.guiasJson);
    expect(filas.map((f) => f.numero)).toEqual(["019-001-0000001", "019-001-0000002"]);
    expect(filas[0].permiso).toBe("19-SEC/REG-PLT-2025-096");
    expect(filas[0].origen).toBe("loth");
    expect(filas[0].cantidad).toBe("1.43");
    /* Lo que va a SERFOR coincide con SNIFFS: «12A», nunca el único del libro «12A (0000002)». */
    expect(filas[0].trozas.split("\n")[1]).toMatch(/^12A · TORNILLO/);
    expect(filas[0].trozas).not.toContain("0000002)");
    expect(r.datos.periodoDesde).toBe("2026-09-02");
    expect(r.datos.periodoHasta).toBe("2026-09-05");
    expect(r.datos.serieGtfInforme).toBe("019-001");
    expect(r.datos.entidadNombre).toBe("INVERSIONES AGROFORESTALES BLAS SAC");
    expect(r.avisos.join(" ")).toMatch(/período sale de las fechas/);
    /* El papel imprime la columna Permiso. */
    expect(tablaGuiasHtml(filas)).toContain("<th>Permiso</th>");
  });

  it("Blas 019-001-0000001: la anulada que también está emitida NO va, con aviso; se puede incluir a pedido", () => {
    const anulada = guia({ id: "x", gtfNumber: "019-001-0000001", status: "anulada", annulledReason: "Importación deshecha: FGF" });
    const emitida = guia({ id: "y", gtfNumber: "019-001-0000001" });
    const r = datosDesdeGuias("relacion-guias-serfor", [anulada, emitida])!;
    const filas = parseGuiasInforme(r.datos.guiasJson);
    expect(filas).toHaveLength(1);
    expect(filas[0].anulada).toBe(false);
    expect(r.reemitidasExcluidas).toEqual(["019-001-0000001"]);
    expect(r.avisos[0]).toMatch(/anulada y también emitida/);

    const igual = datosDesdeGuias("relacion-guias-serfor", [anulada, emitida], { incluirAnuladasReemitidas: true })!;
    expect(parseGuiasInforme(igual.datos.guiasJson)).toHaveLength(2);
    expect(igual.avisos.join(" ")).toMatch(/confirma que de verdad se anuló/);
  });

  it("la anulada marcada por el servidor como reemitida tampoco va aunque la emitida no esté elegida", () => {
    const [marcada] = marcarReemitidas([guia({ id: "x", gtfNumber: "019-001-0000001", status: "anulada" })], ["19-001-1"]);
    expect(marcada.reemitida).toBe(true);
    const r = datosDesdeGuias("relacion-guias-serfor", [marcada, guia({ id: "z", gtfNumber: "019-001-0000007" })])!;
    expect(parseGuiasInforme(r.datos.guiasJson).map((f) => f.numero)).toEqual(["019-001-0000007"]);
  });

  it("anulada por «Deshacer la importación» sin reemitir: NO va como anulada (con aviso) y la anulación no se puede comunicar", () => {
    const motivo = motivoImportacionDeshecha("FGF");
    expect(esImportacionDeshecha(motivo)).toBe(true);
    expect(esImportacionDeshecha("Error de llenado")).toBe(false);
    const fila = guiaParaFormato({ id: "x", gtfNumber: "019-001-0000007", gtfDate: new Date("2026-10-01"), status: "anulada", annulledReason: motivo, updatedAt: new Date(), items: [] });
    const [g] = marcarReemitidas([fila], []);
    expect(g.reemitida).toBeUndefined();

    const r = datosDesdeGuias("relacion-guias-serfor", [g])!;
    expect(parseGuiasInforme(r.datos.guiasJson)).toHaveLength(0);
    expect(r.reemitidasExcluidas).toEqual(["019-001-0000007"]);
    expect(r.avisos.join(" ")).toMatch(/deshacer su importación/);
    /* «Incluirla igual» la mete, con su propio aviso. */
    const igual = datosDesdeGuias("relacion-guias-serfor", [g], { incluirAnuladasReemitidas: true })!;
    expect(parseGuiasInforme(igual.datos.guiasJson)[0]).toMatchObject({ anulada: true, motivo });
    expect(igual.avisos.join(" ")).toMatch(/confirma que de verdad se anuló/);

    const anulacion = formatosQueAceptan([g]).find((o) => o.formato.id === "anulacion-gtf");
    expect(anulacion).toMatchObject({ habilitado: false });
    expect(anulacion?.motivo).toMatch(/deshacer su importación/);
    expect(datosDesdeGuias("anulacion-gtf", [g])).toBeNull();
  });

  it("«Incluirla igual» con el formulario abierto suma sólo la fila excluida, sin pisar lo tipeado", () => {
    const anulada = guia({ id: "x", gtfNumber: "019-001-0000003", gtfDate: "2026-09-03", status: "anulada", annulledReason: motivoImportacionDeshecha("FGF") });
    const emitidas = [guia({ id: "a", gtfNumber: "019-001-0000001", gtfDate: "2026-09-02" }), guia({ id: "b", gtfNumber: "019-001-0000005", gtfDate: "2026-09-05" })];
    const antes = datosDesdeGuias("relacion-guias-serfor", [...emitidas, anulada])!;
    /* El operador corrigió el destino de la 1.ª y quitó la 2.ª. */
    const [f1] = parseGuiasInforme(antes.datos.guiasJson);
    const tipeado = JSON.stringify([{ ...f1, destinatario: "Corregido a mano" }]);
    const despues = datosDesdeGuias("relacion-guias-serfor", [...emitidas, anulada], { incluirAnuladasReemitidas: true })!;
    const filas = parseGuiasInforme(sumarFilas(tipeado, filasNuevas(antes.datos.guiasJson, despues.datos.guiasJson)));
    expect(filas.map((f) => f.numero)).toEqual(["019-001-0000001", "019-001-0000003"]);
    expect(filas[0].destinatario).toBe("Corregido a mano");
    expect(filas[1].anulada).toBe(true);
  });

  it("la misma anulada repetida (se reimportó) va una sola vez", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [
      guia({ id: "1", gtfNumber: "010-001-0000007", status: "anulada", updatedAt: "2026-09-02T10:00:00Z" }),
      guia({ id: "2", gtfNumber: "010-001-0000007", status: "anulada", updatedAt: "2026-09-03T10:00:00Z" }),
    ])!;
    expect(parseGuiasInforme(r.datos.guiasJson)).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/una sola vez/);
  });

  it("titular distinto del de la Ficha CTP: avisa revisar RUC y representante", () => {
    const r = datosDesdeGuias("relacion-guias-serfor", [guia({ id: "a", gtfNumber: "019-001-0000001", titularName: "Comunidad Nativa X" })], {
      razonSocialFicha: "Inversiones Agroforestales Blas S.A.",
    })!;
    expect(r.datos.entidadNombre).toBe("Comunidad Nativa X");
    expect(r.avisos.join(" ")).toMatch(/revisa RUC y representante/);
  });
});

describe("datosDesdeGuias — una guía y rangos", () => {
  it("anulación: N°, emisión, motivo y la fecha de anulación DERIVADA con su aviso", () => {
    const r = datosDesdeGuias("anulacion-gtf", [
      guia({ id: "a", gtfNumber: "001-0000122", status: "anulada", annulledReason: "Error de llenado", updatedAt: "2026-09-10T03:00:00.000Z" }),
    ])!;
    expect(r.datos).toMatchObject({ numeroGtfAnulada: "001-0000122", fechaEmisionOriginal: "2026-09-02", motivoAnulacion: "Error de llenado" });
    /* 03:00 UTC del 10 = 22:00 del 09 en Lima. */
    expect(r.datos.fechaAnulacion).toBe("2026-09-09");
    expect(r.avisos[0]).toMatch(/sale de la última modificación/);
  });

  it("pérdida: especie, volumen, destino, conductor y placa", () => {
    const serfor = datosDesdeGuias("comunicacion-perdida-gtf-serfor", [guia({ id: "a", gtfNumber: "001-0000120" })])!;
    expect(serfor.datos).toMatchObject({
      numeroGtfPerdidaSerfor: "001-0000120",
      especieProductoPerdidoSerfor: "TORNILLO (2 trozas)",
      volumenAmparadoPerdidoSerfor: "1.430",
      destinoGuiaPerdida: "Aserradero Blas",
    });
    const denuncia = datosDesdeGuias("denuncia-policial-perdida-gtf", [guia({ id: "a", gtfNumber: "001-0000120" })])!;
    expect(denuncia.datos).toMatchObject({ personaACargoGtf: "RUBEN BAZAN ROSALES", vehiculoPlacaGtf: "V2H-901", volumenAmparadoPerdido: "1.430" });
  });

  it("reposición: serie y rango del-al, avisando los huecos; visado: el último correlativo", () => {
    const tres = [
      guia({ id: "a", gtfNumber: "019-001-0000009" }),
      guia({ id: "b", gtfNumber: "019-001-0000005" }),
      guia({ id: "c", gtfNumber: "019-001-0000006" }),
    ];
    const r = datosDesdeGuias("reposicion-talonario-gtf", tres)!;
    /* ADR-487: con un solo permiso en las guías, su código va al título de la carta. */
    expect(r.datos).toEqual({ serieExtraviada: "019-001", rangoNumeros: "019-001-0000005 al 019-001-0000009", permisoCodigo: "19-SEC/REG-PLT-2025-096" });
    expect(r.avisos[0]).toMatch(/incluye 2 N° que no elegiste/);
    const visado = datosDesdeGuias("visado-talonario-gtf", tres)!;
    expect(visado.datos).toEqual({ serieActual: "019-001", ultimoCorrelativo: "0000009", permisoCodigo: "19-SEC/REG-PLT-2025-096" });
    /* Con guías de dos permisos no se elige por el operador: sin título de permiso. */
    const mezcla = datosDesdeGuias("visado-talonario-gtf", [...tres, guia({ id: "d", gtfNumber: "019-001-0000010", tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007" })])!;
    expect(mezcla.datos.permisoCodigo).toBeUndefined();
  });

  it("lo que no sirve devuelve null (el menú ya lo deshabilita)", () => {
    expect(datosDesdeGuias("anulacion-gtf", [guia({ id: "a", gtfNumber: "1" })])).toBeNull();
    expect(datosDesdeGuias("carta-generica", [guia({ id: "a", gtfNumber: "1" })])).toBeNull();
  });
});

describe("guiaParaFormato", () => {
  it("convierte Decimal, Date e ítems sueltos de la fila de Prisma", () => {
    const g = guiaParaFormato({
      id: "g1",
      gtfNumber: "019-001-0000001",
      gtfDate: new Date("2026-09-02T00:00:00.000Z"),
      status: "anulada",
      updatedAt: new Date("2026-10-07T09:36:14.047Z"),
      volumenTotalM3: { toString: () => "20.3030" },
      items: [{ code: "1", treeCode: "1", volumeM3: 0.71, species: "TORNILLO" }, null, "basura"],
    });
    expect(g).toMatchObject({ gtfDate: "2026-09-02", status: "anulada", volumenTotalM3: 20.303, updatedAt: "2026-10-07T09:36:14.047Z" });
    expect(g.items).toHaveLength(1);
    expect(g.items[0]).toMatchObject({ code: "1", treeCode: "1", volumeM3: 0.71 });
  });
});
