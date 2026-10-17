import { describe, expect, it } from "vitest";
import {
  consumosAlConfirmar,
  especiesSinIngreso,
  proponerCompraDeCorrida,
  type CorridaParaCompra,
  type IngresoParaCompra,
} from "@/lib/forestal/corrida-compra";
import { excepcionesDeSaldo } from "@/lib/forestal/ctp-saldos-excepciones";
import {
  FALTA,
  agregarRendimientoPlata,
  entradaDePlata,
  faltaGuiasSinCosto,
  rendimientoEnPlata,
  salidaDePlata,
} from "@/lib/forestal/rendimiento-plata";

const SIN_PERMISO = { contratoId: null, codigo: null };

const corrida = (o: Partial<CorridaParaCompra> = {}): CorridaParaCompra => ({
  id: "c1",
  lineNo: 3,
  fecha: "2026-10-01",
  especie: "Cumala",
  declaradoM3: 6.285,
  status: "registrado",
  aperturaDeclarada: false,
  congelado: false,
  mesCerrado: null,
  permiso: SIN_PERMISO,
  duenoMadera: null,
  ...o,
});

const ingreso = (o: Partial<IngresoParaCompra> & { id: string }): IngresoParaCompra => ({
  gtf: `G-${o.id}`,
  llegada: "2026-09-29",
  especie: "Cumala",
  status: "validado",
  volumenM3: 9.563,
  usadoPorOtrasM3: 0,
  costoUnitario: 300,
  moneda: "PEN",
  deTercero: false,
  duenoNombre: null,
  permiso: SIN_PERMISO,
  ...o,
});

