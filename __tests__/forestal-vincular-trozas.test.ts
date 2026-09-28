/**
 * «Saber de qué trozas salió» — el diagnóstico puro (`lib/forestal/vincular-trozas.ts`).
 *
 * Los casos tienen la FORMA de lo medido en Blas el 2026-09-27 (44 corridas sin
 * origen): la N° 54 de Cachimbo con sus trozas anotadas en la fila de Copal, las
 * del 07/09 con madera recibida el 23/09, el Tornillo de otro permiso, la guía
 * 019-001-0000004 sin recibir, los 5 lotes de inventario del 01/08 y las
 * especies sin ninguna troza (Tacho, Huayruro Negro, Machimango).
 */
import { describe, expect, it } from "vitest";
import {
  MOTIVOS_SIN_ORIGEN,
  corridaParaDiagnostico,
  deUnSoloPermiso,
  diagnosticarSinOrigen,
  mismoPermiso,
  motivoFueraDeLaSierra,
  problemaAlVincular,
  proponerTrozas,
  trozaParaDiagnostico,
  vincularTrozasSchema,
  type CorridaParaDiagnostico,
  type EstadoDeTroza,
  type TrozaParaDiagnostico,
} from "@/lib/forestal/vincular-trozas";

const HUA = { contratoId: "ctr_hua", codigo: "10-HUA-PUE/PER-FMP-2026-007" };
const PLT = { contratoId: null, codigo: "19-SEC/REG-PLT-2021-017" };

let n = 0;
function troza(p: Partial<TrozaParaDiagnostico> & { especie: string; m3: number }): TrozaParaDiagnostico {
  n += 1;
  return {
    id: p.id ?? `t${n}`,
    codigo: p.codigo ?? `A-${n}`,
    gtfNumber: p.gtfNumber ?? "10-0000123",
    fila: p.fila ?? { id: "fila-propia", especie: p.especie, m3: 100, consumidoM3: 0 },
    permiso: p.permiso ?? HUA,
    guiaRecibida: p.guiaRecibida ?? true,
    fechaIngreso: p.fechaIngreso ?? "2026-09-01",
    fuera: p.fuera ?? null,
    lote: p.lote ?? null,
    ...p,
  };
}

function corrida(p: Partial<CorridaParaDiagnostico> & { especie: string; m3Producido: number }): CorridaParaDiagnostico {
  return {
    id: p.id ?? `c-${p.especie}`,
    lineNo: p.lineNo ?? 54,
    fecha: p.fecha ?? "2026-09-21",
    permiso: p.permiso ?? HUA,
    materiaPrimaSinTrozas: p.materiaPrimaSinTrozas ?? null,
    ...p,
  };
}

const filaCopal = { id: "fila-copal", especie: "Copal", m3: 20, consumidoM3: 0 };

