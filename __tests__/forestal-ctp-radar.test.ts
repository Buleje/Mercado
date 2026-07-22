/**
 * Balance de la cadena de custodia (Radar del Libro CTP).
 *
 * Lo que se blinda: el radar decide si un despacho "traza de punta a punta". Si
 * el criterio mira sólo la EXISTENCIA de la conexión y no el VOLUMEN, un
 * despacho con la mitad del origen sin atribuir sale pintado de verde y el
 * fiscalizador encuentra el hueco antes que nosotros.
 */
import { describe, expect, it } from "vitest";
import { analizarRadar, grosorArista, ordenarNodos, radarToCsv } from "@/lib/forestal/ctp-radar";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

const vacio: TrazaGrafo = { ingresos: [], corridas: [], despachos: [], consumos: [], origenes: [] };

/** Fecha date-only cualquiera: este módulo no mira el tiempo (eso es ctp-radar-tiempo). */
const F = "2026-06-01T00:00:00.000Z";

/** Cadena mínima completa: 10 m³ de GTF → corrida → despacho, todo cuadrado. */
function cadenaCompleta(): TrazaGrafo {
  return {
    ingresos: [{ id: "w1", gtf: "GTF-001", species: "Tornillo", volumeM3: 10, cites: false, fecha: F }],
    corridas: [{ id: "c1", lineNo: 1, label: "Aserrío tornillo", quantity: 6, unit: "m3", cites: false, productType: "Aserrío", species: "Tornillo", fecha: F }],
    despachos: [{ id: "d1", lineNo: 5, label: "Envío Lima", quantity: 6, unit: "m3", destino: "Lima", gtf: "GTF-900", fecha: F }],
    consumos: [{ from: "w1", to: "c1", volumeM3: 10 }],
    origenes: [{ from: "c1", to: "d1", quantity: 6 }],
  };
}

describe("balance del radar", () => {
  it("grafo vacío: sin porcentajes inventados", () => {
    const a = analizarRadar(vacio);
    expect(a.totales.trazabilidadPct).toBeNull();
    expect(a.totales.consumoPct).toBeNull();
    expect(a.warnIds.size).toBe(0);
  });

  it("cadena completa: todo ok y 100% de trazabilidad", () => {
    const a = analizarRadar(cadenaCompleta());
    expect(a.ingresos.get("w1")!.estado).toBe("ok");
    expect(a.ingresos.get("w1")!.sinAtribuir).toBe(0);
    expect(a.despachos.get("d1")!.estado).toBe("ok");
    expect(a.totales.trazabilidadPct).toBe(100);
    expect(a.totales.consumoPct).toBe(100);
    expect(a.totales.stockSinConsumirM3).toBe(0);
  });

  it("EL BUG QUE MOTIVÓ ESTO: despacho con origen incompleto ya no cuenta como completo", () => {
    const g = cadenaCompleta();
    g.despachos[0].quantity = 12; // se despachan 12, pero sólo 6 tienen origen
    const a = analizarRadar(g);
    const d = a.despachos.get("d1")!;
    expect(d.estado).toBe("parcial");
    expect(d.sinAtribuir).toBe(6);
    expect(d.pct).toBe(50);
    // Parcial NO es completo: la trazabilidad cae a 0.
    expect(a.totales.despachosCompletos).toBe(0);
    expect(a.totales.despachosParciales).toBe(1);
    expect(a.totales.trazabilidadPct).toBe(0);
  });

  it("ingreso a medio consumir: parcial, con el saldo real en m³", () => {
    const g = cadenaCompleta();
    g.consumos[0].volumeM3 = 4; // de 10 m³ sólo entraron 4 a producción
    const a = analizarRadar(g);
    const w = a.ingresos.get("w1")!;
    expect(w.estado).toBe("parcial");
    expect(w.cubierto).toBe(4);
    expect(w.sinAtribuir).toBe(6);
    expect(w.pct).toBe(40);
    expect(a.totales.stockSinConsumirM3).toBe(6);
    expect(a.totales.consumoPct).toBe(40);
  });

  it("ingreso sin consumir es stock en patio, NO un hueco de la cadena", () => {
    const g = cadenaCompleta();
    g.consumos = [];
    g.origenes = [];
    const a = analizarRadar(g);
    expect(a.ingresos.get("w1")!.estado).toBe("muted");
    expect(a.warnIds.has("w1")).toBe(false);
    // La corrida sin materia prima sí es un hueco.
    expect(a.corridas.get("c1")!.estado).toBe("warn");
    expect(a.totales.corridasHuerfanas).toBe(1);
  });

  it("corrida sin materia prima contamina el despacho aunque el volumen cuadre", () => {
    const g = cadenaCompleta();
    g.consumos = []; // la corrida queda huérfana, pero sigue surtiendo al despacho
    const a = analizarRadar(g);
    const d = a.despachos.get("d1")!;
    // El volumen del despacho está atribuido (6 de 6)…
    expect(d.cubierto).toBe(6);
    // …pero la cadena no llega hasta la GTF: es hueco, no "ok".
    expect(d.estado).toBe("warn");
    expect(a.totales.despachosHueco).toBe(1);
    expect(a.totales.trazabilidadPct).toBe(0);
  });

  it("despacho sin ningún origen: hueco", () => {
    const g = cadenaCompleta();
    g.origenes = [];
    const a = analizarRadar(g);
    expect(a.despachos.get("d1")!.estado).toBe("warn");
    expect(a.warnIds.has("d1")).toBe(true);
  });

  it("no reporta sin-atribuir por ruido decimal", () => {
    const g = cadenaCompleta();
    g.ingresos[0].volumeM3 = 3.3;
    g.consumos[0].volumeM3 = 1.1 + 2.2; // 3.3000000000000003
    const a = analizarRadar(g);
    expect(a.ingresos.get("w1")!.estado).toBe("ok");
    expect(a.ingresos.get("w1")!.sinAtribuir).toBe(0);
  });

  it("sobre-atribución no genera saldos negativos", () => {
    const g = cadenaCompleta();
    g.consumos[0].volumeM3 = 25; // más de lo ingresado (I1 debería impedirlo aguas arriba)
    const a = analizarRadar(g);
    const w = a.ingresos.get("w1")!;
    expect(w.sinAtribuir).toBe(0);
    expect(w.pct).toBe(100);
    expect(w.cubierto).toBeLessThanOrEqual(w.total);
  });

  it("suma varias GTF hacia una misma corrida", () => {
    const g = cadenaCompleta();
    g.ingresos.push({ id: "w2", gtf: "GTF-002", species: "Cumala", volumeM3: 5, cites: true, fecha: F });
    g.consumos = [
      { from: "w1", to: "c1", volumeM3: 10 },
      { from: "w2", to: "c1", volumeM3: 5 },
    ];
    const a = analizarRadar(g);
    expect(a.ingresos.get("w2")!.estado).toBe("ok");
    expect(a.totales.ingresoM3).toBe(15);
    expect(a.totales.consumidoM3).toBe(15);
    expect(a.totales.citesCount).toBe(1);
  });

  it("cantidades no numéricas no rompen el balance", () => {
    const g = cadenaCompleta();
    // @ts-expect-error — simula una fila con la cantidad nula en la DB
    g.despachos[0].quantity = null;
    const a = analizarRadar(g);
    const d = a.despachos.get("d1")!;
    expect(d.total).toBe(0);
    expect(d.pct).toBeNull(); // sin total declarado no se inventa un %
    expect(Number.isFinite(d.sinAtribuir)).toBe(true);
  });
});