describe("proponerCompraDeCorrida — FIFO de la misma especie", () => {
  it("caso main: corrida de 6,285 m³ del 01/10 ← guía de Cumala del 29/09", () => {
    const p = proponerCompraDeCorrida(corrida(), [ingreso({ id: "w2", gtf: "QA-SEM-002" })], []);
    expect(p.estado).toBe("completa");
    expect(p.filas).toEqual([expect.objectContaining({ woodEntryId: "w2", gtf: "QA-SEM-002", m3: 6.285, libreM3: 9.563 })]);
    expect(p.quedaM3).toBe(0);
    expect(p.firma).toContain("w2:6.2850");
  });

  it("la más vieja primero, y la segunda sólo por lo que falta", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 10 }),
      [
        ingreso({ id: "nueva", llegada: "2026-09-30", volumenM3: 20 }),
        ingreso({ id: "vieja", llegada: "2026-09-01", volumenM3: 4 }),
      ],
      [],
    );
    expect(p.filas.map((f) => [f.woodEntryId, f.m3])).toEqual([
      ["vieja", 4],
      ["nueva", 6],
    ]);
  });

  it("Blas: ninguna guía de la especie → no propone y lo dice", () => {
    const p = proponerCompraDeCorrida(
      corrida({ especie: "Cachimbo", declaradoM3: 28.947, fecha: "2026-08-01" }),
      [ingreso({ id: "y", especie: "Yacuchapana", llegada: "2026-10-03" })],
      [],
    );
    expect(p.estado).toBe("nada");
    expect(p.filas).toEqual([]);
    expect(p.motivo).toMatch(/No hay ningún ingreso de Cachimbo/);
    expect(p.quedaM3).toBe(28.947);
  });

  it("la guía que llegó DESPUÉS de la corrida no entra; la del mismo día sí", () => {
    const despues = proponerCompraDeCorrida(corrida({ fecha: "2026-08-01" }), [ingreso({ id: "a", llegada: "2026-10-03" })], []);
    expect(despues.estado).toBe("nada");
    expect(despues.motivo).toMatch(/llegó después de la corrida \(desde el 03\/10\/2026\)/);
    const mismoDia = proponerCompraDeCorrida(corrida({ fecha: "2026-10-03" }), [ingreso({ id: "a", llegada: "2026-10-03" })], []);
    expect(mismoDia.estado).toBe("completa");
  });

  it("especie por clave: «Azúcar huayo» liga con «Azucar huayo»", () => {
    const p = proponerCompraDeCorrida(corrida({ especie: "Azucar huayo" }), [ingreso({ id: "a", especie: "Azúcar  Huayo" })], []);
    expect(p.estado).toBe("completa");
  });

  it("respeta el saldo que ya usan otras corridas y la que ya usa esta", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 10 }),
      [ingreso({ id: "a", volumenM3: 9, usadoPorOtrasM3: 3 })],
      [{ woodEntryId: "a", volumeM3: 2 }],
    );
    /* Falta 8; libres 9 − 3 − 2 = 4. */
    expect(p.faltaM3).toBe(8);
    expect(p.filas).toEqual([expect.objectContaining({ woodEntryId: "a", m3: 4 })]);
    expect(p.estado).toBe("parcial");
    expect(p.motivo).toMatch(/cubren 4.000 de 8.000 m³/);
    /* Al confirmar, el mismo ingreso se SUMA (el UNIQUE no admite dos filas). */
    expect(consumosAlConfirmar([{ woodEntryId: "a", volumeM3: 2 }], p.filas)).toEqual([{ woodEntryId: "a", volumeM3: 6 }]);
  });

  it("sin saldo, sin validar, otro permiso u otro dueño: no entran y se dice por qué", () => {
    const p = proponerCompraDeCorrida(
      corrida({ permiso: { contratoId: null, codigo: "25-UCA/C-OPP-J-001-24" } }),
      [
        ingreso({ id: "agotada", usadoPorOtrasM3: 9.563 }),
        ingreso({ id: "pendiente", status: "pendiente" }),
        ingreso({ id: "otroPermiso", permiso: { contratoId: null, codigo: "17-PUC/C-OPP-J-002-20" } }),
        ingreso({ id: "tercero", deTercero: true }),
      ],
      [],
    );
    expect(p.estado).toBe("nada");
    expect(p.motivo).toMatch(/ya se consumió/);
    expect(p.motivo).toMatch(/sin validar/);
    expect(p.motivo).toMatch(/otro permiso/);
    expect(p.motivo).toMatch(/otro dueño/);
  });

  it("bloqueada: mes cerrado, congelado, apertura declarada o sin m³ declarados", () => {
    const ing = [ingreso({ id: "a" })];
    expect(proponerCompraDeCorrida(corrida({ mesCerrado: "octubre de 2026" }), ing, []).motivo).toMatch(/octubre de 2026 está cerrado/);
    expect(proponerCompraDeCorrida(corrida({ congelado: true }), ing, []).estado).toBe("bloqueada");
    expect(proponerCompraDeCorrida(corrida({ aperturaDeclarada: true }), ing, []).motivo).toMatch(/existencia de apertura/);
    expect(proponerCompraDeCorrida(corrida({ declaradoM3: null }), ing, []).motivo).toMatch(/Editar atribución/);
  });

  it("lo que llegó de un reproceso ya tiene origen: no se propone de nuevo", () => {
    const p = proponerCompraDeCorrida(corrida({ declaradoM3: 5, desdeReprocesoM3: 5 }), [ingreso({ id: "a" })], []);
    expect(p.estado).toBe("ya_atribuida");
  });

  it("nombra las guías sin costo, propuestas o ya ligadas", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 8 }),
      [ingreso({ id: "a", gtf: "G-A", volumenM3: 3, costoUnitario: null }), ingreso({ id: "b", gtf: "G-B", costoUnitario: null, llegada: "2026-09-30" })],
      [],
    );
    expect(p.guiasSinCosto).toEqual(["G-A", "G-B"]);
  });
});