describe("el motivo es el arreglo más corto", () => {
  it("N° 54: Cachimbo recibido a tiempo pero anotado en la fila de Copal → fila_de_otra_especie", () => {
    const trozas = [
      ...[1, 2, 3, 4, 5].map(() => troza({ especie: "Cachimbo", m3: 0.3, fechaIngreso: "2026-09-11", fila: filaCopal })),
      ...[1, 2].map(() => troza({ especie: "Cachimbo", m3: 0.3, fechaIngreso: "2026-09-23", fila: filaCopal })),
    ];
    const r = proponerTrozas(corrida({ especie: "Cachimbo", m3Producido: 0.6223 }), trozas);
    expect(r.motivo).toBe("fila_de_otra_especie");
    expect(r.detalle).toBe("Las trozas de Cachimbo están anotadas en la fila de Copal de su guía: acomódalas en Ingresos.");
    expect(r.propuesta).toEqual([]);
  });

  it("las mismas trozas acomodadas en su fila → lista, sin las que llegaron después, hasta lo producido ÷ 56 %", () => {
    const aTiempo = [1, 2, 3, 4, 5].map((k) =>
      troza({ especie: "Cachimbo", m3: 0.3, fechaIngreso: `2026-09-1${k}`, codigo: `C-${k}` }),
    );
    const tarde = troza({ especie: "Cachimbo", m3: 5, fechaIngreso: "2026-09-23" });
    const r = proponerTrozas(corrida({ especie: "Cachimbo", m3Producido: 0.6223 }), [tarde, ...aTiempo]);
    expect(r.motivo).toBe("lista");
    /* 0,6223 ÷ 0,56 = 1,111 m³ → 4 trozas de 0,3 (1,2), en el orden de llegada. */
    expect(r.propuesta.map((t) => t.codigo)).toEqual(["C-1", "C-2", "C-3", "C-4"]);
    expect(r.m3Propuesto).toBeCloseTo(1.2, 4);
    expect(r.propuesta.some((t) => t.trozaId === tarde.id)).toBe(false);
    expect(r.detalle).toMatch(/^Hay 4 trozas de Cachimbo \(1[.,]200 m³\) de este permiso que llegaron a tiempo\.$/);
  });

  it("si la madera no alcanza para el 56 % pero sí para lo producido, se propone toda y se avisa que rinde de más", () => {
    const r = proponerTrozas(corrida({ especie: "Copal", m3Producido: 0.8 }), [
      troza({ especie: "Copal", m3: 0.5 }),
      troza({ especie: "Copal", m3: 0.5 }),
    ]);
    expect(r.motivo).toBe("lista");
    expect(r.propuesta).toHaveLength(2);
    expect(r.detalle).toMatch(/Rinde 80[.,]0 %: más que el 56 % de la plaza\./);
  });

  it("corrida del 07/09 con la madera recibida el 23/09 → llegada_posterior, y cuántas además están en otra fila", () => {
    const r = proponerTrozas(corrida({ especie: "Copal", m3Producido: 0.8153, fecha: "2026-09-07" }), [
      troza({ especie: "Copal", m3: 0.4, fechaIngreso: "2026-09-23" }),
      troza({ especie: "Copal", m3: 0.4, fechaIngreso: "2026-09-23" }),
      troza({ especie: "Copal", m3: 0.4, fechaIngreso: "2026-09-11", fila: { ...filaCopal, especie: "Cumala" } }),
    ]);
    expect(r.motivo).toBe("llegada_posterior");
    expect(r.detalle).toBe(
      "Las trozas de Copal llegaron después de la corrida del 07/09 (la primera, el 11/09): corrige la fecha de llegada en Ingresos. " +
        "Además, 1 de ellas está anotada en la fila de otra especie de su guía.",
    );
  });

  it("con otro año, la fecha lo dice: no se confunde el 03/08 de 2026 con uno de 2025", () => {
    const r = proponerTrozas(corrida({ especie: "Tornillo", m3Producido: 1, fecha: "2025-10-19", permiso: PLT }), [
      troza({ especie: "Tornillo", m3: 3, fechaIngreso: "2026-08-03", permiso: PLT }),
    ]);
    expect(r.motivo).toBe("llegada_posterior");
    expect(r.detalle).toContain("la corrida del 19/10/2025 (la primera, el 03/08/2026)");
  });

  it("guía sin recibir → guia_sin_recibir con su número", () => {
    const r = proponerTrozas(corrida({ especie: "Tornillo", m3Producido: 10.4, permiso: { contratoId: null, codigo: null } }), [
      troza({ especie: "Tornillo", m3: 30, guiaRecibida: false, gtfNumber: "019-001-0000004", permiso: PLT }),
    ]);
    expect(r.motivo).toBe("guia_sin_recibir");
    expect(r.detalle).toBe("La guía 019-001-0000004 todavía no se recibió: recíbela en Ingresos.");
  });

  it("si con corregir la fecha alcanza, no pide recibir otra guía", () => {
    const r = proponerTrozas(corrida({ especie: "Pashaco", m3Producido: 1, fecha: "2026-09-10" }), [
      troza({ especie: "Pashaco", m3: 2, fechaIngreso: "2026-09-23" }),
      troza({ especie: "Pashaco", m3: 9, guiaRecibida: false, gtfNumber: "G-PEND" }),
    ]);
    expect(r.motivo).toBe("llegada_posterior");
  });

  it("Tornillo de otro permiso → sin_trozas_de_la_especie, nombrando el permiso", () => {
    const r = proponerTrozas(
      corrida({ especie: "Tornillo", m3Producido: 3.8, permiso: { contratoId: "ctr_096", codigo: "19-SEC/REG-PLT-2025-096" } }),
      [troza({ especie: "Tornillo", m3: 1, permiso: PLT }), troza({ especie: "Tornillo", m3: 1, permiso: PLT })],
    );
    expect(r.motivo).toBe("sin_trozas_de_la_especie");
    expect(r.detalle).toBe("Las 2 trozas de Tornillo que hay son de otro permiso (19-SEC/REG-PLT-2021-017).");
  });

  it("especie sin ninguna troza en el patio (Tacho) → sin_trozas_de_la_especie", () => {
    const r = proponerTrozas(corrida({ especie: "Tacho", m3Producido: 0.59 }), [troza({ especie: "Copal", m3: 1 })]);
    expect(r).toEqual({
      motivo: "sin_trozas_de_la_especie",
      detalle: "No hay trozas de Tacho en el patio.",
      propuesta: [],
      m3Propuesto: 0,
    });
  });

  it("aunque todo se arregle, si no alcanza para lo producido lo dice con los dos números", () => {
    const r = proponerTrozas(corrida({ especie: "Cumala", m3Producido: 2.2295 }), [troza({ especie: "Cumala", m3: 1 })]);
    expect(r.motivo).toBe("sin_trozas_de_la_especie");
    expect(r.detalle).toMatch(/suman 1[.,]000 m³ y la corrida produjo 2[.,]230 m³: faltan trozas\.$/);
  });

  it("I2 por fila: la guía ya consumida no ofrece su troza", () => {
    const fila = { id: "f-llena", especie: "Shimbillo", m3: 1, consumidoM3: 0.9 };
    const r = proponerTrozas(corrida({ especie: "Shimbillo", m3Producido: 0.2 }), [
      troza({ especie: "Shimbillo", m3: 0.5, fila, gtfNumber: "G-LLENA" }),
    ]);
    expect(r.motivo).toBe("sin_trozas_de_la_especie");
    expect(r.detalle).toBe("La guía G-LLENA ya no tiene volumen libre: revisa sus consumos en Ingresos.");
  });

  it("primero lo apartado en un lote abierto de la especie y el permiso, después lo suelto", () => {
    const suelta = troza({ especie: "Panguana", m3: 1, fechaIngreso: "2026-08-01" });
    const enLote = troza({
      especie: "Panguana",
      m3: 1,
      fechaIngreso: "2026-09-01",
      lote: { id: "l1", code: "LA-2026-007", especie: "Panguana", permiso: HUA.codigo },
    });
    const r = proponerTrozas(corrida({ especie: "Panguana", m3Producido: 0.5 }), [suelta, enLote]);
    expect(r.motivo).toBe("lista");
    expect(r.propuesta[0]!.trozaId).toBe(enLote.id);
  });

  it("una troza en un lote de otro permiso no se propone", () => {
    const r = proponerTrozas(corrida({ especie: "Panguana", m3Producido: 0.5 }), [
      troza({ especie: "Panguana", m3: 1, lote: { id: "l2", code: "LA-9", especie: "Panguana", permiso: PLT.codigo } }),
    ]);
    expect(r.motivo).toBe("sin_trozas_de_la_especie");
  });

  it("la especie se compara con `claveEspecie`: «CACHIMBO» es Cachimbo", () => {
    const r = proponerTrozas(corrida({ especie: "Cachimbo", m3Producido: 0.1 }), [troza({ especie: "CACHIMBO", m3: 1 })]);
    expect(r.motivo).toBe("lista");
  });
});