describe("ayudas de lectura", () => {
  it("el grosor de arista crece con el volumen y respeta los límites", () => {
    expect(grosorArista(0, 10)).toBe(1.2);
    expect(grosorArista(10, 10)).toBe(5);
    expect(grosorArista(5, 10)).toBeGreaterThan(grosorArista(1, 10));
    expect(grosorArista(50, 10)).toBe(5); // clamp
    expect(grosorArista(Number.NaN, 10)).toBe(1.2);
  });

  it("ordenar por estado pone primero lo que hay que mirar", () => {
    const g = cadenaCompleta();
    g.corridas.push({ id: "c2", lineNo: 2, label: "Huérfana", quantity: 3, unit: "m3", cites: false, productType: "Aserrío", species: "Tornillo", fecha: F });
    const a = analizarRadar(g);
    const orden = ordenarNodos(g.corridas, "estado", a.corridas, (c) => c.quantity);
    expect(orden[0].id).toBe("c2"); // la huérfana (warn) primero
    // Por línea = orden original intacto.
    expect(ordenarNodos(g.corridas, "linea", a.corridas, (c) => c.quantity)[0].id).toBe("c1");
    // Por volumen, la más grande primero.
    expect(ordenarNodos(g.corridas, "volumen", a.corridas, (c) => c.quantity)[0].id).toBe("c1");
  });

  it("ordenar no muta el arreglo de entrada", () => {
    const g = cadenaCompleta();
    g.corridas.push({ id: "c2", lineNo: 2, label: "Otra", quantity: 99, unit: "m3", cites: false, productType: "Aserrío", species: "Tornillo", fecha: F });
    const a = analizarRadar(g);
    ordenarNodos(g.corridas, "volumen", a.corridas, (c) => c.quantity);
    expect(g.corridas[0].id).toBe("c1");
  });

  it("el CSV lleva nodos con su saldo y las aristas con su volumen", () => {
    const g = cadenaCompleta();
    g.despachos[0].quantity = 12;
    const csv = radarToCsv(g, analizarRadar(g));
    const lineas = csv.split("\n");
    expect(lineas[0]).toContain("sin_atribuir");
    expect(lineas.some((l) => l.startsWith("ingreso,w1,GTF GTF-001,Tornillo,10,10,0,100,ok"))).toBe(true);
    expect(lineas.some((l) => l.includes("despacho,d1") && l.endsWith(",12,6,6,50,parcial"))).toBe(true);
    expect(lineas.some((l) => l === "consumo,w1,c1,10")).toBe(true);
    expect(lineas.some((l) => l === "origen,c1,d1,6")).toBe(true);
  });

  it("el CSV escapa las comas de las etiquetas", () => {
    const g = cadenaCompleta();
    g.despachos[0].destino = "Lima, Perú";
    const csv = radarToCsv(g, analizarRadar(g));
    expect(csv).toContain('"Lima, Perú"');
  });
});
