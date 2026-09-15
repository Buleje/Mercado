import { describe, it, expect } from "vitest";
import {
  smalianVolume,
  censusVolume,
  computeBalance,
  computeAprovechamiento,
  claveEspecie,
  cruzarEspecies,
  mismaEspecie,
  detectAnomalias,
  projectSaldo,
  computeCosteo,
  type BalanceSpeciesInput,
  type BalanceMovement,
} from "@/lib/forestal/loth-constants";

/**
 * Tests de la lógica forestal SERFOR (ADR-126). Fórmulas puras + balance.
 * Valores de referencia verificados contra la guía SERFOR y el flujo del árbol 85-TOR.
 */

describe("smalianVolume — cubicación de troza (0.7854·((Ømay+Ømen)/2)²·L)", () => {
  it("tronco 85-TOR (Ø 0.80/0.60, L 13) ≈ 5.0030 m³ (ejemplo guía SERFOR)", () => {
    expect(smalianVolume(0.8, 0.6, 13)).toBe(5.003);
  });
  it("troza cilíndrica Ø 0.96 × L 16 = 11.5812 m³", () => {
    expect(smalianVolume(0.96, 0.96, 16)).toBe(11.5812);
  });
  it("retorna 0 con medidas inválidas (cero o negativas)", () => {
    expect(smalianVolume(0, 0.6, 13)).toBe(0);
    expect(smalianVolume(0.8, 0, 13)).toBe(0);
    expect(smalianVolume(0.8, 0.6, 0)).toBe(0);
    expect(smalianVolume(-1, 0.6, 13)).toBe(0);
  });
  it("redondea a 4 decimales (estándar SERFOR)", () => {
    const v = smalianVolume(0.8, 0.78, 3); // 0.7854·0.79²·3
    expect(v).toBeCloseTo(1.4705, 4);
    expect(Number.isInteger(v * 10000)).toBe(true);
  });
});

describe("censusVolume — volumen comercial del árbol en pie (0.7854·DAP²·Hc·ff)", () => {
  it("Tornillo censo (DAP 0.80, Hc 13, ff 0.65) = 4.2474 m³", () => {
    expect(censusVolume(0.8, 13, 0.65)).toBe(4.2474);
  });
  it("Shihuahuaco censo (DAP 0.96, Hc 16, ff 0.65) = 7.5278 m³", () => {
    expect(censusVolume(0.96, 16, 0.65)).toBe(7.5278);
  });
  it("ff por defecto = 0.65", () => {
    expect(censusVolume(0.8, 13)).toBe(censusVolume(0.8, 13, 0.65));
  });
  it("retorna 0 con DAP o Hc inválidos", () => {
    expect(censusVolume(0, 16)).toBe(0);
    expect(censusVolume(0.8, 0)).toBe(0);
  });
});

