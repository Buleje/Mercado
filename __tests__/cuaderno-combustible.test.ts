import { describe, expect, it } from "vitest";
import {
  CONFIG_POR_DEFECTO,
  costoDeVale,
  libroAl,
  nivelAlmacen,
  problemaDeHorometro,
  rangoCilindros,
  recorrer,
  rendimientoVales,
  reporteDelMes,
  saldoDiario,
  siguienteCilindro,
  type ConteoCuaderno,
  type DatosCuaderno,
  type IngresoCuaderno,
  type ValeCuaderno,
} from "@/lib/combustible/cuaderno";

/** Cuaderno de combustible (ADR-533): cilindros en fila, saldo, conteos y reporte del mes. */

const ing = (p: Partial<IngresoCuaderno> & Pick<IngresoCuaderno, "id" | "fecha">): IngresoCuaderno => ({
  tipo: "compra", factura: "F001-1", grifo: "Grifo Samaniego", grifoRuc: null, guia: "T001-1",
  cilindros: 4, galones: 220, precioGal: 27.3, monto: 6006, primerCilindro: 1,
  anulado: false, motivoAnulacion: null, notas: null, gastoId: null, ...p,
});
const vale = (p: Partial<ValeCuaderno> & Pick<ValeCuaderno, "id" | "fecha" | "galones">): ValeCuaderno => ({
  numero: null, maquinaId: "cargador", maquina: "Cargador Frontal CAT", placa: "ADF-452", horometro: null,
  operador: "Juan", firmado: true, monto: 0, notas: null, anulado: false, motivoAnulacion: null, ...p,
});
const conteo = (p: Partial<ConteoCuaderno> & Pick<ConteoCuaderno, "id" | "fecha" | "galonesContados" | "cilindrosContados">): ConteoCuaderno => ({
  cilindrosLibro: 0, galonesLibro: 0, contadoPor: "Drucila", testigo: null, notas: null, anulado: false, ...p,
});
const datos = (d: Partial<DatosCuaderno>): DatosCuaderno => ({ ingresos: [], vales: [], conteos: [], ...d });

describe("numeración de cilindros", () => {
  it("rango y siguiente número (los anulados no se reusan)", () => {
    expect(rangoCilindros(5, 4)).toBe("C-05 a C-08");
    expect(rangoCilindros(100, 1)).toBe("C-100");
    expect(siguienteCilindro([])).toBe(1);
    expect(siguienteCilindro([ing({ id: "a", fecha: "2026-11-01T13:00:00Z" }), ing({ id: "b", fecha: "2026-11-15T13:00:00Z", primerCilindro: 5, anulado: true })])).toBe(9);
  });
});

