import { describe, expect, it } from "vitest";
import {
  bucketsAntiguedad,
  composicionSaldo,
  diasTranscurridos,
  kpisDePlanta,
  pasosDeBalance,
  rankingEspecies,
  type EspecieSaldo,
  type MateriaPrimaTotales,
} from "@/lib/forestal/ctp-saldos-analisis";

const mp = (over: Partial<MateriaPrimaTotales> = {}): MateriaPrimaTotales => ({
  ingresoM3: 100,
  consumidoM3: 40,
  saldoM3: 60,
  pendienteM3: 0,
  ...over,
});

const esp = (nombre: string, saldo: number, over: Partial<EspecieSaldo> = {}): EspecieSaldo => ({
  especie: nombre,
  cites: false,
  ingresoM3: saldo,
  consumidoM3: 0,
  saldoM3: saldo,
  pendienteM3: 0,
  ...over,
});

// 2026-07-02T12:00 local: un "mes actual" recién empezado, que es donde el
// cálculo de cobertura se rompía.
const AHORA = new Date("2026-07-02T12:00:00.000Z").getTime();
const JULIO = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T23:59:59.999Z", ahora: AHORA };

describe("diasTranscurridos — el ritmo se mide sobre lo que YA pasó", () => {
  it("corta en «ahora», no al fin del período", () => {
    // Julio tiene 31 días; el 2 de julio sólo transcurrieron 2.
    expect(diasTranscurridos(JULIO)).toBe(2);
  });

  it("un período terminado se mide entero", () => {
    expect(
      diasTranscurridos({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.999Z", ahora: AHORA }),
    ).toBe(30);
  });

  it("un solo día es 1, no 0", () => {
    expect(
      diasTranscurridos({ from: "2026-07-02T00:00:00.000Z", to: "2026-07-02T23:59:59.999Z", ahora: AHORA }),
    ).toBe(1);
  });

  it("sin fecha de inicio no hay ventana que medir", () => {
    expect(diasTranscurridos({ from: null, to: null, ahora: AHORA })).toBeNull();
  });

  it("un período futuro no inventa días", () => {
    expect(
      diasTranscurridos({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z", ahora: AHORA }),
    ).toBeNull();
  });
});

describe("kpisDePlanta", () => {
  it("la cobertura usa los días transcurridos, no los del calendario", () => {
    // 40 m³ en 2 días = 20 m³/día; 60 m³ de saldo = 3 días.
    const k = kpisDePlanta(mp(), [], [], JULIO);
    expect(k.consumoDiario).toBe(20);
    expect(k.diasMedidos).toBe(2);
    expect(k.coberturaDias).toBe(3);
  });

  it("sin consumo no hay ritmo: cobertura «sin dato», nunca 0 días", () => {
    const k = kpisDePlanta(mp({ consumidoM3: 0, saldoM3: 100 }), [], [], JULIO);
    expect(k.consumoDiario).toBeNull();
    expect(k.coberturaDias).toBeNull();
  });

  it("rotación = lo transformado sobre lo que entró", () => {
    expect(kpisDePlanta(mp(), [], [], JULIO).rotacionPct).toBe(40);
    expect(kpisDePlanta(mp({ ingresoM3: 0 }), [], [], JULIO).rotacionPct).toBeNull();
  });

  it("la concentración ignora los saldos negativos: no ocupan patio", () => {
    const k = kpisDePlanta(
      mp(),
      [esp("Tornillo", 30), esp("Capirona", 10), esp("Shihuahuaco", -5)],
      [],
      JULIO,
    );
    // 30 de 40 positivos = 75 %. Con el −5 en el denominador daría 85.71.
    expect(k.concentracion).toEqual({ especie: "Tornillo", pct: 75 });
  });

  it("sin saldo positivo no hay especie dominante", () => {
    expect(kpisDePlanta(mp(), [esp("Shihuahuaco", -5)], [], JULIO).concentracion).toBeNull();
  });

  it("«sin validar» se mide sobre el volumen FÍSICO en patio", () => {
    // 20 pendientes sobre 80 validados + 20 = 20 %.
    const k = kpisDePlanta(mp({ ingresoM3: 80, pendienteM3: 20 }), [], [], JULIO);
    expect(k.sinValidarPct).toBe(20);
  });

  it("cuenta las líneas de producto con stock, sin sumar unidades distintas", () => {
    const k = kpisDePlanta(mp(), [], [
      { producto: "Tablas · Tornillo", producido: 100, despachado: 40, stock: 60 },
      { producto: "Listones · Capirona", producido: 50, despachado: 50, stock: 0 },
    ], JULIO);
    expect(k.productosConStock).toEqual({ con: 1, total: 2 });
  });
});

describe("pasosDeBalance — la cascada del saldo", () => {
  it("con apertura arranca en el heredado del cierre anterior", () => {
    const pasos = pasosDeBalance(mp(), 25);
    expect(pasos.map((p) => [p.label, p.value, p.type])).toEqual([
      ["Apertura", 25, "baseline"],
      ["Ingresos", 100, "positive"],
      ["Consumo", -40, "negative"],
      ["Existencia", 85, "total"],
    ]);
  });

  it("sin conciliación no inventa una apertura en cero", () => {
    const pasos = pasosDeBalance(mp(), null);
    expect(pasos.map((p) => p.label)).toEqual(["Ingresos", "Consumo", "Existencia"]);
    expect(pasos[0].type).toBe("baseline");
    expect(pasos.at(-1)?.value).toBe(60);
  });
});

describe("rankingEspecies", () => {
  it("ordena por lo que queda, con los negativos al final pero visibles", () => {
    const filas = rankingEspecies([esp("Capirona", 10), esp("Shihuahuaco", -5), esp("Tornillo", 30)]);
    expect(filas.map((f) => f.especie)).toEqual(["Tornillo", "Capirona", "Shihuahuaco"]);
  });

  it("el porcentaje de un saldo negativo es 0, no un negativo", () => {
    const filas = rankingEspecies([esp("Tornillo", 30), esp("Shihuahuaco", -5)]);
    expect(filas.find((f) => f.especie === "Shihuahuaco")?.pct).toBe(0);
    expect(filas.find((f) => f.especie === "Tornillo")?.pct).toBe(100);
  });
});

describe("composicionSaldo", () => {
  it("hasta el máximo muestra cada especie", () => {
    const d = composicionSaldo([esp("A", 3), esp("B", 1)], 6);
    expect(d).toEqual([
      { name: "A", value: 3, especies: 1 },
      { name: "B", value: 1, especies: 1 },
    ]);
  });

  it("la cola se agrupa en «Otras» diciendo cuántas son", () => {
    const muchas = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n, i) => esp(n, 10 - i));
    const d = composicionSaldo(muchas, 4);
    expect(d).toHaveLength(4);
    expect(d.at(-1)).toEqual({ name: "Otras", value: 7 + 6 + 5 + 4 + 3, especies: 5 });
  });

  it("las especies sin saldo no ocupan una rebanada", () => {
    expect(composicionSaldo([esp("A", 3), esp("B", 0), esp("C", -2)])).toHaveLength(1);
  });
});

describe("bucketsAntiguedad", () => {
  const guias = [
    { dias: 5, disponible: 10, costoUnitario: 100 },
    { dias: 45, disponible: 4, costoUnitario: 200 },
    { dias: 45, disponible: 6, costoUnitario: null },
    { dias: 90, disponible: 2, costoUnitario: null },
  ];

  it("reparte por tramo sin perder volumen", () => {
    const b = bucketsAntiguedad(guias);
    expect(b.map((x) => [x.clave, x.m3, x.guias])).toEqual([
      ["fresca", 10, 1],
      ["atencion", 10, 2],
      ["riesgo", 2, 1],
    ]);
  });

  it("un tramo sin ninguna factura vale «no sé», no S/ 0", () => {
    expect(bucketsAntiguedad(guias).find((b) => b.clave === "riesgo")?.valor).toBeNull();
  });

  it("marca parcial el tramo donde sólo algunas tienen costo", () => {
    const atencion = bucketsAntiguedad(guias).find((b) => b.clave === "atencion");
    expect(atencion?.valor).toBe(800); // 4 × 200; los 6 m³ sin costo no se rellenan
    expect(atencion?.valorParcial).toBe(true);
  });

  it("el borde exacto del tramo cae en el tramo de abajo", () => {
    const b = bucketsAntiguedad([{ dias: 30, disponible: 1, costoUnitario: null }]);
    expect(b[0].guias).toBe(1);
    expect(b[1].guias).toBe(0);
  });
});