describe("computeBalance — balance de extracción / saldos (operación 85-TOR)", () => {
  const species: BalanceSpeciesInput[] = [
    { speciesCommon: "Tornillo", cites: false, volumenAutorizadoM3: 80, precioVentaSoles: 450, valorEstadoNaturalSoles: 22.5 },
    { speciesCommon: "Shihuahuaco", cites: true, volumenAutorizadoM3: 60, precioVentaSoles: 950, valorEstadoNaturalSoles: 41 },
  ];
  const movements: BalanceMovement[] = [
    { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 5.003, quantity: null, unit: null },
    { section: "trozado", speciesCommon: "Tornillo", trozaCode: "85-TOR-A", volumeM3: 1.471, quantity: null, unit: null },
    { section: "trozado", speciesCommon: "Tornillo", trozaCode: "85-TOR-B", volumeM3: 1.29, quantity: null, unit: null },
    { section: "despacho_troza", speciesCommon: null, trozaCode: "85-TOR-A", volumeM3: null, quantity: null, unit: null },
    { section: "despacho_troza", speciesCommon: null, trozaCode: "85-TOR-B", volumeM3: null, quantity: null, unit: null },
    { section: "despacho_producto", speciesCommon: "Tornillo", trozaCode: null, volumeM3: null, quantity: 1.9, unit: "m3" },
  ];

  const r = computeBalance(species, movements, { uitRef: 5350, areaHa: 1200 });
  const tornillo = r.rows.find((x) => x.species === "Tornillo")!;
  const shi = r.rows.find((x) => x.species === "Shihuahuaco")!;

  it("movilizado de Tornillo = trozas despachadas (A+B) + producto (1.9) = 4.661 m³", () => {
    expect(tornillo.movilizado).toBeCloseTo(4.661, 3);
  });
  it("saldo = autorizado − movilizado", () => {
    expect(tornillo.saldo).toBeCloseTo(75.339, 3);
  });
  it("valor movilizado = movilizado × precio/m³", () => {
    expect(tornillo.valorMovilizado).toBeCloseTo(2097.45, 2);
  });
  it("pago derecho especie = movilizado × VEN/m³", () => {
    expect(tornillo.pagoDerecho).toBeCloseTo(104.87, 2);
  });
  it("especie sin movimientos: saldo = autorizado, sin valor", () => {
    expect(shi.movilizado).toBe(0);
    expect(shi.saldo).toBe(60);
    expect(shi.valorMovilizado).toBe(0);
  });
  it("pago por área = 0.01% UIT × ha", () => {
    expect(r.pagoArea).toBe(642); // 0.0001 × 5350 × 1200
  });
  it("pago derecho total = pago área + Σ pago derecho especies", () => {
    expect(r.pagoDerechoTotal).toBeCloseTo(746.87, 2);
  });
  it("no marca exceso cuando movilizado < autorizado", () => {
    expect(tornillo.exceso).toBe(false);
  });
  it("marca EXCESO cuando lo movilizado supera lo autorizado (causa de sanción OSINFOR)", () => {
    const exceso = computeBalance(
      [{ speciesCommon: "Caoba", cites: true, volumenAutorizadoM3: 2, precioVentaSoles: 1200, valorEstadoNaturalSoles: 60 }],
      [
        { section: "trozado", speciesCommon: "Caoba", trozaCode: "1-CAO-A", volumeM3: 3, quantity: null, unit: null },
        { section: "despacho_troza", speciesCommon: null, trozaCode: "1-CAO-A", volumeM3: null, quantity: null, unit: null },
      ],
      {},
    );
    expect(exceso.rows[0].exceso).toBe(true);
    expect(exceso.rows[0].saldo).toBeLessThan(0);
  });
});

describe("computeAprovechamiento — cascada bosque→producto (Batch 2)", () => {
  const movs: BalanceMovement[] = [
    { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 5.003, quantity: null, unit: null },
    { section: "trozado", speciesCommon: "Tornillo", trozaCode: "85-TOR-A", volumeM3: 4.887, quantity: null, unit: null },
    { section: "despacho_troza", speciesCommon: null, trozaCode: "85-TOR-A", volumeM3: null, quantity: null, unit: null },
    { section: "consumo_troza", speciesCommon: "Tornillo", trozaCode: "85-TOR-B", volumeM3: 2.126, quantity: null, unit: null },
    { section: "despacho_producto", speciesCommon: "Tornillo", trozaCode: null, volumeM3: null, quantity: 1.9, unit: "m3" },
  ];
  it("funnel: talado 5.003 → trozado 4.887 → despacho troza 4.887 (resuelto) → consumo 2.126 → despacho PT 1.9", () => {
    const a = computeAprovechamiento(movs);
    expect(a.funnel.taladoM3).toBe(5.003);
    expect(a.funnel.trozadoM3).toBe(4.887);
    expect(a.funnel.despachoTrozaM3).toBe(4.887);
    expect(a.funnel.consumidoM3).toBe(2.126);
    expect(a.funnel.despachoProductoM3).toBe(1.9);
  });
  it("rendimiento global = trozado/talado ≈ 97.7%", () => {
    expect(computeAprovechamiento(movs).rendimientoGlobalPct).toBe(97.7);
  });
  it("merma por especie = talado − trozado", () => {
    const tor = computeAprovechamiento(movs).bySpecies.find((s) => s.species === "Tornillo")!;
    expect(tor.mermaM3).toBe(0.116);
  });
});