describe("el diagnóstico de todas", () => {
  it("apertura: los lotes de inventario del 01/08 van por «Declarar apertura», aunque haya trozas", () => {
    const c = corridaParaDiagnostico({
      id: "c15",
      lineNo: 15,
      entryDate: new Date("2026-08-01T00:00:00Z"),
      speciesCommon: "Tornillo",
      quantity: 15.211,
      unit: "m3",
      volumeInputM3: 27.522,
      contratoId: null,
      permisoCodigo: null,
      aperturaDeclarada: false,
      lotes: 1,
      piezas: 0,
    });
    expect(c.materiaPrimaSinTrozas).toContain("lote de inventario");
    const r = diagnosticarSinOrigen([c], [troza({ especie: "Tornillo", m3: 50, permiso: PLT })]);
    expect(r.corridas[0]).toMatchObject({ motivo: "apertura", fecha: "2026-08-01", m3Producido: 15.211, propuesta: [] });
  });

  it("cuenta los seis motivos (en cero si no hay) y pone primero lo que se puede vincular hoy", () => {
    const r = diagnosticarSinOrigen(
      [
        corrida({ id: "a", especie: "Tacho", m3Producido: 0.5, fecha: "2026-09-01" }),
        corrida({ id: "b", especie: "Copal", m3Producido: 0.1, fecha: "2026-09-20" }),
      ],
      [troza({ especie: "Copal", m3: 1 })],
    );
    expect(Object.keys(r.porMotivo).sort()).toEqual([...MOTIVOS_SIN_ORIGEN].sort());
    expect(r.porMotivo).toMatchObject({ lista: 1, sin_trozas_de_la_especie: 1, apertura: 0 });
    expect(r.corridas.map((c) => c.corridaId)).toEqual(["b", "a"]);
    expect(r.total).toBe(2);
  });

  it("pt se pasa a m³ con 424; otra unidad no inventa volumen", () => {
    const base = {
      id: "x",
      lineNo: 1,
      entryDate: "2026-09-01",
      speciesCommon: "Tornillo",
      volumeInputM3: null,
      contratoId: null,
      permisoCodigo: null,
      aperturaDeclarada: false,
      lotes: 0,
      piezas: 0,
    };
    expect(corridaParaDiagnostico({ ...base, quantity: 848, unit: "pt" }).m3Producido).toBe(2);
    expect(corridaParaDiagnostico({ ...base, quantity: 5, unit: "unidad" }).m3Producido).toBe(0);
  });
});

