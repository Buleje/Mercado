import { describe, it, expect } from "vitest";
import { aISO, discrepanciasConLaGuia, gtfDatosDesdeSerfor, tipoDeDocumento } from "@/lib/forestal/serfor-gtf-a-datos";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

/**
 * ADR-336 — el propietario del producto (casilleros 13-21) entra al libro.
 *
 * La ficha de SERFOR y la carga manual tienen que dejar el MISMO dato: si cada
 * camino guarda lo suyo, el libro dice dos cosas distintas sobre la misma guía
 * y un fiscalizador cruza justo eso.
 */

const guia = (over: Partial<GtfSerfor> = {}): GtfSerfor => ({
  numeroRegistro: "2-25-0002326",
  gtfNumber: "019-0000001",
  estado: "ACTIVA",
  registradoPor: null,
  fechaRegistro: null,
  fechaExpedicion: "18/11/2024",
  fechaVencimiento: "25/11/2024",
  origenRecurso: "PERMISO",
  numeroTitulo: "19-SEC/PER-FMC-2024-008",
  titular: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  direccionTitular: null,
  numeroResolucion: "R.A N° D000485-2024-MIDAGRI-SERFOR-ATFFS",
  representanteLegal: "OSVALDO MUÑOS DIAS",
  departamento: "PASCO",
  provincia: "OXAPAMPA",
  distrito: "PUERTO BERMUDEZ",
  rucInstancia: null,
  instanciaRegistra: "ATFFS SELVA CENTRAL",
  propietario: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  propietarioDoc: "20156701263 / 04314730",
  propietarioDireccion: "CC.NN SAN LUIS DE CHINCHIHUANI",
  propietarioDepartamento: "PASCO",
  propietarioProvincia: "OXAPAMPA",
  propietarioDistrito: "PUERTO BERMUDEZ",
  destinatario: "INVERSIONES AGROFORESTALES BLAS SAC",
  destinatarioDoc: "20605859438",
  destinatarioDireccion: "JR. JOSE MARIA ARGUEDAS MZA. 24 LOTE. 04",
  destinatarioDepartamento: "PASCO",
  destinatarioProvincia: "OXAPAMPA",
  destinatarioDistrito: "CONSTITUCION",
  transportista: "RUBEN BAZAN ROSALES",
  transportistaDni: "48831805",
  licenciaConducir: "Q48831805",
  guiaRemision: null,
  tipoTransporte: "Terrestre",
  tipoVehiculo: "Camión / Carreta",
  placa: "W2D-853",
  listaTrozas: "019-0000001",
  productos: [],
  trozas: [],
  volumenTotal: 23.171,
  campos: {},
  ...over,
});

describe("la ficha de SERFOR se lee como el cuerpo de la guía", () => {
  it("trae el propietario del producto con su ubicación (13 a 19)", () => {
    const d = gtfDatosDesdeSerfor(guia());
    expect(d.propietario.nombre).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
    expect(d.propietario.docTipo).toBe("RUC");
    expect(d.propietario.docNumero).toBe("20156701263");
    expect(d.propietario.direccion).toBe("CC.NN SAN LUIS DE CHINCHIHUANI");
    expect(d.propietario.departamento).toBe("PASCO");
    expect(d.propietario.provincia).toBe("OXAPAMPA");
    expect(d.propietario.distrito).toBe("PUERTO BERMUDEZ");
  });

  it("en un ingreso el propietario NUNCA es este CTP", () => {
    expect(gtfDatosDesdeSerfor(guia()).propietario.esElCtp).toBe(false);
  });

  it("trae destinatario, transporte y conductor (22 a 34)", () => {
    const d = gtfDatosDesdeSerfor(guia());
    expect(d.destinatario.nombre).toBe("INVERSIONES AGROFORESTALES BLAS SAC");
    expect(d.destinatario.docNumero).toBe("20605859438");
    expect(d.destinatario.distrito).toBe("CONSTITUCION");
    expect(d.vehiculo.placa).toBe("W2D-853");
    expect(d.vehiculo.tipo).toBe("Camión / Carreta");
    expect(d.vehiculo.conductor).toBe("RUBEN BAZAN ROSALES");
    expect(d.vehiculo.conductorDni).toBe("48831805");
    expect(d.vehiculo.licencia).toBe("Q48831805");
  });

  it("convierte la vigencia dd/mm/aaaa a la del formulario (3 y 4)", () => {
    const d = gtfDatosDesdeSerfor(guia());
    expect(d.traslado.fechaInicio).toBe("2024-11-18");
    expect(d.traslado.fechaFin).toBe("2024-11-25");
  });

  it("guarda el título habilitante y el N° de lista de trozas (6 y 35)", () => {
    const d = gtfDatosDesdeSerfor(guia());
    expect(d.titulos).toEqual(["19-SEC/PER-FMC-2024-008"]);
    expect(d.guia.listaTrozasNro).toBe("019-0000001");
  });

  it("una guía fluvial no se registra como terrestre", () => {
    expect(gtfDatosDesdeSerfor(guia({ tipoTransporte: "Fluvial" })).vehiculo.modo).toBe("fluvial");
  });

  it("NO pisa lo que el operador ya escribió", () => {
    const previo = gtfDatosVacio();
    previo.vehiculo.placa = "ABC-123";
    previo.propietario.nombre = "OTRO DUEÑO";
    const d = gtfDatosDesdeSerfor(guia(), previo);
    expect(d.vehiculo.placa).toBe("ABC-123");
    expect(d.propietario.nombre).toBe("OTRO DUEÑO");
    // Lo que estaba vacío sí se completa.
    expect(d.destinatario.nombre).toBe("INVERSIONES AGROFORESTALES BLAS SAC");
  });

  it("lo que la ficha no trae queda vacío, no inventado", () => {
    const d = gtfDatosDesdeSerfor(guia({ propietario: null, propietarioDoc: null, placa: null }));
    expect(d.propietario.nombre).toBe("");
    expect(d.propietario.docNumero).toBe("");
    expect(d.vehiculo.placa).toBe("");
  });
});

describe("tipo de documento por su forma", () => {
  it("8 dígitos es DNI, 11 es RUC", () => {
    expect(tipoDeDocumento("04314730")).toBe("DNI");
    expect(tipoDeDocumento("20156701263")).toBe("RUC");
  });
  it("ante la duda deja RUC (el caso de quien mueve madera)", () => {
    expect(tipoDeDocumento("")).toBe("RUC");
    expect(tipoDeDocumento("X-99")).toBe("RUC");
  });
});

describe("fechas", () => {
  it("acepta ISO y dd/mm/aaaa, y rechaza basura", () => {
    expect(aISO("18/11/2024")).toBe("2024-11-18");
    expect(aISO("2024-11-18")).toBe("2024-11-18");
    expect(aISO("noviembre")).toBe("");
    expect(aISO(null)).toBe("");
  });
});

describe("discrepancias contra la guía", () => {
  it("avisa cuando el ingreso declara otra cosa que el documento", () => {
    const d = gtfDatosDesdeSerfor(guia());
    d.vehiculo.placa = "XYZ-999";
    const avisos = discrepanciasConLaGuia(d, guia());
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("Placa");
    expect(avisos[0]).toContain("W2D-853");
  });

  it("no avisa de lo que coincide ni de lo que está vacío", () => {
    expect(discrepanciasConLaGuia(gtfDatosDesdeSerfor(guia()), guia())).toHaveLength(0);
    expect(discrepanciasConLaGuia(gtfDatosVacio(), guia())).toHaveLength(0);
  });
});
