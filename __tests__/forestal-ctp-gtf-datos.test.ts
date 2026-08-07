import { describe, expect, it } from "vitest";
import {
  COPIAS_GTF,
  faltantesGtf,
  gtfCompleta,
  gtfDatosVacio,
  leerGtfDatos,
  trasladoVigente,
  type GtfDatos,
} from "@/lib/forestal/ctp-gtf-datos";

/**
 * El cuerpo de la GTF de salida. Lo que se prueba acá es la regla de negocio que
 * decide si un papel puede ir a un puesto de control:
 *   · guardar admite huecos (el transportista se define a última hora);
 *   · imprimir el original NO (`faltantesGtf` los enumera y bloquea);
 *   · lo guardado se relee sin tirar aunque venga de una versión vieja.
 */

/** Una guía llena, para ir sacándole campos de a uno. */
function completa(): GtfDatos {
  return {
    ...gtfDatosVacio(),
    propietario: { nombre: "Maderera San Martín SAC", docTipo: "RUC", docNumero: "20512345678", direccion: "Av. Industrial 123, Pucallpa", departamento: "Ucayali", provincia: "Coronel Portillo", distrito: "Callería", zona: "", esElCtp: true },
    destinatario: { nombre: "Distribuidora Lima SAC", docTipo: "RUC", docNumero: "20487654321", direccion: "Av. Argentina 456, Lima", departamento: "Lima", provincia: "Lima", distrito: "Cercado de Lima", zona: "Zona industrial" },
    transportista: { nombre: "Transportes Ucayali EIRL", docTipo: "RUC", docNumero: "20411111111", direccion: "Jr. Tacna 89", departamento: "Ucayali", provincia: "Coronel Portillo", distrito: "Callería", zona: "", registroMtc: "MTC-0099" },
    vehiculo: { modo: "terrestre", placa: "ABC-123", placaRemolque: "XYZ-987", marca: "Volvo", tipo: "Tráiler", embarcacion: "", conductor: "Juan Pérez", conductorDni: "44556677", licencia: "Q44556677", tipoTransporte: "publico" },
    traslado: { puntoPartida: "Pucallpa", puntoLlegada: "Lima", ruta: "Pucallpa – Tingo María – Lima", fechaInicio: "2026-07-20", fechaFin: "2026-07-30" },
    titulos: ["CON-25-TAH-001"],
  };
}

describe("faltantesGtf", () => {
  it("una guía completa no tiene faltantes y se puede imprimir", () => {
    expect(faltantesGtf(completa())).toEqual([]);
    expect(gtfCompleta(completa())).toBe(true);
  });

  it("la guía vacía enumera TODO lo que un control pide, no un genérico", () => {
    const faltan = faltantesGtf(gtfDatosVacio());
    expect(faltan.length).toBeGreaterThanOrEqual(8);
    // Cada faltante dice POR QUÉ lo piden, no "es obligatorio".
    expect(faltan.every((f) => f.motivo.length > 10)).toBe(true);
    expect(faltan.map((f) => f.seccion)).toContain("vehiculo");
    expect(faltan.map((f) => f.seccion)).toContain("titulos");
  });

  it.each([
    ["placa", (d: GtfDatos) => { d.vehiculo.placa = ""; }, "vehiculo"],
    ["conductor", (d: GtfDatos) => { d.vehiculo.conductor = "  "; }, "vehiculo"],
    ["destinatario", (d: GtfDatos) => { d.destinatario.nombre = ""; }, "destinatario"],
    ["dirección del destinatario", (d: GtfDatos) => { d.destinatario.direccion = ""; }, "destinatario"],
    ["transportista", (d: GtfDatos) => { d.transportista.nombre = ""; }, "transportista"],
    ["propietario", (d: GtfDatos) => { d.propietario.nombre = ""; }, "propietario"],
    ["fecha de inicio", (d: GtfDatos) => { d.traslado.fechaInicio = ""; }, "traslado"],
    ["punto de llegada", (d: GtfDatos) => { d.traslado.puntoLlegada = ""; }, "traslado"],
  ])("sin %s la guía no se imprime", (_caso, romper, seccion) => {
    const d = completa();
    romper(d);
    const faltan = faltantesGtf(d);
    expect(faltan.length).toBe(1);
    expect(faltan[0].seccion).toBe(seccion);
    expect(gtfCompleta(d)).toBe(false);
  });

  it("un título en blanco no cuenta como título habilitante", () => {
    const d = completa();
    d.titulos = ["", "   "];
    expect(faltantesGtf(d).map((f) => f.seccion)).toEqual(["titulos"]);
  });

  it("CITES vacío NO bloquea: es legal con permiso, no un requisito de todas las guías", () => {
    const d = completa();
    d.citesPermiso = "";
    expect(faltantesGtf(d)).toEqual([]);
  });
});