describe("recorrido: primero en entrar, primero en salir", () => {
  const compra = ing({ id: "c1", fecha: "2026-11-02T13:00:00Z" });

  it("un vale saca del cilindro más viejo y sigue con el próximo", () => {
    const r = recorrer(datos({
      ingresos: [compra],
      vales: [vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30 }), vale({ id: "v2", fecha: "2026-11-04T13:00:00Z", galones: 40 })],
    }));
    expect(r.saldoGal).toBe(150);
    expect(r.cilindrosConCombustible).toBe(3);
    const v2 = r.renglones.find((x) => x.tipo === "vale" && x.vale.id === "v2");
    expect(v2?.tipo === "vale" && v2.deCilindros).toEqual(["C-01", "C-02"]);
    expect(r.cilindros.map((c) => c.resto)).toEqual([0, 40, 55, 55]);
    expect(r.cilindros[0].vacioEl).toBe("2026-11-04T13:00:00Z");
  });

  it("el costo del vale sale del precio del cilindro: 30 gal × S/ 27.30 = S/ 819.00", () => {
    expect(costoDeVale(datos({ ingresos: [compra] }), "2026-11-03T13:00:00Z", 30)).toEqual({ costo: 819, deCilindros: ["C-01"], sinRespaldoGal: 0 });
  });

  it("lo que sale sin cilindro queda «sin respaldo» y lo cubre la próxima compra", () => {
    const r = recorrer(datos({
      ingresos: [ing({ id: "c2", fecha: "2026-11-05T13:00:00Z", cilindros: 1, galones: 55, primerCilindro: 1 })],
      vales: [vale({ id: "v1", fecha: "2026-11-04T13:00:00Z", galones: 20 })],
    }));
    const v1 = r.renglones[0];
    expect(v1.tipo === "vale" && v1.sinRespaldoGal).toBe(20);
    expect(v1.saldoGal).toBe(-20);
    expect(r.saldoGal).toBe(35);
    expect(r.cilindros[0].resto).toBe(35);
  });

  it("el conteo manda: faltante sale del más viejo, sobrante vuelve al cilindro abierto", () => {
    const base = { ingresos: [compra], vales: [vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30 })] };
    const falta = recorrer(datos({ ...base, conteos: [conteo({ id: "k1", fecha: "2026-11-07T13:00:00Z", galonesContados: 185, cilindrosContados: 4 })] }));
    const k1 = falta.renglones.at(-1);
    expect(k1?.tipo === "conteo" && [k1.libroGal, k1.difGal, k1.difCil]).toEqual([190, -5, 0]);
    expect(falta.saldoGal).toBe(185);
    expect(falta.cilindros[0].resto).toBe(20);

    const sobra = recorrer(datos({ ...base, conteos: [conteo({ id: "k2", fecha: "2026-11-07T13:00:00Z", galonesContados: 192, cilindrosContados: 4 })] }));
    expect(sobra.saldoGal).toBe(192);
    expect(sobra.cilindros[0].resto).toBe(27);

    // Anulado = como si no se hubiera contado.
    const anulado = recorrer(datos({ ...base, conteos: [conteo({ id: "k3", fecha: "2026-11-07T13:00:00Z", galonesContados: 10, cilindrosContados: 1, anulado: true })] }));
    expect(anulado.saldoGal).toBe(190);
  });

  it("libroAl: lo que decía el cuaderno justo antes de contar", () => {
    const d = datos({ ingresos: [compra], vales: [vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30 })] });
    expect(libroAl(d, "2026-11-03T12:00:00Z")).toEqual({ saldoGal: 220, cilindros: 4 });
    expect(libroAl(d, "2026-11-08T12:00:00Z")).toEqual({ saldoGal: 190, cilindros: 4 });
  });
});

describe("lo guardado contra lo declarado (máx. 4 cilindros = 220 gal)", () => {
  it("niveles", () => {
    expect(nivelAlmacen(150, 3, CONFIG_POR_DEFECTO)).toBe("ok");
    expect(nivelAlmacen(220, 4, CONFIG_POR_DEFECTO)).toBe("tope");
    expect(nivelAlmacen(230, 5, CONFIG_POR_DEFECTO)).toBe("excede");
    expect(nivelAlmacen(264, 5, CONFIG_POR_DEFECTO)).toBe("osinergmin");
    expect(nivelAlmacen(-3, 0, CONFIG_POR_DEFECTO)).toBe("negativo");
  });

  it("saldo diario: un renglón por día y el aviso del día que se pasó", () => {
    const r = recorrer(datos({
      ingresos: [ing({ id: "c1", fecha: "2026-11-02T13:00:00Z" }), ing({ id: "c2", fecha: "2026-11-04T13:00:00Z", cilindros: 2, galones: 110, primerCilindro: 5 })],
      vales: [vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30 })],
    }));
    const dias = saldoDiario(r, CONFIG_POR_DEFECTO, "2026-11-01", "2026-11-05");
    expect(dias.map((x) => [x.dia, x.saldoGal, x.cilindros, x.nivel])).toEqual([
      ["2026-11-01", 0, 0, "ok"],
      ["2026-11-02", 220, 4, "tope"],
      ["2026-11-03", 190, 4, "tope"],
      ["2026-11-04", 300, 6, "osinergmin"],
      ["2026-11-05", 300, 6, "osinergmin"],
    ]);
    expect(dias[4].conMovimiento).toBe(false);
  });
});

describe("horómetro", () => {
  const vales = [
    vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30, horometro: 451 }),
    vale({ id: "v2", fecha: "2026-11-04T13:00:00Z", galones: 28, horometro: 459 }), // 3.5 gal/h
    vale({ id: "v3", fecha: "2026-11-05T13:00:00Z", galones: 36, horometro: 467 }), // 4.5 gal/h > 3.85
  ];
  it("gal/h contra la meta con 10 % de tolerancia", () => {
    const r = rendimientoVales(vales, { cargador: 3.5 });
    expect(r.get("v1")?.galPorHora).toBeNull();
    expect([r.get("v2")?.horas, r.get("v2")?.galPorHora, r.get("v2")?.sobreMeta]).toEqual([8, 3.5, false]);
    expect([r.get("v3")?.galPorHora, r.get("v3")?.sobreMeta]).toEqual([4.5, true]);
  });
  it("no deja anotar un horómetro que retrocede", () => {
    expect(problemaDeHorometro(vales, "cargador", "2026-11-06T13:00:00Z", 460)).toMatch(/menor que el del vale anterior/);
    expect(problemaDeHorometro(vales, "cargador", "2026-11-04T18:00:00Z", 470)).toMatch(/mayor que el del vale siguiente/);
    expect(problemaDeHorometro(vales, "cargador", "2026-11-06T13:00:00Z", 470)).toBeNull();
    expect(problemaDeHorometro(vales, "otra", "2026-11-06T13:00:00Z", 10)).toBeNull();
  });
});

