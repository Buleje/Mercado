/**
 * loth-cierre-resumen — la foto del mes antes de congelarlo. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { estaFueraDePlazo, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import { resumirPeriodo } from "@/lib/forestal/loth-cierre-resumen";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  seq += 1;
  return {
    id: `e${seq}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-07-10",
    treeCode: null,
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: null,
    diamMenorM: null,
    lengthM: null,
    volumeM3: null,
    productType: null,
    quantity: null,
    unit: null,
    pieces: null,
    gtfNumber: null,
    discarded: false,
    consumoInterno: false,
    observations: null,
    status: "registrado",
    annulledReason: null,
    gpsLat: null,
    gpsLng: null,
    photoUrl: null,
    ...partial,
  };
}

const MES = "2026-07";

describe("resumirPeriodo", () => {
  it("cuenta sólo el mes pedido y separa las anuladas", () => {
    const r = resumirPeriodo(
      [
        entry({ entryDate: "2026-07-02", volumeM3: "5" }),
        entry({ entryDate: "2026-07-20", volumeM3: "4" }),
        entry({ entryDate: "2026-08-01", volumeM3: "99" }), // otro mes
        entry({ entryDate: "2026-07-15", volumeM3: "50", status: "anulado" }),
      ],
      MES,
      estaFueraDePlazo,
    );
    expect(r.lineas).toBe(2);
    expect(r.anuladas).toBe(1);
    expect(r.taladoM3).toBe(9); // la anulada no suma
    expect(r.label).toBe("julio 2026");
    expect(r.primeraFecha).toBe("2026-07-02");
    expect(r.ultimaFecha).toBe("2026-07-20");
  });

  it("mide el movilizado del mes resolviendo la troza contra su trozado", () => {
    const r = resumirPeriodo(
      [
        entry({ section: "tala", volumeM3: "10" }),
        entry({ section: "trozado", trozaCode: "T-A", volumeM3: "6" }),
        entry({ section: "despacho_troza", trozaCode: "T-A", gtfNumber: "G-1" }),
        entry({ section: "despacho_producto", quantity: "1.5", unit: "m3", gtfNumber: "G-2", productType: "Aserrada" }),
      ],
      MES,
      estaFueraDePlazo,
    );
    expect(r.taladoM3).toBe(10);
    expect(r.trozadoM3).toBe(6);
    expect(r.movilizadoM3).toBe(7.5); // 6 de la troza + 1.5 del producto
    expect(r.porSeccion.find((s) => s.section === "despacho_troza")?.lineas).toBe(1);
  });

  it("avisa de lo que no se va a poder arreglar después de cerrar", () => {
    const r = resumirPeriodo(
      [
        entry({ section: "tala", volumeM3: "0" }), // sin volumen
        entry({ section: "despacho_troza", trozaCode: "T-A" }), // sin GTF
        entry({ section: "trozado", trozaCode: "T-B", volumeM3: "3", createdAt: "2026-09-30" }), // tardía
      ],
      MES,
      estaFueraDePlazo,
    );
    const claves = r.pendientes.map((p) => p.clave).sort();
    expect(claves).toEqual(["despacho_sin_gtf", "fuera_de_plazo", "sin_volumen"]);
    expect(r.hayPendientes).toBe(true);
    expect(r.pendientes.find((p) => p.clave === "sin_volumen")?.nivel).toBe("error");
    expect(r.pendientes.find((p) => p.clave === "fuera_de_plazo")?.nivel).toBe("warn");
  });

  it("marca el trozado que supera lo talado", () => {
    const r = resumirPeriodo(
      [entry({ section: "tala", volumeM3: "3" }), entry({ section: "trozado", trozaCode: "T-A", volumeM3: "5" })],
      MES,
      estaFueraDePlazo,
    );
    expect(r.pendientes.some((p) => p.clave === "trozado_mayor")).toBe(true);
  });

  it("un mes limpio no inventa pendientes", () => {
    const r = resumirPeriodo(
      [
        entry({ section: "tala", volumeM3: "10", createdAt: "2026-07-11" }),
        entry({ section: "trozado", trozaCode: "T-A", volumeM3: "6", createdAt: "2026-07-11" }),
      ],
      MES,
      estaFueraDePlazo,
    );
    expect(r.pendientes).toHaveLength(0);
    expect(r.hayPendientes).toBe(false);
    expect(r.especies).toEqual(["Tornillo"]);
  });

  it("un mes sin actividad devuelve ceros, no explota", () => {
    const r = resumirPeriodo([], "2026-01", estaFueraDePlazo);
    expect(r.lineas).toBe(0);
    expect(r.porSeccion).toHaveLength(6);
    expect(r.primeraFecha).toBeNull();
  });
});
