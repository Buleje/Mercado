import { describe, expect, it } from "vitest";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { guiaDesdeGtf, gtfDatosDeFilaLoth, itemDeLinea } from "@/lib/guias/desde-gtf";

const ctx = { origenTipo: "ctp_salida" as const, origenId: "e1", ubigeoFiscal: "250101", direccionFiscal: "Jr. Fiscal 1", items: [{ descripcion: "Tablas", cantidad: 3, unidad: "MTQ" }] };

const completa = () =>
  leerGtfDatos({
    vehiculo: { modo: "terrestre", placa: "abc-123", conductor: "Juan Pérez", conductorDni: "44556677", licencia: "Q123", tipoTransporte: "publico" },
    transportista: { nombre: "Transportes Ucayali", docNumero: "20601234567" },
    destinatario: { nombre: "Maderera El Aguajal", docNumero: "20111111111", direccion: "Jr. Tarapacá 244", departamento: "Ucayali", provincia: "Coronel Portillo", distrito: "Calleria" },
    traslado: { puntoPartida: "Planta Km 12", fechaInicio: "2026-10-18", partida: { direccion: "Planta Km 12", departamento: "Ucayali", provincia: "Coronel Portillo", distrito: "Callería" } },
    comprobante: { tipo: "factura", numero: "F001-123" },
  });

describe("guiaDesdeGtf", () => {
  it("GTF completa: placa, chofer, licencia, transportista y ubigeo (distrito sin tilde -> 250101)", () => {
    const r = guiaDesdeGtf(completa(), ctx);
    expect(r.borrador).toMatchObject({
      vehiculoPlaca: "ABC-123", conductorNombre: "Juan Pérez", conductorDni: "44556677", conductorLicencia: "Q123",
      transportistaRuc: "20601234567", modalidadTraslado: "01", ubigeoLlegada: "250101", ubigeoPartida: "250101",
      documentoRef: "F001-123", origenTipo: "ctp_salida", origenId: "e1", fechaTraslado: "2026-10-18",
    });
    expect(r.avisos.some((a) => a.includes("250101"))).toBe(true);
    expect(r.faltan).toEqual(["pesoBruto"]);
  });

  it("fluvial: aviso y la matrícula no se copia como placa", () => {
    const g = completa();
    g.vehiculo.modo = "fluvial";
    const r = guiaDesdeGtf(g, ctx);
    expect(r.borrador.vehiculoPlaca).toBeUndefined();
    expect(r.avisos.some((a) => a.includes("río"))).toBe(true);
  });

  it("sin destino ni licencia: lo dice en faltan, sin inventar", () => {
    const r = guiaDesdeGtf(leerGtfDatos({}), { ...ctx, ubigeoFiscal: null, direccionFiscal: null });
    expect(r.faltan).toEqual(expect.arrayContaining(["pesoBruto", "ubigeoLlegada", "ubigeoPartida", "licencia", "destinatarioRuc"]));
    expect(r.borrador.ubigeoLlegada).toBeUndefined();
    expect(r.borrador.puntoPartida).toBe("");
  });

  it("sin partida: usa la dirección y el ubigeo fiscal y lo avisa", () => {
    const g = completa();
    g.traslado.puntoPartida = "";
    g.traslado.partida = { ...g.traslado.partida, direccion: "", departamento: "", provincia: "", distrito: "" };
    const r = guiaDesdeGtf(g, ctx);
    expect(r.borrador).toMatchObject({ puntoPartida: "Jr. Fiscal 1", ubigeoPartida: "250101" });
    expect(r.avisos.some((a) => a.includes("fiscal"))).toBe(true);
  });

  it("guía existente: avisa y la devuelve", () => {
    const r = guiaDesdeGtf(completa(), { ...ctx, guiaExistente: { id: "g1", numero: "BUL-GRR-0001" } });
    expect(r.guiaExistente?.numero).toBe("BUL-GRR-0001");
    expect(r.avisos.some((a) => a.includes("BUL-GRR-0001"))).toBe(true);
  });
});

describe("itemDeLinea / gtfDatosDeFilaLoth", () => {
  it("m3 -> MTQ, pt -> Unidad con la descripción aclarada, 0 -> nada", () => {
    expect(itemDeLinea({ especie: "Shihuahuaco", producto: "Madera aserrada", cantidad: 4.5, unidad: "m3" })).toEqual({ descripcion: "Madera aserrada Shihuahuaco", cantidad: 4.5, unidad: "MTQ" });
    expect(itemDeLinea({ cantidad: 100, unidad: "pt" })).toMatchObject({ unidad: "NIU", descripcion: expect.stringContaining("pies tablares") });
    expect(itemDeLinea({ cantidad: 0, unidad: "m3" })).toBeNull();
  });
  it("la guía corta del TH completa sólo los huecos desde sus columnas", () => {
    const d = gtfDatosDeFilaLoth({ gtfDatos: null, conductor: "Luis", conductorLicencia: "B9", placaVehiculo: "XYZ-987", destino: "Lima", transportista: null, transportistaDoc: null, origen: "Bosque" });
    expect(d.vehiculo).toMatchObject({ placa: "XYZ-987", conductor: "Luis", licencia: "B9" });
    expect(d.destinatario.direccion).toBe("Lima");
  });
});