describe("proponerCompraDeCorrida — dueño de la madera y revisión 08-10", () => {
  it("«propia» con una guía propia → completa (antes: «otro dueño»)", () => {
    const p = proponerCompraDeCorrida(corrida({ duenoMadera: "propia" }), [ingreso({ id: "a" })], []);
    expect(p.estado).toBe("completa");
  });

  it("«tercero» liga sólo con la guía de ESE tercero", () => {
    const deJuan = ingreso({ id: "juan", deTercero: true, duenoNombre: "Juan Pérez" });
    const dePedro = ingreso({ id: "pedro", deTercero: true, duenoNombre: "Pedro Ruiz" });
    const c = corrida({ duenoMadera: "tercero", titularNombre: "juan perez" });
    expect(proponerCompraDeCorrida(c, [deJuan], []).estado).toBe("completa");
    const p = proponerCompraDeCorrida(c, [dePedro], []);
    expect(p.estado).toBe("nada");
    expect(p.motivo).toMatch(/otro dueño/);
    /* Una propia tampoco sirve para madera de un tercero. */
    expect(proponerCompraDeCorrida(c, [ingreso({ id: "propia" })], []).estado).toBe("nada");
  });

  it("«propia» o sin declarar no toma la guía de un tercero", () => {
    const deTercero = [ingreso({ id: "t", deTercero: true, duenoNombre: "Juan" })];
    expect(proponerCompraDeCorrida(corrida({ duenoMadera: "propia" }), deTercero, []).estado).toBe("nada");
    expect(proponerCompraDeCorrida(corrida({ duenoMadera: null }), deTercero, []).estado).toBe("nada");
  });

  it("Blas: sin fila de Pashaco pero con trozas suyas en la fila de Cumala → lo dice, no «no hay ningún ingreso»", () => {
    const p = proponerCompraDeCorrida(
      corrida({ especie: "Pashaco", declaradoM3: 3 }),
      [
        ingreso({ id: "c7", gtf: "010-001-0000007", especie: "Cumala", trozasPorEspecie: { Pashaco: 3 } }),
        ingreso({ id: "h8", gtf: "010-001-0000008", especie: "Huayruro", trozasPorEspecie: { pashaco: 1 } }),
      ],
      [],
    );
    expect(p.estado).toBe("nada");
    expect(p.motivo).not.toMatch(/No hay ningún ingreso/);
    expect(p.motivo).toMatch(/4 trozas de Pashaco/);
    expect(p.motivo).toMatch(/010-001-0000007 \(3 en la fila de Cumala\), 010-001-0000008 \(1 en la fila de Huayruro\)/);
  });

  it("guías en soles y en dólares: avisa que el costo no se podrá sumar", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 10 }),
      [ingreso({ id: "s", volumenM3: 4, llegada: "2026-09-01" }), ingreso({ id: "d", moneda: "USD", volumenM3: 20 })],
      [],
    );
    expect(p.filas).toHaveLength(2);
    expect(p.monedasMezcladas).toBe(true);
    expect(proponerCompraDeCorrida(corrida(), [ingreso({ id: "s" })], []).monedasMezcladas).toBe(false);
  });
});

describe("especiesSinIngreso", () => {
  it("Blas: las 5 especies aserradas sin guía; la troza de Pashaco en guía de Cumala sí cuenta", () => {
    const corridas = [
      { lineNo: 5, especie: "Cachimbo", m3Troza: 28.947, paquetes: 2, aperturaDeclarada: false },
      { lineNo: 3, especie: "Mashonaste", m3Troza: 9.42, paquetes: 2, aperturaDeclarada: false },
      { lineNo: 2, especie: "Panguana", m3Troza: 20.718, paquetes: 1, aperturaDeclarada: false },
      { lineNo: 4, especie: "Copal", m3Troza: 13.537, paquetes: 1, aperturaDeclarada: false },
      { lineNo: 1, especie: "Azucar huayo", m3Troza: 6.049, paquetes: 1, aperturaDeclarada: false },
      { lineNo: 6, especie: "Pashaco", m3Troza: 3, paquetes: 0, aperturaDeclarada: false },
    ];
    const r = especiesSinIngreso(corridas, ["Shimbillo", "Cumala", "Huayruro", "Yacuchapana", "Ana Caspi", "Pashaco"]);
    expect(r.map((e) => e.especie)).toEqual(["Cachimbo", "Panguana", "Copal", "Mashonaste", "Azucar huayo"]);
    expect(r.reduce((a, e) => a + e.m3Troza, 0)).toBeCloseTo(78.671, 3);
  });
});

describe("Saldos › Qué revisar — especies sin ingreso", () => {
  it("un bloque con nombres y m³, y esas especies salen de «en negativo»", () => {
    const out = excepcionesDeSaldo({
      materiaPrima: { pendienteM3: 0 },
      porEspecie: [
        { especie: "Cachimbo", saldoM3: -28.947, ingresoM3: 0, consumidoM3: 28.947 },
        { especie: "Cumala", saldoM3: -1, ingresoM3: 2, consumidoM3: 3 },
      ],
      productos: [],
      especiesSinIngreso: [{ especie: "Cachimbo", corridas: 1, lineNos: [5], m3Troza: 28.947, paquetes: 2, conApertura: 0 }],
    });
    const sin = out.find((e) => e.clave === "especie-sin-ingreso");
    expect(sin?.tono).toBe("error");
    expect(sin?.items).toEqual(["Cachimbo (1 corrida · 28.947 m³)"]);
    expect(sin?.ir).toBe("ingresos");
    expect(out.find((e) => e.clave === "mp-negativa")?.items).toEqual(["Cumala (-1.00 m³)"]);
  });
});

