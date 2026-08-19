import { describe, expect, it } from "vitest";
import { completitudFicha, seccionesDeGuia, type LineaConGuia } from "@/lib/forestal/guia-ficha";
import { resumirGuia } from "@/lib/forestal/ingresos-por-guia";

function linea(over: Partial<LineaConGuia> = {}): LineaConGuia {
  return {
    id: "a",
    entryDate: "2026-08-01T00:00:00.000Z",
    gtfNumber: "001-0000201",
    gtfSeries: null,
    providerName: "Maderera El Aguajal SAC",
    providerDocument: "20601234567",
    providerDocumentType: "RUC",
    speciesCommonName: "Tornillo",
    productType: "rolliza",
    volumeM3: "6.7795",
    status: "pendiente",
    originCode: "CON-25-UCA-0142",
    ...over,
  };
}

const ficha = (over: Partial<LineaConGuia> = {}) => seccionesDeGuia(resumirGuia([linea(over)]));

describe("seccionesDeGuia", () => {
  it("arma las cuatro secciones del formato, en orden", () => {
    expect(ficha().map((s) => s.titulo)).toEqual([
      "Documento y origen",
      "Proveedor / titular del recurso",
      "Destinatario",
      "Transportista y vehículo",
    ]);
  });

  it("las secciones vacías SE MUESTRAN: lo que falta se ve faltando", () => {
    const sinDatos = ficha();
    const destinatario = sinDatos.find((s) => s.titulo === "Destinatario")!;
    expect(destinatario.campos.length).toBeGreaterThan(0);
    expect(destinatario.campos.every((c) => c.valor === null)).toBe(true);
  });

  it("lee los bloques que guarda el ingreso (ADR-336)", () => {
    const conDatos = ficha({
      gtfDatos: {
        destinatario: {
          nombre: "Inversiones Blas SAC",
          docTipo: "RUC",
          docNumero: "20605859438",
          direccion: "Jr. Arguedas 24",
          departamento: "Pasco",
          provincia: "Oxapampa",
          distrito: "Constitución",
        },
        vehiculo: { modo: "terrestre", placa: "V5S-858", conductor: "Rubén Bazán", conductorDni: "48831805" },
      },
    });
    const dest = conDatos.find((s) => s.titulo === "Destinatario")!;
    expect(dest.campos.find((c) => c.label === "Nombre o razón social")?.valor).toBe("Inversiones Blas SAC");
    expect(dest.campos.find((c) => c.label === "Ubicación")?.valor).toBe("Constitución · Oxapampa · Pasco");
    const trans = conDatos.find((s) => s.titulo === "Transportista y vehículo")!;
    expect(trans.campos.find((c) => c.label === "Placa")?.valor).toBe("V5S-858");
  });

  it("por río pide matrícula, no placa: una guía fluvial no lleva placa", () => {
    const fluvial = ficha({
      gtfDatos: { vehiculo: { modo: "fluvial", embarcacion: "Chata San Juan", placa: "" } },
    });
    const trans = fluvial.find((s) => s.titulo === "Transportista y vehículo")!;
    expect(trans.campos.find((c) => c.label === "Embarcación / matrícula")?.valor).toBe("Chata San Juan");
    expect(trans.campos.some((c) => c.label === "Placa")).toBe(false);
  });

  it("un `gtfDatos` corrupto no rompe la ficha", () => {
    expect(() => ficha({ gtfDatos: "no es un objeto" })).not.toThrow();
  });
});

describe("completitudFicha", () => {
  it("cuenta los casilleros llenos y nombra los que faltan", () => {
    const c = completitudFicha(ficha());
    expect(c.total).toBeGreaterThan(10);
    expect(c.llenos).toBeGreaterThan(0);
    expect(c.pct).toBe(Math.round((c.llenos / c.total) * 100));
    // Los que faltan se NOMBRAN: es la lista de lo que hay que completar.
    expect(c.faltan).toContain("Dirección");
  });
});
