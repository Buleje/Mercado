/**
 * loth-trace — motor de trazabilidad por árbol del Libro TH. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations, buildTraceSummary, matchesTrace } from "@/lib/forestal/loth-trace";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  return {
    id: `e${seq++}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-01-10",
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

describe("buildTraceOperations", () => {
  it("cadena completa (tala→trozado→despacho) con rendimiento y GPS", () => {
    const entries: LothEntryDTO[] = [
      entry({ section: "tala", treeCode: "01-TOR", volumeM3: "10", gpsLat: "-9.9", gpsLng: "-75.0" }),
      entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-A", volumeM3: "4" }),
      entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-B", volumeM3: "4" }),
      entry({ section: "despacho_troza", trozaCode: "01-TOR-A", gtfNumber: "GTF-1" }),
    ];
    const [op] = buildTraceOperations(entries);
    expect(op.tree).toBe("01-TOR");
    expect(op.talaVolM3).toBe(10);
    expect(op.trozadoVolM3).toBe(8);
    expect(op.rendimientoPct).toBe(80);
    expect(op.mermaVolM3).toBe(2);
    expect(op.trozasCount).toBe(2);
    expect(op.trozasDespachadas).toBe(1);
    expect(op.movilizada).toBe(true);
    expect(op.chain).toBe("completa");
    expect(op.gps).toEqual({ lat: -9.9, lng: -75.0 });
    expect(op.alerts).toHaveLength(0);
  });

  it("solo tala → cadena 'iniciada'", () => {
    const [op] = buildTraceOperations([entry({ section: "tala", treeCode: "02-TOR", volumeM3: "5" })]);
    expect(op.chain).toBe("iniciada");
    expect(op.stagesReached).toBe(1);
    expect(op.movilizada).toBe(false);
  });

  it("trozado > talado → alerta de error (invariante T4 visible)", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "03-TOR", volumeM3: "3" }),
      entry({ section: "trozado", treeCode: "03-TOR", trozaCode: "03-TOR-A", volumeM3: "5" }),
    ]);
    expect(op.alerts.some((a) => a.level === "error")).toBe(true);
    expect(op.chain).toBe("parcial");
  });

  it("merma del 70% → alerta grave (antes era sólo un warning de rendimiento)", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "04-TOR", volumeM3: "10" }),
      entry({ section: "trozado", treeCode: "04-TOR", trozaCode: "04-TOR-A", volumeM3: "3" }),
    ]);
    expect(op.rendimientoPct).toBe(30);
    expect(op.mermaPct).toBe(70);
    expect(op.mermaVeredicto).toBe("grave");
    expect(op.alerts.some((a) => a.level === "error")).toBe(true);
  });

  it("merma del 52% avisa: el hueco que el umbral viejo (rend. < 40%) dejaba pasar", () => {
    const [op] = buildTraceOperations([
      // El caso real del tenant: 5.973 talados → 2.850 trozados. Rendimiento
      // 47.7% (no bajaba de 40 → no alertaba) pero se perdió medio árbol.
      entry({ section: "tala", treeCode: "001-TOR", volumeM3: "5.973" }),
      entry({ section: "trozado", treeCode: "001-TOR", trozaCode: "001-TOR-A", volumeM3: "2.8502" }),
    ]);
    expect(op.rendimientoPct).toBe(48);
    expect(op.mermaPct).toBeCloseTo(52.3, 1);
    expect(op.mermaVeredicto).toBe("aviso");
    expect(op.alerts.some((a) => a.level === "warn" && /Merma del 52/.test(a.message))).toBe(true);
  });

  it("ignora líneas anuladas", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "05-TOR", volumeM3: "5" }),
      entry({ section: "tala", treeCode: "06-TOR", volumeM3: "5", status: "anulado" }),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].tree).toBe("05-TOR");
  });

  it("ordena por volumen talado descendente", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "A", volumeM3: "3" }),
      entry({ section: "tala", treeCode: "B", volumeM3: "9" }),
      entry({ section: "tala", treeCode: "C", volumeM3: "6" }),
    ]);
    expect(ops.map((o) => o.tree)).toEqual(["B", "C", "A"]);
  });
});

describe("balance de trozas (despachada / consumida / patio)", () => {
  const entries: LothEntryDTO[] = [
    entry({ section: "tala", treeCode: "10-TOR", volumeM3: "12" }),
    entry({ section: "trozado", treeCode: "10-TOR", trozaCode: "10-TOR-A", volumeM3: "3" }),
    entry({ section: "trozado", treeCode: "10-TOR", trozaCode: "10-TOR-B", volumeM3: "3" }),
    entry({ section: "trozado", treeCode: "10-TOR", trozaCode: "10-TOR-C", volumeM3: "3" }),
    entry({ section: "despacho_troza", trozaCode: "10-TOR-A", gtfNumber: "GTF-9" }),
    entry({ section: "consumo_troza", trozaCode: "10-TOR-B", volumeM3: "3" }),
    // 10-TOR-C queda en patio (ni despacho ni consumo)
  ];
  it("clasifica cada troza y suma el volumen en patio", () => {
    const [op] = buildTraceOperations(entries);
    expect(op.trozaEstado["10-TOR-A"]).toBe("despachada");
    expect(op.trozaEstado["10-TOR-B"]).toBe("consumida");
    expect(op.trozaEstado["10-TOR-C"]).toBe("patio");
    expect(op.trozasEnPatio).toBe(1);
    expect(op.patioVolM3).toBe(3);
    expect(op.gtfs).toEqual(["GTF-9"]);
  });
  it("el resumen cuenta árboles con patio y su volumen", () => {
    const s = buildTraceSummary(buildTraceOperations(entries));
    expect(s.conPatio).toBe(1);
    expect(s.patioVolM3).toBe(3);
  });
});

describe("matchesTrace (búsqueda inversa)", () => {
  const [op] = buildTraceOperations([
    entry({ section: "tala", treeCode: "20-TOR", volumeM3: "5", speciesCommon: "Tornillo" }),
    entry({ section: "trozado", treeCode: "20-TOR", trozaCode: "20-TOR-A", volumeM3: "4" }),
    entry({ section: "despacho_troza", trozaCode: "20-TOR-A", gtfNumber: "001-0000120" }),
  ]);
  it("matchea por código de árbol, especie, troza y GTF", () => {
    expect(matchesTrace(op, "20-tor").via).toBe("código");
    expect(matchesTrace(op, "tornillo").via).toBe("especie");
    expect(matchesTrace(op, "20-TOR-A").via).toBe("troza");
    expect(matchesTrace(op, "0000120").via).toBe("gtf");
    expect(matchesTrace(op, "0000120").hint).toContain("GTF");
  });
  it("query vacía matchea todo; query sin coincidencia no matchea", () => {
    expect(matchesTrace(op, "").matched).toBe(true);
    expect(matchesTrace(op, "zzz").matched).toBe(false);
  });
});

describe("buildTraceSummary", () => {
  it("agrega totales, rendimiento global y conteos de estado", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "01", volumeM3: "10", cites: true }),
      entry({ section: "trozado", treeCode: "01", trozaCode: "01-A", volumeM3: "7" }),
      entry({ section: "despacho_troza", trozaCode: "01-A", gtfNumber: "G1" }),
      entry({ section: "tala", treeCode: "02", volumeM3: "10" }),
    ]);
    const s = buildTraceSummary(ops);
    expect(s.totalTrees).toBe(2);
    expect(s.talaVolM3).toBe(20);
    expect(s.trozadoVolM3).toBe(7);
    expect(s.rendimientoGlobalPct).toBe(35);
    expect(s.completas).toBe(1);
    expect(s.parciales).toBe(0);
    expect(s.citesCount).toBe(1);
  });
});

describe("umbral de merma por especie", () => {
  const arbol = (especie: string) => [
    entry({ section: "tala", treeCode: `T-${especie}`, speciesCommon: especie, volumeM3: "10" }),
    entry({ section: "trozado", treeCode: `T-${especie}`, trozaCode: `T-${especie}-A`, speciesCommon: especie, volumeM3: "5.5" }),
  ];

  it("el override de la especie manda sobre el general", () => {
    // 45% de merma: con el general (avisa desde 40) es aviso; con un umbral
    // propio más permisivo para esa especie de copa ancha, no dice nada.
    const [conGeneral] = buildTraceOperations(arbol("Capirona"));
    expect(conGeneral.mermaVeredicto).toBe("aviso");

    const [conOverride] = buildTraceOperations(arbol("Capirona"), {
      umbrales: { general: { aviso: 40, grave: 55 }, porEspecie: { capirona: { aviso: 60, grave: 75 } } },
    });
    expect(conOverride.mermaVeredicto).toBe("ok");
    expect(conOverride.alerts).toHaveLength(0);
  });

  it("la clave de la especie ignora tildes y mayúsculas", () => {
    const [op] = buildTraceOperations(
      [
        entry({ section: "tala", treeCode: "T-1", speciesCommon: "Shihuahuaco Ámbar", volumeM3: "10" }),
        entry({ section: "trozado", treeCode: "T-1", trozaCode: "T-1-A", speciesCommon: "Shihuahuaco Ámbar", volumeM3: "5.5" }),
      ],
      { umbrales: { general: { aviso: 40, grave: 55 }, porEspecie: { "shihuahuaco ambar": { aviso: 60, grave: 75 } } } },
    );
    expect(op.mermaVeredicto).toBe("ok");
  });

  it("sin trozado no hay veredicto de merma (el árbol recién se tumbó)", () => {
    const [op] = buildTraceOperations([entry({ section: "tala", treeCode: "T-9", volumeM3: "10" })]);
    expect(op.mermaVeredicto).toBe("ok");
    expect(op.alerts).toHaveLength(0);
  });
});

describe("tiempo: recorrido, plazo de registro y madera parada", () => {
  const cadena: LothEntryDTO[] = [
    entry({ section: "tala", treeCode: "30-TOR", volumeM3: "10", entryDate: "2026-03-01" }),
    entry({ section: "trozado", treeCode: "30-TOR", trozaCode: "30-TOR-A", volumeM3: "7", entryDate: "2026-03-04" }),
    entry({ section: "despacho_troza", trozaCode: "30-TOR-A", gtfNumber: "G-30", entryDate: "2026-03-20" }),
  ];

  it("mide los días entre etapas y publica la fecha de cada una", () => {
    const [op] = buildTraceOperations(cadena);
    expect(op.etapaFechas[0]).toBe("2026-03-01");
    expect(op.etapaFechas[1]).toBe("2026-03-04");
    expect(op.etapaFechas[3]).toBeNull(); // sin consumo
    expect(op.diasTalaTrozado).toBe(3);
    expect(op.diasTalaSalida).toBe(19);
  });

  it("cuenta las líneas asentadas fuera del plazo de 15 días", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "31-TOR", volumeM3: "10", entryDate: "2026-03-01", createdAt: "2026-03-02" }),
      // 25 días después de la actividad: fuera del plazo SERFOR.
      entry({ section: "trozado", treeCode: "31-TOR", trozaCode: "31-A", volumeM3: "7", entryDate: "2026-03-04", createdAt: "2026-03-29" }),
    ]);
    expect(op.tardias).toBe(1);
    expect(op.maxDiasRegistro).toBe(25);
    expect(op.alerts.some((a) => /fuera del plazo/.test(a.message))).toBe(true);
  });

  it("sin `hoy` no hay alerta de parado: el resultado no depende del reloj", () => {
    const [sinHoy] = buildTraceOperations([
      entry({ section: "tala", treeCode: "32-TOR", volumeM3: "10", entryDate: "2026-03-01" }),
      entry({ section: "trozado", treeCode: "32-TOR", trozaCode: "32-A", volumeM3: "7", entryDate: "2026-03-01" }),
    ]);
    expect(sinHoy.diasParado).toBeNull();
    expect(sinHoy.alerts.some((a) => /parad|patio/i.test(a.message))).toBe(false);

    const [conHoy] = buildTraceOperations(
      [
        entry({ section: "tala", treeCode: "32-TOR", volumeM3: "10", entryDate: "2026-03-01" }),
        entry({ section: "trozado", treeCode: "32-TOR", trozaCode: "32-A", volumeM3: "7", entryDate: "2026-03-01" }),
      ],
      { hoy: new Date("2026-05-01T12:00:00Z") },
    );
    expect(conHoy.diasParado).toBe(61);
    expect(conHoy.alerts.some((a) => /en patio sin salir/.test(a.message))).toBe(true);
  });

  it("una cadena que ya salió no cuenta como parada aunque sea vieja", () => {
    const [op] = buildTraceOperations(cadena, { hoy: new Date("2027-01-01T00:00:00Z") });
    expect(op.diasParado).toBeNull();
    expect(op.movilizada).toBe(true);
  });

  it("el resumen publica merma total, graves, tardías y la mediana del recorrido", () => {
    const s = buildTraceSummary(
      buildTraceOperations([
        ...cadena,
        entry({ section: "tala", treeCode: "33-TOR", volumeM3: "10", entryDate: "2026-04-01" }),
        entry({ section: "trozado", treeCode: "33-TOR", trozaCode: "33-A", volumeM3: "2", entryDate: "2026-04-02" }),
        entry({ section: "despacho_troza", trozaCode: "33-A", gtfNumber: "G-33", entryDate: "2026-04-11" }),
      ]),
    );
    expect(s.mermaVolM3).toBe(11); // 3 + 8
    expect(s.mermaGrave).toBe(1); // el 33-TOR perdió el 80%
    expect(s.conTardias).toBe(0); // ninguna línea trae createdAt
    expect(s.diasTalaSalidaMediana).toBe(10); // mediana de [10, 19]
  });
});

describe("huecos de atribución (GTF fantasma y producto sin troza)", () => {
  const conGtf: LothEntryDTO[] = [
    entry({ section: "tala", treeCode: "40-TOR", volumeM3: "10" }),
    entry({ section: "trozado", treeCode: "40-TOR", trozaCode: "40-A", volumeM3: "7" }),
    entry({ section: "despacho_troza", trozaCode: "40-A", gtfNumber: "001-0045678" }),
  ];

  it("sin la lista de guías emitidas NO acusa a nadie", () => {
    // «No la encontré» y «no la busqué» no son lo mismo: si el fetch de guías
    // falló, la pantalla no puede inventar una infracción.
    const [op] = buildTraceOperations(conGtf);
    expect(op.gtfsFantasma).toEqual([]);
    expect(op.alerts.some((a) => /no figura/.test(a.message))).toBe(false);
  });

  it("con la lista, la guía declarada que nadie emitió es alerta de error", () => {
    const [op] = buildTraceOperations(conGtf, { gtfEmitidas: new Set(["TEST-GTF-9001"]) });
    expect(op.gtfsFantasma).toEqual(["001-0045678"]);
    expect(op.alerts.some((a) => a.level === "error" && /no figura/.test(a.message))).toBe(true);
  });

  it("la guía que sí existe no levanta nada", () => {
    const [op] = buildTraceOperations(conGtf, { gtfEmitidas: new Set(["001-0045678"]) });
    expect(op.gtfsFantasma).toEqual([]);
    expect(op.alerts).toHaveLength(0);
  });

  it("cuenta el producto que no dice de qué troza salió", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "41-TOR", volumeM3: "10" }),
      entry({ section: "trozado", treeCode: "41-TOR", trozaCode: "41-A", volumeM3: "7" }),
      // Sin trozaCode: cae al fallback por especie.
      entry({ section: "producto_terminado", productType: "Madera aserrada", quantity: "3", unit: "m3" }),
      entry({ section: "despacho_producto", productType: "Madera aserrada", quantity: "3", unit: "m3", gtfNumber: "G-41" }),
      // Con trozaCode: atribución individual, no suma al conteo.
      entry({ section: "producto_terminado", trozaCode: "41-A", productType: "Madera aserrada", quantity: "1", unit: "m3" }),
    ]);
    expect(op.productoSinTroza).toBe(2);
    expect(op.alerts.some((a) => a.level === "warn" && /no declaran de qué troza/.test(a.message))).toBe(true);
  });

  it("el resumen junta las guías fantasma sin repetirlas", () => {
    const s = buildTraceSummary(
      buildTraceOperations(
        [
          ...conGtf,
          entry({ section: "tala", treeCode: "42-TOR", volumeM3: "5" }),
          entry({ section: "trozado", treeCode: "42-TOR", trozaCode: "42-A", volumeM3: "4" }),
          // La MISMA guía inexistente en otro árbol: es un problema, no dos.
          entry({ section: "despacho_troza", trozaCode: "42-A", gtfNumber: "001-0045678" }),
        ],
        { gtfEmitidas: new Set(["OTRA"]) },
      ),
    );
    expect(s.gtfsFantasma).toEqual(["001-0045678"]);
    expect(s.conProductoSinTroza).toBe(0);
  });
});