describe("leerGtfDatos", () => {
  it("null / basura devuelven los defaults en vez de tirar", () => {
    expect(leerGtfDatos(null)).toEqual(gtfDatosVacio());
    expect(leerGtfDatos("no soy un objeto")).toEqual(gtfDatosVacio());
    expect(leerGtfDatos(42)).toEqual(gtfDatosVacio());
  });

  it("tolera una guía a medio llenar (versión vieja del formulario)", () => {
    const d = leerGtfDatos({ destinatario: { nombre: "Solo el nombre" } });
    expect(d.destinatario.nombre).toBe("Solo el nombre");
    expect(d.destinatario.docTipo).toBe("RUC");
    expect(d.vehiculo.placa).toBe("");
    // Y avisa qué falta, en vez de dejar imprimir un papel a medias.
    expect(gtfCompleta(d)).toBe(false);
  });

  it("recorta espacios y descarta lo que no encaja en el esquema", () => {
    const d = leerGtfDatos({
      propietario: { nombre: "  Maderera SAC  ", docTipo: "RUC", docNumero: "20512345678" },
      vehiculo: { placa: " ABC-123 " },
      titulos: ["T-1", "T-2"],
    });
    expect(d.propietario.nombre).toBe("Maderera SAC");
    expect(d.vehiculo.placa).toBe("ABC-123");
    expect(d.titulos).toEqual(["T-1", "T-2"]);
  });

  it("un docTipo inválido no rompe el formulario", () => {
    const d = leerGtfDatos({ destinatario: { nombre: "X", docTipo: "CARNET_RARO" } });
    expect(d).toEqual(gtfDatosVacio());
  });
});

describe("trasladoVigente", () => {
  const hoy = new Date("2026-07-25T12:00:00Z");

  it("sin fecha de fin no se juzga: la vigencia la fija la ARFFS", () => {
    expect(trasladoVigente(gtfDatosVacio(), hoy)).toBeNull();
  });

  it("vence al FINAL del día, no al empezar", () => {
    const d = completa();
    d.traslado.fechaFin = "2026-07-25";
    expect(trasladoVigente(d, hoy)).toBe(true);
  });

  it("el día siguiente ya está vencida", () => {
    const d = completa();
    d.traslado.fechaFin = "2026-07-24";
    expect(trasladoVigente(d, hoy)).toBe(false);
  });

  it("una fecha basura no se juzga (no finge vencimiento)", () => {
    const d = completa();
    d.traslado.fechaFin = "ayer";
    expect(trasladoVigente(d, hoy)).toBeNull();
  });
});

describe("COPIAS_GTF", () => {
  it("son las tres del art. 5 y cada una dice a dónde va", () => {
    expect(COPIAS_GTF).toHaveLength(3);
    expect(COPIAS_GTF.map((c) => c.clave)).toEqual(["original", "control", "emisor"]);
    // Sin destino impreso, tres papeles iguales no le dicen a nadie cuál se queda.
    expect(COPIAS_GTF.every((c) => c.destino.trim().length > 15)).toBe(true);
  });
});

/**
 * Modo de transporte (ADR-328 · port de AppForestal `emision-gtf`).
 *
 * En la selva central buena parte de la madera sale POR RÍO. Un control fluvial
 * no busca una placa: busca la matrícula y el nombre de la embarcación. Pedir
 * "placa" en una balsa hace que el operador invente un dato para poder imprimir,
 * que es justo lo que un documento fiscalizable no puede provocar.
 */
describe("modo de transporte", () => {
  const fluvial = (): GtfDatos => ({
    ...completa(),
    vehiculo: { ...completa().vehiculo, modo: "fluvial", embarcacion: "" },
  });

  it("por defecto es terrestre: es el caso más común", () => {
    expect(gtfDatosVacio().vehiculo.modo).toBe("terrestre");
  });

  it("por río pide el NOMBRE de la embarcación", () => {
    const f = faltantesGtf(fluvial());
    expect(f.map((x) => x.campo)).toContain("Nombre de la embarcación");
  });

  it("por río el campo se llama matrícula, no placa", () => {
    const sinMatricula = { ...fluvial(), vehiculo: { ...fluvial().vehiculo, placa: "", embarcacion: "Chata Doña Rosa" } };
    expect(faltantesGtf(sinMatricula).map((x) => x.campo)).toContain("Matrícula de la embarcación");
  });

  it("por carretera sigue pidiendo placa y no la embarcación", () => {
    const sinPlaca = { ...completa(), vehiculo: { ...completa().vehiculo, placa: "" } };
    const campos = faltantesGtf(sinPlaca).map((x) => x.campo);
    expect(campos).toContain("Placa del vehículo");
    expect(campos).not.toContain("Nombre de la embarcación");
  });

  it("por río el responsable es el patrón, no el conductor", () => {
    const sinPatron = { ...fluvial(), vehiculo: { ...fluvial().vehiculo, embarcacion: "Chata", conductor: "" } };
    expect(faltantesGtf(sinPatron).map((x) => x.campo)).toContain("Patrón de la embarcación");
  });

  it("una guía fluvial completa se puede imprimir", () => {
    const ok = { ...fluvial(), vehiculo: { ...fluvial().vehiculo, embarcacion: "Chata Doña Rosa" } };
    expect(faltantesGtf(ok)).toEqual([]);
  });
});

describe("comprobante de venta", () => {
  it("arranca sin comprobante: la guía se emite antes que la factura", () => {
    expect(gtfDatosVacio().comprobante).toEqual({ tipo: "ninguno", numero: "" });
  });

  it("no bloquea imprimir: la GTF ampara el traslado, no la operación", () => {
    expect(faltantesGtf(completa())).toEqual([]);
  });
});
