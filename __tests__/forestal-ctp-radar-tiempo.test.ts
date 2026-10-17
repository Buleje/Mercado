/**
 * Cronología, rendimiento y seguimiento de una GTF en el radar.
 *
 * Lo que se blinda: son los tres análisis que sostienen acusaciones ("esta
 * corrida es anterior a su GTF", "esta merma es anómala"). Un falso positivo
 * acá manda a alguien a corregir un libro que estaba bien; un falso negativo
 * deja pasar exactamente lo que se quería detectar.
 */
import { describe, expect, it } from "vitest";
import {
  analizarTiempo,
  diaUtc,
  fechaCorta,
  PERMANENCIA_LARGA_DIAS,
  posicionEnEje,
} from "@/lib/forestal/ctp-radar-tiempo";
import {
  alertasRendimiento,
  analizarRendimiento,
  DESVIO_PCT,
  mediana,
  MIN_GRUPO,
} from "@/lib/forestal/ctp-radar-rendimiento";
import { cadenaDeIngreso, resumenCadena } from "@/lib/forestal/ctp-radar-cadena";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

const HOY = new Date("2026-07-22T00:00:00.000Z");

const ingreso = (id: string, fecha: string, extra: Partial<TrazaGrafo["ingresos"][0]> = {}) => ({
  id, gtf: `GTF-${id}`, species: "Tornillo", volumeM3: 10, cites: false, fecha, ...extra,
});
const corrida = (id: string, lineNo: number, fecha: string, extra: Partial<TrazaGrafo["corridas"][0]> = {}) => ({
  id, lineNo, label: "Madera aserrada · Tornillo", quantity: 5, unit: "m3", cites: false,
  productType: "Madera aserrada", species: "Tornillo", fecha, ...extra,
});
const despacho = (id: string, lineNo: number, fecha: string, extra: Partial<TrazaGrafo["despachos"][0]> = {}) => ({
  id, lineNo, label: "Madera aserrada · Tornillo", quantity: 5, unit: "m3", destino: "Lima", gtf: "GTF-S1", fecha, ...extra,
});

/** Cadena sana: ingresa 1 jun, se produce 10 jun, se despacha 20 jun. */
function grafoSano(): TrazaGrafo {
  return {
    ingresos: [ingreso("w1", "2026-06-01T00:00:00.000Z")],
    corridas: [corrida("c1", 1, "2026-06-10T00:00:00.000Z")],
    despachos: [despacho("d1", 7, "2026-06-20T00:00:00.000Z")],
    consumos: [{ from: "w1", to: "c1", volumeM3: 10 }],
    origenes: [{ from: "c1", to: "d1", quantity: 5 }],
  };
}