describe("Costo por PT — la guía sin costo se nombra", () => {
  const salida = salidaDePlata({ m3: 3, paquetes: [], costoProceso: 100 });
  const fila = (gtfs: string[]) =>
    rendimientoEnPlata(
      entradaDePlata({ m3: 6, consumos: [], guias: new Map(), costoMadera: null, motivoMadera: "falta_factura", guiasSinCosto: gtfs }),
      salida,
      { parcial: false },
    );

  it("dice cuál guía, no «el costo de la madera»", () => {
    const r = fila(["QA-SEM-002"]);
    expect(r.faltantes).toContain(faltaGuiasSinCosto(["QA-SEM-002"]));
    expect(r.faltantes).not.toContain(FALTA.madera);
    expect(r.costoPorPt).toBeNull();
  });

  it("el agregado junta las guías en un solo faltante", () => {
    const t = agregarRendimientoPlata([fila(["G-1"]), fila(["G-2", "G-1"])]);
    expect(t.faltantes.filter((f) => f.includes("costo cargado"))).toEqual([faltaGuiasSinCosto(["G-1", "G-2"])]);
  });
});

describe("proponerCompraDeCorrida — corrida sin permiso: un solo título (revisión 08-10)", () => {
  const A = { contratoId: null, codigo: "25-UCA/C-OPP-J-001-24" };
  const B = { contratoId: null, codigo: "25-UCA/C-OPP-J-099-24" };

  it("dos guías de distinto título → sólo el de la más vieja; la otra cuenta como «otro permiso»", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 10 }),
      [
        ingreso({ id: "b", gtf: "GTF-B", llegada: "2026-09-20", volumenM3: 6, permiso: B }),
        ingreso({ id: "a", gtf: "GTF-A", llegada: "2026-09-10", volumenM3: 4, permiso: A }),
      ],
      [],
    );
    expect(p.filas.map((f) => f.gtf)).toEqual(["GTF-A"]);
    expect(p.estado).toBe("parcial");
    expect(p.quedaM3).toBe(6);
    expect(p.motivo).toMatch(/Una guía es de otro permiso que 25-UCA\/C-OPP-J-001-24/);
  });

  it("la guía sin permiso declarado acompaña al título elegido", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 10 }),
      [
        ingreso({ id: "a", gtf: "GTF-A", llegada: "2026-09-10", volumenM3: 4, permiso: A }),
        ingreso({ id: "s", gtf: "GTF-S", llegada: "2026-09-15", volumenM3: 6 }),
        ingreso({ id: "b", gtf: "GTF-B", llegada: "2026-09-12", volumenM3: 6, permiso: B }),
      ],
      [],
    );
    expect(p.filas.map((f) => f.gtf)).toEqual(["GTF-A", "GTF-S"]);
    expect(p.estado).toBe("completa");
  });

  it("si ya consume una guía del título B, manda B aunque A sea más vieja", () => {
    const ingresos = [
      ingreso({ id: "a", gtf: "GTF-A", llegada: "2026-09-01", volumenM3: 4, permiso: A }),
      ingreso({ id: "b", gtf: "GTF-B", llegada: "2026-09-20", volumenM3: 9, permiso: B }),
    ];
    const p = proponerCompraDeCorrida(corrida({ declaradoM3: 10 }), ingresos, [{ woodEntryId: "b", volumeM3: 2 }]);
    expect(p.filas.map((f) => [f.gtf, f.m3])).toEqual([["GTF-B", 7]]);
    expect(p.estado).toBe("parcial");
  });

  it("corrida CON permiso: sigue filtrando por su permiso (sin cambio)", () => {
    const p = proponerCompraDeCorrida(
      corrida({ declaradoM3: 4, permiso: B }),
      [ingreso({ id: "a", llegada: "2026-09-01", volumenM3: 4, permiso: A }), ingreso({ id: "b", volumenM3: 4, permiso: B })],
      [],
    );
    expect(p.filas.map((f) => f.woodEntryId)).toEqual(["b"]);
    expect(p.estado).toBe("completa");
  });
});