describe("las reglas de una troza", () => {
  const libre: EstadoDeTroza = {
    consumidaViva: false,
    despachadaViva: false,
    guiaAnulada: false,
    noRecepcionada: false,
    descarte: false,
    retrozos: 0,
    m3: 1,
    mixto: null,
    lote: null,
  };

  it("una corrida ANULADA devolvió la madera: su lote consumido no la retiene", () => {
    expect(motivoFueraDeLaSierra({ ...libre, lote: { code: "LA-1", status: "consumido", corridaViva: false } })).toBeNull();
    expect(motivoFueraDeLaSierra({ ...libre, lote: { code: "LA-1", status: "consumido", corridaViva: true } })).toBe(
      "está en el lote LA-1, que ya está consumido",
    );
    expect(motivoFueraDeLaSierra({ ...libre, lote: { code: "LA-2", status: "cerrado", corridaViva: false } })).toBe(
      "está en el lote LA-2, que ya está cerrado",
    );
  });

  it("mixto abierto, madre retrozada y consumida viva quedan fuera con el camino", () => {
    expect(motivoFueraDeLaSierra({ ...libre, mixto: { code: "LM-3" } })).toBe("está en el lote mixto LM-3: repártelo primero");
    expect(motivoFueraDeLaSierra({ ...libre, retrozos: 2 })).toBe("se cortó en pedazos: vincula los pedazos");
    expect(motivoFueraDeLaSierra({ ...libre, consumidaViva: true })).toBe("ya entró a una corrida");
  });

  it("el permiso: manda el contrato; si no, el código normalizado; sin dato no se afirma que difieren", () => {
    expect(mismoPermiso({ contratoId: "a", codigo: "X" }, { contratoId: "b", codigo: "X" })).toBe(false);
    expect(mismoPermiso({ contratoId: null, codigo: " 19-sec/reg-plt-2021-017 " }, PLT)).toBe(true);
    expect(mismoPermiso(HUA, PLT)).toBe(false);
    expect(mismoPermiso(HUA, { contratoId: null, codigo: null })).toBe(true);
  });

  it("del lado que escribe: otro permiso y otra fila se rechazan con el lugar donde se arregla", () => {
    const c = { especie: "Cachimbo", permiso: HUA };
    expect(problemaAlVincular(c, troza({ especie: "Cachimbo", m3: 1 }))).toBeNull();
    expect(problemaAlVincular(c, troza({ especie: "Cachimbo", m3: 1, permiso: PLT }))).toBe(
      "es del permiso 19-SEC/REG-PLT-2021-017 y la corrida es del 10-HUA-PUE/PER-FMP-2026-007",
    );
    expect(problemaAlVincular(c, troza({ especie: "Cachimbo", m3: 1, fila: filaCopal, gtfNumber: "10-77" }))).toBe(
      "está anotada en la fila de Copal de su guía 10-77: acomódala en Ingresos",
    );
    expect(problemaAlVincular(c, troza({ especie: "Copal", m3: 1 }))).toBe("es Copal y la corrida es de Cachimbo");
    expect(problemaAlVincular(c, troza({ especie: "Cachimbo", m3: 1, guiaRecibida: false, gtfNumber: "G-9" }))).toBe(
      "la guía G-9 todavía no se recibió: recíbela en Ingresos",
    );
  });

  it("de la fila leída: la fecha de ingreso sigue la cadena de T3 (troza → guía → asiento)", () => {
    const base = {
      id: "t",
      woodEntryId: "w",
      codificacion: "-",
      codigoPlanta: "3037752",
      especieComun: "Copal",
      volumenM3: 0.4,
      noRecepcionada: false,
      descarte: false,
      retrozos: 0,
      consumidaViva: false,
      despachadaViva: false,
      mixtoAbierto: null,
      lote: null,
      guia: {
        status: "validado",
        anulada: false,
        fechaRecepcion: new Date("2026-09-23T00:00:00Z"),
        entryDate: new Date("2026-09-05T00:00:00Z"),
        gtfNumber: "10-1",
        especie: "Copal",
        m3: 5,
        consumidoM3: 0,
        contratoId: null,
        permisoCodigo: "X",
      },
    };
    expect(trozaParaDiagnostico({ ...base, fechaRecepcion: null }).fechaIngreso).toBe("2026-09-23");
    expect(trozaParaDiagnostico({ ...base, fechaRecepcion: new Date("2026-09-11T12:00:00Z") }).fechaIngreso).toBe("2026-09-11");
    const pendiente = trozaParaDiagnostico({
      ...base,
      fechaRecepcion: null,
      guia: { ...base.guia, status: "pendiente", fechaRecepcion: null },
    });
    expect(pendiente).toMatchObject({ guiaRecibida: false, fechaIngreso: "2026-09-05", codigo: "3037752" });
  });
});