describe("detectAnomalias — defensa ante fiscalización (Batch 2)", () => {
  it("detecta trozado > talado (imposible)", () => {
    const an = detectAnomalias([
      { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 3, quantity: null, unit: null },
      { section: "trozado", speciesCommon: "Tornillo", trozaCode: "T-A", volumeM3: 5, quantity: null, unit: null },
    ]);
    expect(an.some((a) => a.code === "trozado_gt_talado" && a.level === "error")).toBe(true);
  });
  it("detecta troza despachada sin trozado previo (fantasma)", () => {
    const an = detectAnomalias([
      { section: "despacho_troza", speciesCommon: null, trozaCode: "X-99", volumeM3: null, quantity: null, unit: null },
    ]);
    expect(an.some((a) => a.code === "troza_fantasma")).toBe(true);
  });
  it("propaga exceso del balance + alerta de líneas fuera de plazo", () => {
    const an = detectAnomalias([], [{ species: "Caoba", autorizado: 2, movilizado: 3, saldo: -1, exceso: true }], 4);
    expect(an.some((a) => a.code === "exceso_autorizado")).toBe(true);
    expect(an.some((a) => a.code === "fuera_de_plazo")).toBe(true);
  });
  it("libro consistente → sin anomalías", () => {
    expect(detectAnomalias([
      { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 5, quantity: null, unit: null },
      { section: "trozado", speciesCommon: "Tornillo", trozaCode: "T-A", volumeM3: 4, quantity: null, unit: null },
    ])).toHaveLength(0);
  });
});

describe("projectSaldo — proyección de agotamiento (Batch 2)", () => {
  it("ritmo y días para agotar según movilización histórica", () => {
    const p = projectSaldo(100, 30, "2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z")!;
    expect(p.ritmoDiaM3).toBe(1); // 30 m³ / 30 días
    expect(p.diasParaAgotar).toBe(100); // 100 / 1
  });
  it("retorna null sin movilización o sin saldo", () => {
    expect(projectSaldo(100, 0, "2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z")).toBeNull();
    expect(projectSaldo(0, 30, "2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z")).toBeNull();
  });
});

describe("computeCosteo — margen por m³ (Batch 3)", () => {
  it("margen = precio − (VEN + extracción + transformación + flete) × movilizado", () => {
    const r = computeCosteo(
      [{ species: "Tornillo", movilizadoM3: 10, precioVentaM3: 450, venM3: 22.5 }],
      { extraccionM3: 120, transformacionM3: 80, fleteM3: 60 },
    );
    const row = r.rows[0];
    expect(row.costoTotalM3).toBe(282.5); // 22.5 + 120 + 80 + 60
    expect(row.margenM3).toBe(167.5); // 450 − 282.5
    expect(row.margen).toBe(1675); // ×10
    expect(row.margenPct).toBe(37.2); // 167.5/450
    expect(r.margenTotal).toBe(1675);
    expect(r.costoOperativoM3).toBe(260);
  });
  it("margen negativo cuando el costo supera el precio", () => {
    const r = computeCosteo(
      [{ species: "X", movilizadoM3: 1, precioVentaM3: 100, venM3: 40 }],
      { extraccionM3: 50, transformacionM3: 30, fleteM3: 0 },
    );
    expect(r.rows[0].margenM3).toBe(-20);
    expect(r.margenTotal).toBeLessThan(0);
  });
  it("sin costos operativos: margen = precio − VEN", () => {
    const r = computeCosteo([{ species: "X", movilizadoM3: 2, precioVentaM3: 300, venM3: 30 }], { extraccionM3: 0, transformacionM3: 0, fleteM3: 0 });
    expect(r.rows[0].margenM3).toBe(270);
    expect(r.ingresoTotal).toBe(600);
  });
});

