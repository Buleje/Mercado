import { describe, it, expect } from "vitest";
import { rellenarGuia } from "@/lib/forestal/gtf-autocompletar";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";

/**
 * «Rellenar datos de la guía» (ADR-371) — de dónde sale cada casillero.
 *
 * Estos casos existen porque la primera versión llenaba 8 de 41 campos y el
 * aviso decía «falta cargar: transportista, vehículo o conductor» aun teniendo
 * el conductor cargado. Cada `it` de acá abajo fija UNA fuente: la ficha del
 * CTP, la libreta, la guía anterior — y sobre todo, qué NO se hereda.
 */

const ficha = {
  razonSocial: "ASERRADERO SAN MARTÍN SAC",
  nombreCtp: "CTP San Martín",
  ruc: "20512345678",
  direccion: "Km 12 Carretera Federico Basadre",
  region: "UCAYALI",
  provincia: "CORONEL PORTILLO",
  distrito: "CALLERÍA",
  arffs: "ARFFS UCAYALI",
  titulos: [{ codigo: "25-PUC/CON-BPP-2019-001" }],
};

describe("rellenarGuia · el propietario sale de la ficha del CTP", () => {
  it("copia razón social, RUC, dirección y ubicación", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha });
    expect(r.datos.propietario.nombre).toBe("ASERRADERO SAN MARTÍN SAC");
    expect(r.datos.propietario.docNumero).toBe("20512345678");
    expect(r.datos.propietario.direccion).toContain("Federico Basadre");
    expect(r.completados).toContain("propietario");
  });

  it("no pisa lo que el operador ya escribió", () => {
    const previo = gtfDatosVacio();
    previo.propietario.nombre = "OTRO TITULAR EIRL";
    const r = rellenarGuia(previo, { ficha });
    expect(r.datos.propietario.nombre).toBe("OTRO TITULAR EIRL");
  });
});

describe("rellenarGuia · la guía anterior alimenta a la siguiente", () => {
  const ultimaGuia = {
    transportista: { nombre: "TRANSPORTES AMAZONÍA SAC", docTipo: "RUC", docNumero: "20601111111", direccion: "Jr. Comercio 100", registroMtc: "MTC-0099" },
    vehiculo: { placa: "AXQ-871", marca: "Volvo", tipo: "Camión", modo: "terrestre", conductor: "JULIO PAREDES", conductorDni: "44120987", licencia: "Q44120987" },
    destinatario: { nombre: "MADERERA LIMA SAC", docTipo: "RUC", docNumero: "20699999999", direccion: "Av. Argentina 4500" },
    comprobante: { tipo: "factura", numero: "F001-00001234" },
  } as unknown as Parameters<typeof rellenarGuia>[1]["ultimaGuia"];

  it("hereda transportista, camión y conductor", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha, ultimaGuia });
    expect(r.datos.transportista.nombre).toBe("TRANSPORTES AMAZONÍA SAC");
    expect(r.datos.vehiculo.placa).toBe("AXQ-871");
    expect(r.datos.vehiculo.conductor).toBe("JULIO PAREDES");
    expect(r.datos.vehiculo.conductorDni).toBe("44120987");
    /* Con la guía anterior completa lo único que queda por escribir es el
       número de comprobante: ni el camión ni el chofer se vuelven a tipear. */
    expect(r.faltantes).toEqual([expect.stringContaining("comprobante")]);
  });

  it("hereda el TIPO de comprobante pero nunca su número", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha, ultimaGuia });
    expect(r.datos.comprobante.tipo).toBe("factura");
    /* El número identifica UNA venta: repetirlo es declarar dos despachos con
       la misma factura, que es justo lo que un control cruza. */
    expect(r.datos.comprobante.numero ?? "").toBe("");
  });
});

describe("rellenarGuia · lo que no tiene fuente", () => {
  it("con transporte privado el transportista es el propio CTP", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha });
    expect(r.datos.transportista.nombre).toBe("ASERRADERO SAN MARTÍN SAC");
    expect(r.datos.transportista.docNumero).toBe("20512345678");
  });

  it("con transporte público pide la empresa en vez de inventarla", () => {
    const previo = gtfDatosVacio();
    previo.vehiculo.tipoTransporte = "publico";
    const r = rellenarGuia(previo, { ficha });
    expect(r.datos.transportista.nombre ?? "").toBe("");
    expect(r.faltantes.join(" ")).toContain("transporte público");
  });

  it("nombra la placa y el conductor por separado", () => {
    const r = rellenarGuia(gtfDatosVacio(), {
      ficha,
      conductor: { nombre: "JULIO PAREDES", docNumero: "44120987", licencia: "Q44120987" },
    });
    expect(r.datos.vehiculo.conductor).toBe("JULIO PAREDES");
    expect(r.completados).toContain("conductor");
    /* Tener al chofer no puede leerse como «te falta el chofer». */
    expect(r.faltantes.join(" ")).toContain("placa");
    expect(r.faltantes.join(" ")).not.toContain("conductor (");
  });

  it("por río pide matrícula, no placa de camión", () => {
    const previo = gtfDatosVacio();
    previo.vehiculo.modo = "fluvial";
    const r = rellenarGuia(previo, { ficha });
    expect(r.faltantes.join(" ")).toContain("matrícula");
  });

  it("dice qué casilleros van vacíos a propósito", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha });
    expect(r.aProposito.join(" ")).toContain("DNI");
    expect(r.aProposito.join(" ")).toContain("CITES");
  });

  it("hereda el permiso CITES del ingreso de origen", () => {
    // Es la PRIMERA salida de la especie: sin guía anterior de la que copiar,
    // el papel igual existe — está en el ingreso que la trajo al patio.
    const r = rellenarGuia(gtfDatosVacio(), {
      ficha,
      llevaCites: true,
      citesPermiso: "PE-2026-00123",
    });
    expect(r.datos.citesPermiso).toBe("PE-2026-00123");
    expect(r.completados).toContain("permiso CITES");
    expect(r.faltantes.join(" ")).not.toContain("CITES");
  });

  it("el ingreso le gana a la guía anterior: es el papel de ESTA madera", () => {
    const r = rellenarGuia(gtfDatosVacio(), {
      ficha,
      llevaCites: true,
      citesPermiso: "PE-2026-NUEVO",
      ultimaGuia: { citesPermiso: "PE-2025-VIEJO" },
    });
    expect(r.datos.citesPermiso).toBe("PE-2026-NUEVO");
  });

  it("con especie protegida y sin permiso, es un FALTANTE — no un vacío normal", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha, llevaCites: true });
    expect(r.faltantes.join(" ")).toContain("CITES");
    /* Nombrarlo como «vacío a propósito» lo excusaría, y sin ese papel la
       especie protegida no se puede mover. */
    expect(r.aProposito.join(" ")).not.toContain("CITES");
  });

  it("sin especie protegida, el permiso vacío sigue siendo lo normal", () => {
    const r = rellenarGuia(gtfDatosVacio(), { ficha, llevaCites: false });
    expect(r.faltantes.join(" ")).not.toContain("CITES");
    expect(r.aProposito.join(" ")).toContain("CITES");
  });
});