describe("cronología de la cadena", () => {
  it("una cadena en orden no genera anomalías", () => {
    const t = analizarTiempo(grafoSano(), HOY);
    expect(t.anomalias).toHaveLength(0);
    expect(t.desde).toBe("2026-06-01T00:00:00.000Z");
    expect(t.hasta).toBe("2026-06-20T00:00:00.000Z");
  });

  it("detecta la corrida anterior a la GTF que la surtió", () => {
    const g = grafoSano();
    g.corridas[0].fecha = "2026-05-25T00:00:00.000Z"; // 7 días ANTES del ingreso
    const t = analizarTiempo(g, HOY);
    expect(t.anomalias).toHaveLength(1);
    expect(t.anomalias[0].tipo).toBe("produccion_antes_del_ingreso");
    expect(t.anomalias[0].dias).toBe(7);
    expect(t.anomalias[0].nodoId).toBe("c1");
    expect(t.anomalias[0].detalle).toContain("ingresó el");
  });

  it("detecta el despacho anterior a la corrida que salió en él", () => {
    const g = grafoSano();
    g.despachos[0].fecha = "2026-06-05T00:00:00.000Z"; // 5 días antes de producir
    const t = analizarTiempo(g, HOY);
    expect(t.anomalias).toHaveLength(1);
    expect(t.anomalias[0].tipo).toBe("despacho_antes_de_produccion");
    expect(t.anomalias[0].dias).toBe(5);
  });

  it("mismo día no es anomalía: entrar y procesar el mismo día es legítimo", () => {
    const g = grafoSano();
    g.corridas[0].fecha = g.ingresos[0].fecha;
    g.despachos[0].fecha = g.corridas[0].fecha;
    expect(analizarTiempo(g, HOY).anomalias).toHaveLength(0);
  });

  it("ordena las anomalías por gravedad (desfase mayor primero)", () => {
    const g = grafoSano();
    g.ingresos.push(ingreso("w2", "2026-06-01T00:00:00.000Z"));
    g.corridas.push(corrida("c2", 2, "2026-01-01T00:00:00.000Z")); // desfase enorme
    g.consumos.push({ from: "w2", to: "c2", volumeM3: 10 });
    g.corridas[0].fecha = "2026-05-30T00:00:00.000Z"; // desfase de 2 días
    const t = analizarTiempo(g, HOY);
    expect(t.anomalias).toHaveLength(2);
    expect(t.anomalias[0].dias).toBeGreaterThan(t.anomalias[1].dias);
  });

  it("mide la permanencia hasta el último despacho", () => {
    const t = analizarTiempo(grafoSano(), HOY);
    expect(t.permanencias[0].dias).toBe(19); // 1 jun → 20 jun
    expect(t.permanencias[0].abierta).toBe(false);
    expect(t.permanenciaMediaDias).toBe(19);
  });

  it("la madera sin despachar cuenta contra hoy y se marca como dormida", () => {
    const g = grafoSano();
    g.ingresos[0].fecha = "2025-01-01T00:00:00.000Z"; // hace más de un año
    g.consumos = [];
    g.origenes = [];
    const t = analizarTiempo(g, HOY);
    expect(t.permanencias[0].abierta).toBe(true);
    expect(t.permanencias[0].dias).toBeGreaterThan(PERMANENCIA_LARGA_DIAS);
    expect(t.dormidos).toHaveLength(1);
    // Sin cadenas cerradas no se inventa un promedio.
    expect(t.permanenciaMediaDias).toBeNull();
  });

  it("fechas date-only: sin off-by-one por la zona de Lima", () => {
    // Medianoche UTC del 1 de julio es 30 de junio 19:00 en Lima.
    expect(fechaCorta("2026-07-01T00:00:00.000Z")).toContain("1");
    expect(diaUtc("2026-07-01T00:00:00.000Z")).toBe(diaUtc("2026-07-01T23:59:00.000Z"));
    expect(diaUtc("no-es-fecha")).toBeNull();
  });

  it("el eje temporal normaliza y no se sale del rango", () => {
    const a = "2026-06-01T00:00:00.000Z";
    const b = "2026-06-11T00:00:00.000Z";
    expect(posicionEnEje(a, a, b)).toBe(0);
    expect(posicionEnEje(b, a, b)).toBe(1);
    expect(posicionEnEje("2026-06-06T00:00:00.000Z", a, b)).toBeCloseTo(0.5, 2);
    // Todo el período en un mismo día: al centro, sin dividir por cero.
    expect(posicionEnEje(a, a, a)).toBe(0.5);
    expect(posicionEnEje(a, null, b)).toBeNull();
  });
});