describe("computeBalance — la madera que el POA no autoriza", () => {
  /**
   * El balance recorre las especies AUTORIZADAS. Sin `fueraDePlan`, mover una
   * especie que no está en el plan no aparecía en ninguna fila: el saldo se
   * leía impecable justo cuando la infracción era más grave.
   */
  const soloTornilloAutorizado: BalanceSpeciesInput[] = [
    { speciesCommon: "Tornillo", cites: false, volumenAutorizadoM3: 80, precioVentaSoles: null, valorEstadoNaturalSoles: null },
  ];

  it("lista la especie movilizada que el plan no declara", () => {
    const movs: BalanceMovement[] = [
      { section: "trozado", speciesCommon: "Cumala", trozaCode: "C-1", volumeM3: 3.5, quantity: null, unit: null },
      { section: "despacho_troza", speciesCommon: null, trozaCode: "C-1", volumeM3: null, quantity: null, unit: null },
    ];
    const r = computeBalance(soloTornilloAutorizado, movs);
    expect(r.rows).toHaveLength(1); // sólo Tornillo, como siempre
    expect(r.fueraDePlan).toEqual([{ species: "Cumala", movilizadoM3: 3.5 }]);
  });

  it("suma también el producto terminado despachado en m³", () => {
    const movs: BalanceMovement[] = [
      { section: "despacho_producto", speciesCommon: "Cumala", trozaCode: null, volumeM3: null, quantity: 2, unit: "m3" },
      { section: "despacho_producto", speciesCommon: "Lupuna", trozaCode: null, volumeM3: null, quantity: 5, unit: "m3" },
    ];
    const r = computeBalance(soloTornilloAutorizado, movs);
    // Ordenado por volumen: la que más pesa, primero.
    expect(r.fueraDePlan).toEqual([
      { species: "Lupuna", movilizadoM3: 5 },
      { species: "Cumala", movilizadoM3: 2 },
    ]);
  });

  it("la especie autorizada nunca cae en la lista, ni con exceso", () => {
    const movs: BalanceMovement[] = [
      { section: "trozado", speciesCommon: "Tornillo", trozaCode: "T-1", volumeM3: 200, quantity: null, unit: null },
      { section: "despacho_troza", speciesCommon: null, trozaCode: "T-1", volumeM3: null, quantity: null, unit: null },
    ];
    const r = computeBalance(soloTornilloAutorizado, movs);
    expect(r.fueraDePlan).toEqual([]);
    expect(r.rows[0].exceso).toBe(true); // el exceso lo sigue reportando `rows`
  });

  it("talar sin despachar todavía no cuenta: la lista mide lo MOVILIZADO", () => {
    const movs: BalanceMovement[] = [
      { section: "tala", speciesCommon: "Cumala", trozaCode: null, volumeM3: 9, quantity: null, unit: null },
    ];
    expect(computeBalance(soloTornilloAutorizado, movs).fueraDePlan).toEqual([]);
  });
});

describe("claveEspecie / cruzarEspecies — el paréntesis que fabricaba infracciones", () => {
  it("el nombre de la resolución y el del libro son la misma especie", () => {
    // Caso REAL del tenant: el plan copia «Tornillo (Cedrelinga catenaeformis)»
    // y el libro asienta «Tornillo». Comparados como strings nunca coincidían.
    expect(claveEspecie("Tornillo (Cedrelinga catenaeformis)")).toBe("tornillo");
    expect(claveEspecie("  TORNILLO  ")).toBe("tornillo");
    expect(claveEspecie("Shihuahuaco Ámbar")).toBe("shihuahuaco ambar");
    expect(mismaEspecie("Tornillo (Cedrelinga catenaeformis)", "tornillo")).toBe(true);
    expect(mismaEspecie("Cedro", "Tornillo")).toBe(false);
    expect(mismaEspecie(null, "Tornillo")).toBe(false);
  });

  it("el balance cruza por clave: el saldo deja de verse intacto", () => {
    const species: BalanceSpeciesInput[] = [
      { speciesCommon: "Tornillo (Cedrelinga catenaeformis)", cites: false, volumenAutorizadoM3: 320 },
    ];
    const movs: BalanceMovement[] = [
      { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 9.54, quantity: null, unit: null },
      { section: "trozado", speciesCommon: "Tornillo", trozaCode: "T-A", volumeM3: 2.85, quantity: null, unit: null },
      { section: "despacho_troza", speciesCommon: null, trozaCode: "T-A", volumeM3: null, quantity: null, unit: null },
    ];
    const r = computeBalance(species, movs);
    expect(r.rows[0].talado).toBe(9.54);
    expect(r.rows[0].movilizado).toBe(2.85);
    expect(r.rows[0].saldo).toBe(317.15);
    // Y deja de acusar: la especie SÍ está autorizada, sólo estaba escrita distinto.
    expect(r.fueraDePlan).toEqual([]);
  });

  it("separa «no autorizada» de «escrita distinto»", () => {
    const c = cruzarEspecies(["Tornillo", "Cedro rojo", "Caoba"], ["Tornillo (Cedrelinga catenaeformis)", "Cedro"]);
    // Tornillo cruza exacto por clave; Cedro rojo se parece a Cedro; Caoba no está.
    expect(c.sinAutorizar).toEqual(["Caoba"]);
    expect(c.ambiguas).toEqual([{ libro: "Cedro rojo", plan: "Cedro" }]);
  });

  it("sin especies en el plan no se acusa a nadie", () => {
    const c = cruzarEspecies(["Tornillo"], []);
    expect(c.sinAutorizar).toEqual(["Tornillo"]);
    expect(c.autorizadas.size).toBe(0);
  });
});
