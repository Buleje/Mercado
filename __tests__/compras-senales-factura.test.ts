import { describe, expect, it } from "vitest";
import { avisoComprobanteRepetido, costosDudosos } from "@/components/admin/compra/senales-factura";
import { avisoDePlantilla, type CargaDePlantilla } from "@/components/admin/compra/aviso-plantilla";

const COMPRA = { id: "cmaaaaaaaa0001ucayal1", total: 600, fecha: "2026-10-10T15:00:00.000Z", proveedor: "Distribuidora Ucayali" };

describe("comprobante repetido (C60)", () => {
  it("mismo proveedor: aviso fuerte con día, orden e importe", () => {
    const a = avisoComprobanteRepetido(COMPRA, "F001-123", "distribuidora ucayali");
    expect(a.mismoProveedor).toBe(true);
    expect(a.texto).toContain("sábado 10/10");
    expect(a.texto).toContain("Revísala");
    expect(a.texto).not.toContain(COMPRA.id);
  });

  it("otro proveedor: aviso leve, puede ser normal", () => {
    const a = avisoComprobanteRepetido(COMPRA, "F001-123", "Frigorífico Amazonía");
    expect(a.mismoProveedor).toBe(false);
    expect(a.texto).toContain("puede ser normal");
  });
});

describe("costo dudoso de la factura leída (C60)", () => {
  it("sin precio, o muy lejos del que tenías, se señala; cerca, no", () => {
    const d = costosDudosos([
      { nombre: "Leche", precio: undefined, ultimo: 3.5 },
      { nombre: "Arroz", precio: 150, ultimo: 30 },
      { nombre: "Azúcar", precio: 4.2, ultimo: 4 },
      { nombre: "Aceite", precio: 9, ultimo: null },
      { nombre: "Fideos", precio: undefined, ultimo: null },
    ]);
    expect(d.map((x) => x.nombre)).toEqual(["Leche", "Arroz", "Fideos"]);
    expect(d[1].motivo).toContain("+400 %");
    expect(d[2].motivo).toContain("anótalo");
  });
});

describe("cargar una plantilla (C61)", () => {
  const base: CargaDePlantilla = {
    nombre: "Lunes",
    faltan: 0,
    costosDeLaPlantilla: 0,
    sinCosto: 0,
    guardadaEl: "2026-08-01",
    hoy: "2026-10-17",
    proveedorAntes: null,
    traeProveedor: true,
    proveedorDeLaPlantilla: "Distribuidora Ucayali",
  };

  it("cambiar de proveedor se dice", () => {
    const a = avisoDePlantilla({ ...base, proveedorAntes: "Frigorífico Amazonía" });
    expect(a.revisar).toBe(true);
    expect(a.texto).toContain("pasó a Distribuidora Ucayali (antes Frigorífico Amazonía)");
  });

  it("el costo copiado de una plantilla vieja lleva su fecha y antigüedad", () => {
    const a = avisoDePlantilla({ ...base, costosDeLaPlantilla: 2 });
    expect(a.texto).toContain("2 costos salen de la plantilla del sábado 01/08 (hace 77 días): revísalos");
  });

  it("el proveedor borrado pide elegir otro", () => {
    expect(avisoDePlantilla({ ...base, proveedorDeLaPlantilla: null }).texto).toContain("elige uno arriba");
  });

  it("todo al día: sólo cargada y su proveedor", () => {
    const a = avisoDePlantilla({ ...base, proveedorAntes: "Distribuidora Ucayali" });
    expect(a).toEqual({ texto: "Plantilla «Lunes» cargada", revisar: false });
  });
});