describe("el pedido", () => {
  it("pide la corrida y de 1 a 500 trozas", () => {
    expect(vincularTrozasSchema.safeParse({ corridaId: "c1", trozaIds: ["t1"] }).success).toBe(true);
    expect(vincularTrozasSchema.safeParse({ corridaId: "c1", trozaIds: [] }).success).toBe(false);
    expect(vincularTrozasSchema.safeParse({ corridaId: " ", trozaIds: ["t1"] }).success).toBe(false);
    expect(vincularTrozasSchema.safeParse({ corridaId: "c1", trozaIds: Array.from({ length: 501 }, (_, i) => `t${i}`) }).success).toBe(false);
  });
});

describe("el mes cerrado", () => {
  it("el motivo sigue siendo el de la madera, pero la frase y `mesCerrado` avisan que el libro no se toca", () => {
    const r = diagnosticarSinOrigen(
      [corrida({ id: "jul", especie: "Copal", m3Producido: 0.1, fecha: "2026-07-10", mesCerrado: "julio de 2026" })],
      [troza({ especie: "Copal", m3: 1, fechaIngreso: "2026-07-01" })],
    );
    expect(r.corridas[0]).toMatchObject({ motivo: "lista", mesCerrado: "julio de 2026" });
    expect(r.corridas[0]!.detalle).toMatch(/El mes de julio de 2026 está cerrado: reábrelo para vincular\.$/);
  });

  it("sin cierre, `mesCerrado` es null y la frase no cambia", () => {
    const r = diagnosticarSinOrigen([corrida({ especie: "Copal", m3Producido: 0.1 })], [troza({ especie: "Copal", m3: 1 })]);
    expect(r.corridas[0]!.mesCerrado).toBeNull();
    expect(r.corridas[0]!.detalle).not.toMatch(/cerrado/);
  });

  it("corrida SIN permiso: propone trozas de UN solo permiso (el servidor rechaza mezclas)", () => {
    const SIN = { contratoId: null, codigo: null };
    const r = proponerTrozas(corrida({ especie: "Copal", m3Producido: 3, permiso: SIN }), [
      troza({ especie: "Copal", m3: 2, permiso: HUA }),
      troza({ especie: "Copal", m3: 5, permiso: PLT }),
      troza({ especie: "Copal", m3: 1, permiso: SIN }),
    ]);
    const permisos = new Set(r.propuesta.map((t) => t.trozaId));
    expect(r.propuesta.length).toBeGreaterThan(0);
    /* Ninguna de HUA junto a una de PLT. */
    expect(deUnSoloPermiso([
      { m3: 2, permiso: HUA },
      { m3: 5, permiso: PLT },
      { m3: 1, permiso: SIN },
    ]).map((t) => t.permiso.codigo)).toEqual(["19-SEC/REG-PLT-2021-017", null]);
    expect(permisos.size).toBe(r.propuesta.length);
  });
});
