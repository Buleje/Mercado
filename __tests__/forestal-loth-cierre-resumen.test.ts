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
    const claves = r.pendientes.filter((p) => p.nivel !== "info").map((p) => p.clave).sort();
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
        entry({ section: "trozado", trozaCode: "T-A", volumeM3: "10", createdAt: "2026-07-11" }),
        entry({ section: "despacho_troza", trozaCode: "T-A", gtfNumber: "G-1", createdAt: "2026-07-11" }),
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

describe("resumirPeriodo · saldo al cierre (kárdex del permiso)", () => {
  const P1 = "plan-1";
  const P2 = "plan-2";
  const etiquetas = new Map([[P1, "PMFI 10"], [P2, "PMFI 20"]]);
  const resumir = (es: LothEntryDTO[], mes = MES) => resumirPeriodo(es, mes, estaFueraDePlazo, etiquetas);
  const clave = (r: ReturnType<typeof resumir>, k: string) => r.pendientes.find((p) => p.clave === k);

  it("tala sin trozar dentro del período: avisa árboles y m³ por permiso y especie", () => {
    const r = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5" }),
      entry({ planId: P1, treeCode: "A2", volumeM3: "3" }),
    ]);
    const a = clave(r, "talado_sin_trozar");
    expect(a?.nivel).toBe("warn");
    expect(a?.detalle).toContain("2 árboles talados sin trozar");
    expect(a?.detalle).toContain("8.000 m³");
    expect(a?.detalle).toContain("PMFI 10 · Tornillo");
    expect(r.saldoAlCierre.taladoSinTrozarM3).toBe(8);
    expect(r.hayPendientes).toBe(true);
  });

  it("una tala de un mes POSTERIOR no cuenta; una anterior sin trozar sí (acumulado)", () => {
    const r = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5", entryDate: "2026-06-30" }),
      entry({ planId: P1, treeCode: "A2", volumeM3: "9", entryDate: "2026-08-01" }),
    ]);
    expect(r.saldoAlCierre.taladoSinTrozarM3).toBe(5);
    expect(clave(r, "talado_sin_trozar")?.detalle).toContain("1 árbol talado sin trozar");
  });

  it("troza despachada DESPUÉS del cierre sigue en el patio al cierre; no es un error", () => {
    const base = [
      entry({ planId: P1, treeCode: "A1", volumeM3: "6" }),
      entry({ planId: P1, section: "trozado", treeCode: "A1", trozaCode: "T1", volumeM3: "6" }),
    ];
    const r = resumir([
      ...base,
      entry({ planId: P1, section: "despacho_troza", trozaCode: "T1", gtfNumber: "G1", entryDate: "2026-08-05" }),
    ]);
    const a = clave(r, "en_patio");
    expect(a?.nivel).toBe("info");
    expect(a?.detalle).toContain("6.000 m³ en el patio pasan al mes siguiente");
    expect(clave(r, "talado_sin_trozar")).toBeUndefined();
    expect(r.hayPendientes).toBe(false); // sólo hay saldo, no falla
    // Cerrando agosto la troza ya salió.
    expect(clave(resumir([...base, entry({ planId: P1, section: "despacho_troza", trozaCode: "T1", gtfNumber: "G1", entryDate: "2026-08-05" })], "2026-08"), "en_patio")).toBeUndefined();
  });

  it("las anuladas no suman", () => {
    const r = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5", status: "anulado" }),
      entry({ planId: P1, treeCode: "A2", volumeM3: "4" }),
      entry({ planId: P1, section: "trozado", treeCode: "A2", trozaCode: "T9", volumeM3: "4", status: "anulado" }),
    ]);
    expect(r.saldoAlCierre.taladoSinTrozarM3).toBe(4);
    expect(r.saldoAlCierre.enPatioM3).toBe(0);
  });

  it("dos permisos: cada uno con lo suyo y el total es la suma", () => {
    const r = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5" }),
      entry({ planId: P2, treeCode: "B1", volumeM3: "2", speciesCommon: "Cedro" }),
    ]);
    expect(r.saldoAlCierre.filas.map((f) => `${f.permiso}|${f.especie}`).sort()).toEqual(["PMFI 10|Tornillo", "PMFI 20|Cedro"]);
    expect(r.saldoAlCierre.taladoSinTrozarM3).toBe(7);
    expect(r.saldoAlCierre.arbolesSinTrozar).toBe(2);
  });

  it("una tala SIN permiso aparece en cada permiso (como el kárdex) pero el total la cuenta una vez", () => {
    const r = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5" }),
      entry({ planId: P2, treeCode: "B1", volumeM3: "2", speciesCommon: "Cedro" }),
      entry({ planId: null, treeCode: "X9", volumeM3: "1" }),
    ]);
    /* Filas por permiso: el Tornillo sin permiso suma en los dos (5+1 en P1, 1 en P2). */
    expect(r.saldoAlCierre.taladoSinTrozarM3).toBe(8);
    expect(r.saldoAlCierre.arbolesSinTrozar).toBe(3);
  });

  it("tolerancia 0,01 m³: la diferencia fina no avisa", () => {
    const fino = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5" }),
      entry({ planId: P1, section: "trozado", treeCode: "A1", trozaCode: "T1", volumeM3: "4.995" }),
      entry({ planId: P1, section: "despacho_troza", trozaCode: "T1", gtfNumber: "G1" }),
    ]);
    expect(clave(fino, "talado_sin_trozar")).toBeUndefined();
    expect(clave(fino, "en_patio")).toBeUndefined();
    const gruesa = resumir([
      entry({ planId: P1, treeCode: "A1", volumeM3: "5" }),
      entry({ planId: P1, section: "trozado", treeCode: "A1", trozaCode: "T1", volumeM3: "4.5" }),
      entry({ planId: P1, section: "despacho_troza", trozaCode: "T1", gtfNumber: "G1" }),
    ]);
    expect(clave(gruesa, "talado_sin_trozar")?.detalle).toContain("0.500 m³");
  });
});
