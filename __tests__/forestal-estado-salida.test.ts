import { describe, it, expect } from "vitest";
import { estadoSalida, type CtpEntry } from "@/components/admin/forestal/ctp-section-shared";

/**
 * "¿El paquete sigue en el patio o ya se lo llevaron?" — el reporte «estado de
 * productos» del ERP forestal de referencia, resuelto en la misma fila de la
 * lista de producción en vez de en una pantalla aparte.
 *
 * Un paquete parcialmente despachado es lo NORMAL (un camión no se lleva todo),
 * y no distinguirlo obliga a abrir el detalle para saber si queda algo.
 */

const corrida = (over: Partial<CtpEntry> = {}): CtpEntry => ({
  id: "c1",
  section: "produccion",
  lineNo: 1,
  entryDate: "2026-08-01",
  gtfIngreso: null,
  materiaPrimaRef: null,
  speciesCommon: "Tornillo",
  speciesScientific: null,
  cites: false,
  productType: "Madera aserrada",
  volumeInputM3: "10",
  rendimientoPct: "56",
  quantity: "38",
  unit: "pt",
  pieces: null,
  gtfNumber: null,
  destino: null,
  observations: null,
  status: "registrado",
  annulledReason: null,
  ...over,
});

describe("estado de salida del paquete", () => {
  it("nada despachado ⇒ sigue en el patio", () => {
    expect(estadoSalida(corrida())).toEqual({ label: "En patio", tono: "stock" });
  });

  it("todo despachado ⇒ ya se fue", () => {
    expect(estadoSalida(corrida({ despachadoQty: 38 }))?.tono).toBe("salido");
  });

  it("a medias ⇒ dice CUÁNTO queda, que es lo que se pregunta", () => {
    const e = estadoSalida(corrida({ despachadoQty: 30 }));
    expect(e?.tono).toBe("parcial");
    expect(e?.label).toContain("8.00");
  });

  it("el reproceso también saca stock, no sólo el despacho", () => {
    // Un tablón hecho tablillas ya no está disponible como tablón (I6).
    expect(estadoSalida(corrida({ reprocesadoQty: 38 }))?.tono).toBe("salido");
    expect(estadoSalida(corrida({ despachadoQty: 20, reprocesadoQty: 18 }))?.tono).toBe("salido");
  });

  it("un despacho no tiene estado de salida: ES la salida", () => {
    expect(estadoSalida(corrida({ section: "despacho" }))).toBeNull();
  });

  it("sin cantidad producida no se inventa un estado", () => {
    expect(estadoSalida(corrida({ quantity: null }))).toBeNull();
    expect(estadoSalida(corrida({ quantity: "0" }))).toBeNull();
  });
});