describe("rendimiento y merma", () => {
  /** 4 corridas del mismo producto: tres al 50% y una al 15%. */
  function grafoRendimiento(): TrazaGrafo {
    const g: TrazaGrafo = { ingresos: [], corridas: [], despachos: [], consumos: [], origenes: [] };
    const ratios = [0.5, 0.5, 0.5, 0.15];
    ratios.forEach((r, i) => {
      g.ingresos.push(ingreso(`w${i}`, "2026-06-01T00:00:00.000Z", { volumeM3: 10 }));
      g.corridas.push(corrida(`c${i}`, i + 1, "2026-06-10T00:00:00.000Z", { quantity: 10 * r }));
      g.consumos.push({ from: `w${i}`, to: `c${i}`, volumeM3: 10 });
    });
    return g;
  }

  it("marca la corrida con merma muy por encima de sus pares", () => {
    const rs = analizarRendimiento(grafoRendimiento());
    const mala = rs.find((r) => r.id === "c3")!;
    expect(mala.flag).toBe("bajo");
    expect(mala.ratio).toBe(0.15);
    expect(mala.medianaGrupo).toBe(0.5);
    expect(mala.desvioPct).toBe(-70);
    expect(mala.motivo).toContain("menos que las demás");
    // Las normales no se marcan.
    expect(rs.filter((r) => r.flag === "normal")).toHaveLength(3);
    expect(alertasRendimiento(rs).map((r) => r.id)).toEqual(["c3"]);
  });

  it("no inventa una referencia con menos de MIN_GRUPO corridas", () => {
    const g = grafoRendimiento();
    g.corridas = g.corridas.slice(0, MIN_GRUPO - 1);
    g.consumos = g.consumos.slice(0, MIN_GRUPO - 1);
    const rs = analizarRendimiento(g);
    expect(rs.every((r) => r.flag === "sin_referencia")).toBe(true);
    expect(rs[0].motivo).toContain("no hay con qué compararla");
    expect(alertasRendimiento(rs)).toHaveLength(0);
  });

  it("EL FALSO POSITIVO A EVITAR: unidades distintas no se comparan entre sí", () => {
    const g = grafoRendimiento();
    // Una corrida en pies tablares rinde ~424 pt/m³: no es un "42.400%".
    g.corridas.push(corrida("cpt", 9, "2026-06-10T00:00:00.000Z", { quantity: 4240, unit: "pt" }));
    g.ingresos.push(ingreso("wpt", "2026-06-01T00:00:00.000Z"));
    g.consumos.push({ from: "wpt", to: "cpt", volumeM3: 10 });
    const r = analizarRendimiento(g).find((x) => x.id === "cpt")!;
    // Cae en su propio grupo (producto|pt), que es chico → sin referencia, NO "imposible".
    expect(r.flag).toBe("sin_referencia");
    expect(r.grupo).toContain("pt");
  });

  it("m³ que salen > m³ que entran es imposible, aunque no haya grupo", () => {
    const g: TrazaGrafo = {
      ingresos: [ingreso("w1", "2026-06-01T00:00:00.000Z", { volumeM3: 10 })],
      corridas: [corrida("c1", 1, "2026-06-10T00:00:00.000Z", { quantity: 14, unit: "m3" })],
      despachos: [], consumos: [{ from: "w1", to: "c1", volumeM3: 10 }], origenes: [],
    };
    const r = analizarRendimiento(g)[0];
    expect(r.flag).toBe("imposible");
    expect(r.motivo).toContain("no puede rendir más");
  });

  it("acepta m³ escrito de varias formas y tolera el redondeo", () => {
    const g: TrazaGrafo = {
      ingresos: [ingreso("w1", "2026-06-01T00:00:00.000Z", { volumeM3: 10 })],
      corridas: [corrida("c1", 1, "2026-06-10T00:00:00.000Z", { quantity: 10, unit: "M³" })],
      despachos: [], consumos: [{ from: "w1", to: "c1", volumeM3: 10 }], origenes: [],
    };
    // Exactamente 1.0 no es imposible (rendimiento perfecto, raro pero no ilegal).
    expect(analizarRendimiento(g)[0].flag).not.toBe("imposible");
  });

  it("corrida sin materia prima: no hay rendimiento que medir", () => {
    const g = grafoRendimiento();
    g.consumos = g.consumos.filter((c) => c.to !== "c0");
    const r = analizarRendimiento(g).find((x) => x.id === "c0")!;
    expect(r.ratio).toBeNull();
    expect(r.flag).toBe("sin_referencia");
    expect(r.entradaM3).toBe(0);
  });

  it("el umbral no se dispara con desvíos chicos", () => {
    const g = grafoRendimiento();
    // Justo por debajo del umbral respecto de la mediana 0.5.
    g.corridas[3].quantity = 10 * 0.5 * (1 - (DESVIO_PCT - 5) / 100);
    expect(analizarRendimiento(g).find((r) => r.id === "c3")!.flag).toBe("normal");
  });

  it("mediana: par, impar y vacío", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("seguimiento de una GTF", () => {
  it("recorre la cadena completa con sus destinos", () => {
    const c = cadenaDeIngreso(grafoSano(), "w1")!;
    expect(c.gtf).toBe("GTF-w1");
    expect(c.consumidoM3).toBe(10);
    expect(c.enPatioM3).toBe(0);
    expect(c.corridas).toHaveLength(1);
    expect(c.corridas[0].despachos[0].destino).toBe("Lima");
    expect(c.destinos).toEqual(["Lima"]);
    expect(c.cerrada).toBe(true);
    expect(c.pendiente).toBeNull();
  });

  it("reporta el aporte real cuando la corrida mezcla varias GTF", () => {
    const g = grafoSano();
    g.ingresos.push(ingreso("w2", "2026-06-02T00:00:00.000Z", { volumeM3: 30 }));
    g.consumos.push({ from: "w2", to: "c1", volumeM3: 30 });
    const c = cadenaDeIngreso(g, "w1")!;
    // 10 de 40 m³ de la corrida vinieron de esta guía: el producto NO es todo suyo.
    expect(c.corridas[0].aporteGtfPct).toBe(25);
  });

  it("dice qué falta para cerrar", () => {
    const sinProducir = cadenaDeIngreso({ ...grafoSano(), consumos: [], origenes: [] }, "w1")!;
    expect(sinProducir.cerrada).toBe(false);
    expect(sinProducir.pendiente).toContain("no entró a ninguna corrida");
    expect(sinProducir.enPatioM3).toBe(10);

    const sinDespachar = cadenaDeIngreso({ ...grafoSano(), origenes: [] }, "w1")!;
    expect(sinDespachar.pendiente).toContain("#1");
    expect(sinDespachar.pendiente).toContain("no tiene despacho");

    const g = grafoSano();
    g.consumos[0].volumeM3 = 6; // quedan 4 m³ en patio
    const parcial = cadenaDeIngreso(g, "w1")!;
    expect(parcial.enPatioM3).toBe(4);
    expect(parcial.pendiente).toContain("4 m³");
  });

  it("resume la cadena en una línea", () => {
    expect(resumenCadena(cadenaDeIngreso(grafoSano(), "w1")!)).toContain("a Lima");
    const enPatio = cadenaDeIngreso({ ...grafoSano(), consumos: [], origenes: [] }, "w1")!;
    expect(resumenCadena(enPatio)).toContain("en patio");
  });

  it("un id inexistente devuelve null, no una cadena vacía", () => {
    expect(cadenaDeIngreso(grafoSano(), "no-existe")).toBeNull();
  });
});