describe("reporte del mes para SUNAT", () => {
  const config = { ...CONFIG_POR_DEFECTO, cupoAnualGal: 5500, proyeccionCilindros: [8, 8, 8, 8, 8, 9, 9, 9, 9, 8, 8, 8] };
  const d = datos({
    ingresos: [
      ing({ id: "ini", fecha: "2026-10-31T13:00:00Z", tipo: "inicial", factura: null, cilindros: 1, galones: 40, precioGal: null, monto: 0, primerCilindro: 1 }),
      ing({ id: "c1", fecha: "2026-11-02T13:00:00Z", primerCilindro: 2 }),
      ing({ id: "x", fecha: "2026-11-03T13:00:00Z", primerCilindro: 6, anulado: true, motivoAnulacion: "factura repetida" }),
    ],
    vales: [
      vale({ id: "v1", fecha: "2026-11-03T13:00:00Z", galones: 30, horometro: 451 }),
      vale({ id: "v2", fecha: "2026-11-10T13:00:00Z", galones: 28, horometro: 459 }),
      vale({ id: "t1", fecha: "2026-11-10T14:00:00Z", galones: 25, maquinaId: "tractor", maquina: "Tractor forestal", placa: null }),
    ],
    conteos: [conteo({ id: "k1", fecha: "2026-11-14T13:00:00Z", galonesContados: 175, cilindrosContados: 4 })],
  });
  const rep = reporteDelMes(d, config, 2026, 11, { cargador: 3.5, tractor: null }, [
    { id: "cargador", nombre: "Cargador Frontal CAT", placa: "ADF-452" },
    { id: "tractor", nombre: "Tractor forestal", placa: null },
  ], "2026-12-01");

  it("el balance cierra: inicial + compras − consumo + diferencias = final", () => {
    expect(rep.saldoInicial).toEqual({ gal: 40, cil: 1 });
    expect(rep.totalCompras).toEqual({ cil: 4, gal: 220, monto: 6006 });
    expect(rep.totalConsumo).toBe(83);
    // 40 + 220 − 83 = 177 en el cuaderno; contaron 175 → −2.
    expect(rep.totalDiferencias).toBe(-2);
    expect(rep.saldoFinal.gal).toBe(175);
    expect(rep.cuadra).toBe(true);
    expect(rep.dias).toHaveLength(30);
    expect(rep.hastaDias).toBe("2026-11-30");
  });

  it("el mes en curso corta el saldo diario en hoy (los días que no pasan no van al papel)", () => {
    const enCurso = reporteDelMes(d, config, 2026, 11, {}, [], "2026-11-04");
    expect(enCurso.dias).toHaveLength(4);
    expect(enCurso.dias.at(-1)?.dia).toBe("2026-11-04");
    expect(enCurso.hastaDias).toBe("2026-11-04");
    expect(enCurso.hasta).toBe("2026-11-30");
    // Un mes que todavía no empieza: sin días y el saldo final es el inicial.
    const futuro = reporteDelMes(d, config, 2026, 12, {}, [], "2026-11-04");
    expect(futuro.dias).toHaveLength(0);
  });

  it("consumo por máquina, anulados aparte y acumulado del año contra el cupo", () => {
    expect(rep.consumo.map((c) => [c.maquina, c.vales, c.galones, c.horas, c.galPorHora])).toEqual([
      ["Cargador Frontal CAT", 2, 58, 8, 3.5],
      ["Tractor forestal", 1, 25, 0, null],
    ]);
    expect(rep.anulados.ingresos.map((i) => i.id)).toEqual(["x"]);
    expect(rep.proyeccionGal).toBe(440);
    expect(rep.acumuladoAnio).toEqual({ comprasGal: 220, consumoGal: 83, cupo: 5500, restante: 5280, pct: 4 });
    expect(rep.alertas.some((a) => a.includes("Diferencias de conteo"))).toBe(true);
  });
});
