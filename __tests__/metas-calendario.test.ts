/**
 * Las cuentas de «Calendario» (Metas y logros) que trajo la compactación del
 * 10-10: filas de la grilla, total de cada semana contra la meta semanal, la
 * fila ✓ por día de la semana y cuánto vender por día para llegar al mes.
 */
import { describe, expect, it } from "vitest";
import {
  cumplimientoPorDiaSemana,
  diasDelMes,
  firmeYFlojo,
  paraLlegarAlMes,
  resumirMes,
  semanasDelMes,
  sumarCumplimiento,
  tonoDeSemana,
  totalDeSemana,
} from "@/components/admin/metas/calendario/calendario-calculos";

const t = (total: number) => ({ total, n: Math.max(1, Math.round(total / 10)) });

describe("semanasDelMes", () => {
  it("octubre 2026 arranca jueves: 5 filas, la 1.ª con 3 días de setiembre", () => {
    const s = semanasDelMes("2026-10");
    expect(s).toHaveLength(5);
    expect(s[0]!.fechas[0]).toBe("2026-09-28");
    expect(s[0]!.delMes.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(s[4]!.fechas[6]).toBe("2026-11-01");
    expect(s[4]!.delMes[6]).toBeNull();
  });
});

describe("totalDeSemana", () => {
  const leidos = { "2026-09-28": t(100), "2026-09-30": t(50), "2026-10-01": t(200), "2026-10-04": t(25) };
  const meses = ["2026-10", "2026-09"];

  it("completa la semana del día 1 con el mes anterior", () => {
    const s = semanasDelMes("2026-10")[0]!;
    const tot = totalDeSemana(s.fechas, leidos, meses, "2026-10-10");
    expect(tot.total).toBe(375);
    expect(tot).toMatchObject({ parcial: false, cerrada: true });
  });

  it("la cola de un mes pasado que cae en el mes siguiente queda parcial (no se cuenta como 0)", () => {
    const s = semanasDelMes("2026-10")[4]!; // 26/10 → 01/11
    const tot = totalDeSemana(s.fechas, {}, meses, "2026-11-20");
    expect(tot.parcial).toBe(true);
    expect(tonoDeSemana(tot, s.fechas[0]!, "2026-11-20", 1000)).toBe("nivel0");
  });

  it("tono: cumplió, abierta o no cumplió contra la meta semanal", () => {
    const s = semanasDelMes("2026-10")[0]!;
    const tot = totalDeSemana(s.fechas, leidos, meses, "2026-10-10");
    expect(tonoDeSemana(tot, s.fechas[0]!, "2026-10-10", 300)).toBe("cumplio");
    expect(tonoDeSemana(tot, s.fechas[0]!, "2026-10-10", 400)).toBe("no_cumplio");
    const abierta = totalDeSemana(s.fechas, leidos, meses, "2026-10-02");
    expect(tonoDeSemana(abierta, s.fechas[0]!, "2026-10-02", 400)).toBe("hoy_abierto");
    expect(tonoDeSemana(tot, "2026-10-12", "2026-10-10", 400)).toBe("futuro");
  });
});

describe("cumplimientoPorDiaSemana", () => {
  const dias = { "2026-10-01": t(1300), "2026-10-08": t(900), "2026-10-05": t(1500), "2026-10-10": t(400) };

  it("cuenta los días cerrados por día de la semana; hoy sin cumplir no cuenta", () => {
    const c = cumplimientoPorDiaSemana(diasDelMes("2026-10").dias, dias, "2026-10-10", 1000);
    expect(c[3]).toEqual({ cumplidos: 1, evaluados: 2 }); // jueves 1 y 8
    expect(c[0]).toEqual({ cumplidos: 1, evaluados: 1 }); // lunes 5
    expect(c[5]).toEqual({ cumplidos: 0, evaluados: 1 }); // sábado 3 (el 10 es hoy, abierto)
    expect(sumarCumplimiento(c)).toEqual({ cumplidos: 2, evaluados: 9 });
  });

  it("hoy cuenta en cuanto cumple", () => {
    const c = cumplimientoPorDiaSemana(diasDelMes("2026-10").dias, { ...dias, "2026-10-10": t(1000) }, "2026-10-10", 1000);
    expect(c[5]).toEqual({ cumplidos: 1, evaluados: 2 });
  });

  it("firme y flojo: sólo con 2+ días y si no cumplen parejo", () => {
    const c = [
      { cumplidos: 0, evaluados: 2 },
      { cumplidos: 1, evaluados: 2 },
      { cumplidos: 1, evaluados: 1 },
      { cumplidos: 2, evaluados: 2 },
      { cumplidos: 1, evaluados: 2 },
      { cumplidos: 2, evaluados: 2 },
      { cumplidos: 0, evaluados: 0 },
    ];
    expect(firmeYFlojo(c)).toEqual({ firme: 3, flojo: 0 });
    expect(firmeYFlojo(c.map(() => ({ cumplidos: 1, evaluados: 2 })))).toBeNull();
  });
});

describe("paraLlegarAlMes", () => {
  it("lo que falta repartido en los días que quedan, contando hoy", () => {
    expect(paraLlegarAlMes("2026-10", "2026-10-10", 11460, 34000)).toEqual({
      falta: 22540,
      quedan: 22,
      porDia: 1024.55,
      hasta: "2026-10-31",
    });
  });

  it("null si el mes ya pasó, ya se cumplió o no hay meta", () => {
    expect(paraLlegarAlMes("2026-09", "2026-10-10", 100, 34000)).toBeNull();
    expect(paraLlegarAlMes("2026-10", "2026-10-10", 35000, 34000)).toBeNull();
    expect(paraLlegarAlMes("2026-10", "2026-10-10", 100, null)).toBeNull();
  });
});

describe("resumirMes", () => {
  it("compara con el mes anterior hasta el mismo día", () => {
    const r = resumirMes("2026-10", { "2026-10-02": t(300) }, { "2026-09-02": t(200), "2026-09-20": t(999) }, "2026-10-10");
    expect(r).toMatchObject({ total: 300, ultimoVivido: 10, anteriorAlDia: 200, delta: 50 });
    expect(r.mejorDia).toEqual({ fecha: "2026-10-02", total: 300 });
  });
});
