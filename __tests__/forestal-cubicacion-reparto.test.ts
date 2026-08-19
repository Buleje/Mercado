import { describe, expect, it } from "vitest";
import {
  APROVECHABLE_DEFAULT,
  aprovechableDe,
  bloquesDesdeTrozas,
  capacidadDe,
  claveEspecie,
  claveOverrideLinea,
  distribuirPorCapacidad,
  distribucionACsv,
  diasDe,
  juzgarRendimiento,
  repartirPorDia,
  type BloqueRolliza,
} from "@/lib/forestal/cubicacion-reparto";
import { PT_POR_M3 as PT_M3_TEST, type PiezaCubicada } from "@/lib/forestal/cubicacion";

/**
 * Un RENGLÓN con el m³ pedido, repartido en piezas de verdad.
 *
 * Mil piezas y no una: el reparto asigna piezas ENTERAS, así que un renglón de
 * «8 m³ en una sola pieza» sería un tablón indivisible de 8 m³ —algo que no
 * existe— y ningún bloque de 5 m³ podría amparar nada de él. Con 1000 piezas
 * cada una mide 0,008 m³ ≈ 3,4 PT, que es una tabla de 1"×4"×10' real.
 */
const PIEZAS_POR_RENGLON = 1000;
function pieza(id: string, especie: string | undefined, m3: number, tipo?: PiezaCubicada["tipo"]): PiezaCubicada {
  return {
    id, cantidad: PIEZAS_POR_RENGLON, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie, tipo, m3, pieTablar: Math.round(m3 * PT_M3_TEST * 100) / 100,
  };
}

const bloque = (
  id: string, especie: string, m3: number,
  extra: Partial<BloqueRolliza> = {},
): BloqueRolliza => ({ id, etiqueta: `GTF-${id}`, especie, m3, origen: "manual", ...extra });

describe("aprovechableDe · el supuesto editable", () => {
  it("sin valor usa el default (centro del rango normal de aserrío)", () => {
    expect(aprovechableDe({ aprovechablePct: undefined })).toBe(APROVECHABLE_DEFAULT);
    expect(aprovechableDe({ aprovechablePct: null })).toBe(APROVECHABLE_DEFAULT);
  });

  it("0 % es legítimo: una troza que no dio nada", () => {
    expect(aprovechableDe({ aprovechablePct: 0 })).toBe(0);
  });

  it("no admite más de 100 %: no sale más aserrada que la troza", () => {
    expect(aprovechableDe({ aprovechablePct: 150 })).toBe(100);
    expect(aprovechableDe({ aprovechablePct: -20 })).toBe(0);
  });
});

describe("capacidadDe · cuánta aserrada ampara un bloque", () => {
  it("20 m³ al 55 % amparan 11 m³", () => {
    expect(capacidadDe(bloque("1", "Tornillo", 20, { aprovechablePct: 55 }))).toBe(11);
  });
  it("40 m³ al 55 % amparan 22 m³", () => {
    expect(capacidadDe(bloque("2", "Cedro", 40, { aprovechablePct: 55 }))).toBe(22);
  });
});

describe("distribuirPorCapacidad · el bloque ampara hasta su capacidad, no más", () => {
  it("un bloque que alcanza justo no deja faltante ni capacidad libre", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { aprovechablePct: 55 })],
      [pieza("a", "Tornillo", 6.2, "Comercial"), pieza("b", "Tornillo", 3.1, "Tabla"), pieza("c", "Tornillo", 1.7, "Corta")],
      "tipo",
    );
    const e = d.especies[0];
    expect(e.capacidadM3).toBe(11);
    expect(e.amparadaM3).toBe(11);
    expect(e.faltanteM3).toBe(0);
    expect(e.libreM3).toBe(0);
    expect(e.faltante).toEqual([]);
  });

  it("lo que no entra en la capacidad queda como FALTANTE, no se reparte igual", () => {
    // Es la diferencia con un prorrateo: 10 m³ al 50 % amparan 5, y los otros 3
    // no tienen respaldo. Declararlos igual es el hueco por donde se blanquea.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const e = d.especies[0];
    expect(e.amparadaM3).toBe(5);
    expect(e.faltanteM3).toBe(3);
    expect(e.faltante).toHaveLength(1);
    expect(e.faltante[0].label).toBe("Comercial");
    expect(e.faltante[0].m3).toBe(3);
  });

  it("el sobrante pasa al SIGUIENTE bloque", () => {
    // «si falta volumen que se distribuya en otro bloque».
    const d = distribuirPorCapacidad(
      [
        bloque("1", "Tornillo", 10, { aprovechablePct: 50 }), // capacidad 5
        bloque("2", "Tornillo", 10, { aprovechablePct: 50 }), // capacidad 5
      ],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    expect(b1.usadoM3).toBe(5);
    expect(b1.libreM3).toBe(0);
    expect(b2.usadoM3).toBe(3);
    expect(b2.libreM3).toBe(2);
    expect(d.especies[0].faltanteM3).toBe(0);
  });

  it("⭐ cada bloque lleva una MEZCLA de los tipos, no un tipo entero por vez", () => {
    // Una troza no da primero toda la comercial y después toda la corta: de
    // cada una salen las dos. Con llenado por cola, el bloque 1 salía íntegro
    // de comercial y el último con la basura — algo que ningún aserradero
    // produce.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 }), bloque("2", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 6, "Comercial"), pieza("b", "Tornillo", 3, "Tabla"), pieza("c", "Tornillo", 1, "Corta")],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    expect(b1.asignado.map((a) => a.label).sort()).toEqual(["Comercial", "Corta", "Tabla"]);
    // La mitad de cada tipo (capacidad 5 sobre 10 m³ pendientes).
    expect(b1.asignado.find((a) => a.label === "Comercial")!.m3).toBeCloseTo(3, 4);
    expect(b1.asignado.find((a) => a.label === "Tabla")!.m3).toBeCloseTo(1.5, 4);
    expect(b1.asignado.find((a) => a.label === "Corta")!.m3).toBeCloseTo(0.5, 4);
    expect(b2.asignado.map((a) => a.label).sort()).toEqual(["Comercial", "Corta", "Tabla"]);
    expect(b2.usadoM3).toBe(5);
  });

  it("cada bloque conserva la MEZCLA del lote, no una tajada arbitraria", () => {
    // Consecuencia del reparto proporcional: los tipos bajan a la misma tasa,
    // así que ningún bloque queda con «lo bueno» y otro con «lo que sobró».
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 8, { aprovechablePct: 50 }), bloque("2", "Tornillo", 12, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 6, "Comercial"), pieza("b", "Tornillo", 3, "Tabla"), pieza("c", "Tornillo", 1, "Corta")],
      "tipo",
    );
    const mezcla = (b: (typeof d.especies)[number]["bloques"][number]) =>
      b.asignado.map((a) => Math.round((a.m3 / b.usadoM3) * 100));
    // 60 / 30 / 10 en los dos, con capacidades distintas (4 y 6 m³).
    expect(mezcla(d.especies[0].bloques[0])).toEqual([60, 30, 10]);
    expect(mezcla(d.especies[0].bloques[1])).toEqual([60, 30, 10]);
  });

  it("un bloque sin pendiente que asignar no lleva ningún tipo", () => {
    // «puede faltar un tipo»: el caso extremo es que falten todos porque el
    // bloque anterior ya se llevó el lote entero.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 50 }), bloque("2", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 6, "Comercial"), pieza("b", "Tornillo", 1, "Corta")],
      "tipo",
    );
    expect(d.especies[0].bloques[1].asignado).toEqual([]);
    expect(d.especies[0].bloques[1].libreM3).toBe(5);
  });

  it("un grupo se PARTE entre dos bloques cuando no entra entero", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 }), bloque("2", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    expect(b1.asignado[0]).toMatchObject({ label: "Comercial", m3: 5 });
    expect(b2.asignado[0]).toMatchObject({ label: "Comercial", m3: 3 });
    // El pie tablar viaja a escala del volumen amparado.
    expect(b1.asignado[0].pieTablar + b2.asignado[0].pieTablar).toBeCloseTo(8 * PT_M3_TEST, 0);
  });

  it("⭐ el reparto baja hasta la MEDIDA: se sabe qué 2×8×10 entró a qué bloque", () => {
    // Es lo que hace posible el papel: «qué medidas se incorporaron en cada bloque».
    const medida = (id: string, m3: number, e: number, a: number, l: number): PiezaCubicada => ({
      id, cantidad: PIEZAS_POR_RENGLON, espesor: e, ancho: a, largo: l,
      uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
      especie: "Tornillo", tipo: "Comercial", m3, pieTablar: Math.round(m3 * PT_M3_TEST * 100) / 100,
    });
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 }), bloque("2", "Tornillo", 10, { aprovechablePct: 50 })],
      [medida("a", 6, 2, 8, 10), medida("b", 2, 3, 10, 12)],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    const m1 = b1.asignado[0].medidas;
    expect(m1.map((m) => m.medida).sort()).toEqual(["2×8×10", "3×10×12"]);
    // 5 m³ repartidos 6:2 → 3.75 y 1.25.
    expect(m1.find((m) => m.medida === "2×8×10")!.m3).toBeCloseTo(3.75, 3);
    expect(m1.find((m) => m.medida === "3×10×12")!.m3).toBeCloseTo(1.25, 3);
    // Lo asignado por medida suma lo asignado del grupo, en los dos bloques.
    for (const b of [b1, b2]) {
      for (const g of b.asignado) {
        expect(g.medidas.reduce((s, m) => s + m.m3, 0)).toBeCloseTo(g.m3, 3);
      }
    }
  });

  it("el faltante también trae sus medidas", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 4, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const f = d.especies[0].faltante[0];
    expect(f.medidas).toHaveLength(1);
    expect(f.medidas[0].medida).toBe("2×8×10");
    expect(f.medidas.reduce((s, m) => s + m.m3, 0)).toBeCloseTo(f.m3, 3);
  });

  it("respeta el ORDEN de los bloques: llena el primero antes de tocar el segundo", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 50 }), bloque("2", "Tornillo", 100, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    expect(b1.usadoM3).toBe(8);
    expect(b2.usadoM3).toBe(0);
    expect(b2.asignado).toEqual([]);
  });

  it("asignado + faltante SUMA exactamente el volumen del grupo", () => {
    // Si no cierra, el faltante miente sobre lo que hay que comprar.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 7, { aprovechablePct: 37 })],
      [pieza("a", "Tornillo", 6.2, "Comercial"), pieza("b", "Tornillo", 3.1, "Tabla"), pieza("c", "Tornillo", 1.7, "Corta")],
      "tipo",
    );
    const e = d.especies[0];
    expect(e.amparadaM3 + e.faltanteM3).toBeCloseTo(e.aserradaM3, 4);
  });

  it("dice cuánta rolliza haría falta para el faltante", () => {
    // 3 m³ sin amparar al 50 % piden 6 m³ de troza.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    expect(d.especies[0].faltante[0].rollizaNecesariaM3).toBe(6);
    expect(d.especies[0].rollizaFaltanteM3).toBe(6);
  });

  it("con 0 % de aprovechamiento no divide por cero", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 0 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    expect(d.especies[0].bloques[0].capacidadM3).toBe(0);
    expect(d.especies[0].faltante[0].rollizaNecesariaM3).toBe(0);
    expect(Number.isFinite(d.especies[0].rollizaFaltanteM3)).toBe(true);
  });

  it("cada especie se distribuye contra SU rolliza", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { aprovechablePct: 55 }), bloque("2", "Cedro", 40, { aprovechablePct: 55 })],
      [
        pieza("t1", "Tornillo", 6.2, "Comercial"), pieza("t2", "Tornillo", 3.1, "Tabla"), pieza("t3", "Tornillo", 1.7, "Corta"),
        pieza("c1", "Cedro", 18, "Comercial"), pieza("c2", "Cedro", 4, "Tabla"),
      ],
      "tipo",
    );
    const tornillo = d.especies.find((e) => e.especie === "Tornillo")!;
    const cedro = d.especies.find((e) => e.especie === "Cedro")!;
    expect(tornillo.amparadaM3).toBe(11);
    expect(tornillo.rendimientoPct).toBe(55);
    expect(cedro.amparadaM3).toBe(22);
    expect(cedro.rendimientoPct).toBe(55);
    expect(d.totales.faltanteM3).toBe(0);
  });
});

describe("distribuirPorCapacidad · lo que no cruza se dice", () => {
  it("rolliza sin aserrada de su especie queda huérfana", () => {
    const d = distribuirPorCapacidad([bloque("1", "Lupuna", 15)], [pieza("a", "Tornillo", 5)], "tipo");
    expect(d.rollizaHuerfana).toEqual([{ especie: "Lupuna", m3: 15 }]);
  });

  it("aserrada sin rolliza queda ENTERA en el faltante", () => {
    // Sin bloques que la amparen, toda esa madera espera la próxima rolliza.
    const d = distribuirPorCapacidad([bloque("1", "Tornillo", 20)], [pieza("a", "Cedro", 5, "Comercial")], "tipo");
    const cedro = d.especies.find((e) => e.especie === "Cedro")!;
    expect(cedro.amparadaM3).toBe(0);
    expect(cedro.faltanteM3).toBe(5);
    expect(cedro.rendimientoPct).toBeNull();
    expect(d.aserradaHuerfana).toEqual([{ especie: "Cedro", m3: 5 }]);
  });

  it("«sin especie» es una categoría real y sólo cruza con «sin especie»", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "", 10, { aprovechablePct: 50 }), bloque("2", "Tornillo", 20, { aprovechablePct: 55 })],
      [pieza("a", undefined, 5), pieza("b", "Tornillo", 11)],
      "tipo",
    );
    expect(d.especies.find((e) => e.especie === "Sin especie")!.amparadaM3).toBe(5);
    expect(d.especies.find((e) => e.especie === "Tornillo")!.amparadaM3).toBe(11);
  });

  it("marca el rendimiento imposible en vez de mostrarlo como normal", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 5, { aprovechablePct: 100 })],
      [pieza("a", "Tornillo", 8)],
      "tipo",
    );
    expect(d.especies[0].rendimientoPct).toBe(160);
    expect(d.especies[0].imposible).toBe(true);
  });

  it("sin bloques y sin piezas no explota", () => {
    const d = distribuirPorCapacidad([], [], "tipo");
    expect(d.especies).toEqual([]);
    expect(d.totales.rendimientoPct).toBeNull();
  });
});

describe("distribuirPorCapacidad · el costo por m³ amparado", () => {
  it("reparte el costo del bloque sobre lo que efectivamente ampara", () => {
    // 10 m³ × S/ 300 = S/ 3000 sobre 5 m³ amparados = S/ 600 por m³ aserrado.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50, costoM3: 300 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    expect(b.costoRolliza).toBe(3000);
    expect(b.costoPorM3Aserrada).toBe(600);
  });

  it("un bloque sin costo deja el total en null, NUNCA en un parcial", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { costoM3: 300 }), bloque("2", "Tornillo", 10, { costoM3: null })],
      [pieza("a", "Tornillo", 10)],
      "tipo",
    );
    expect(d.especies[0].costoRolliza).toBeNull();
    expect(d.totales.costoRolliza).toBeNull();
  });

  it("un bloque sin usar no inventa costo por m³", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 50, costoM3: 300 }), bloque("2", "Tornillo", 10, { aprovechablePct: 50, costoM3: 300 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    expect(d.especies[0].bloques[1].usadoM3).toBe(0);
    expect(d.especies[0].bloques[1].costoPorM3Aserrada).toBeNull();
  });
});

describe("⭐ el reparto va por PIEZAS ENTERAS", () => {
  /**
   * Un renglón con las piezas y el volumen unitario explícitos. Cada uno con SU
   * medida: dos renglones de la misma medida se funden en una sola (son el mismo
   * producto) y el test dejaría de medir lo que dice medir.
   */
  const renglon = (
    id: string, piezas: number, m3Unit: number, tipo: PiezaCubicada["tipo"],
    [espesor, ancho, largo]: [number, number, number],
  ): PiezaCubicada => ({
    id, cantidad: piezas, espesor, ancho, largo,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie: "Tornillo", tipo,
    m3: Math.round(piezas * m3Unit * 10000) / 10000,
    pieTablar: Math.round(piezas * m3Unit * PT_M3_TEST * 100) / 100,
  });
  const lote = [
    renglon("a", 40, 0.0315, "Comercial", [2, 8, 10]),
    renglon("b", 25, 0.0283, "Comercial", [2, 6, 12]),
    renglon("c", 18, 0.0063, "Tabla", [1, 4, 8]),
  ];
  const d = distribuirPorCapacidad(
    [bloque("1", "Tornillo", 2, { aprovechablePct: 55 }), bloque("2", "Tornillo", 1.5, { aprovechablePct: 55 })],
    lote,
    "tipo",
  );
  const e = d.especies[0];
  const asignadas = e.bloques.flatMap((b) => b.asignado.flatMap((g) => g.medidas));
  const faltantes = e.faltante.flatMap((f) => f.medidas);

  it("ninguna medida sale con piezas fraccionarias", () => {
    // «21.16 tablas de 2×8×10» no se puede declarar: una tabla no se parte.
    for (const m of [...asignadas, ...faltantes]) expect(Number.isInteger(m.piezas)).toBe(true);
    for (const g of e.bloques.flatMap((b) => b.asignado)) expect(Number.isInteger(g.piezas)).toBe(true);
  });

  it("las piezas del lote cierran: repartidas + faltante = las que se cubicaron", () => {
    const total = lote.reduce((a, r) => a + r.cantidad, 0);
    const repartidas = asignadas.reduce((a, m) => a + m.piezas, 0);
    const sinRespaldo = faltantes.reduce((a, m) => a + m.piezas, 0);
    expect(repartidas + sinRespaldo).toBe(total);
  });

  it("cada MEDIDA conserva su conteo entre los bloques y el faltante", () => {
    for (const r of lote) {
      const medida = `${r.espesor}×${r.ancho}×${r.largo}`;
      const enBloques = asignadas.filter((m) => m.medida === medida).reduce((a, m) => a + m.piezas, 0);
      const enFaltante = faltantes.filter((m) => m.medida === medida).reduce((a, m) => a + m.piezas, 0);
      expect(enBloques + enFaltante).toBe(r.cantidad);
    }
  });

  it("el m³ y el pie tablar cierran contra el lote, sin arrastre de redondeo", () => {
    expect(e.amparadaM3 + e.faltanteM3).toBeCloseTo(e.aserradaM3, 4);
    const ptFaltante = e.faltante.reduce((a, f) => a + f.pieTablar, 0);
    expect(e.amparadaPt + ptFaltante).toBeCloseTo(e.aserradaPt, 1);
  });

  it("ningún bloque supera su capacidad, y lo que le queda libre es menos que una pieza", () => {
    const menorPieza = Math.min(...lote.map((r) => r.m3 / r.cantidad));
    for (const b of e.bloques) {
      expect(b.usadoM3).toBeLessThanOrEqual(b.capacidadM3 + 1e-9);
      // Se llenó todo lo que podía: si sobrara una pieza entera, faltó llenar.
      expect(b.libreM3).toBeLessThan(menorPieza);
    }
  });

  it("una pieza que no entra en la capacidad NO se ampara a medias", () => {
    // Un tablón indivisible de 8 m³ contra un bloque que ampara 5: no hay
    // respaldo posible. Antes se declaraban 5 m³ de un tablón que nadie partió.
    const soloUna = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 })],
      [{ ...pieza("x", "Tornillo", 8, "Comercial"), cantidad: 1 }],
      "tipo",
    );
    expect(soloUna.especies[0].amparadaM3).toBe(0);
    expect(soloUna.especies[0].faltanteM3).toBe(8);
    expect(soloUna.especies[0].faltante[0].piezas).toBe(1);
  });
});

describe("⭐ las sueltas no desperdician capacidad por el orden de turno", () => {
  /**
   * Reproduce el límite documentado que tenía `llenarBloque`: con MUCHAS
   * medidas chicas de alta prioridad (mayor residuo) compitiendo contra UNA
   * pieza grande de menor prioridad, el orden fijo de antes dejaba a la
   * chica comerse el hueco de a poco, pasada tras pasada, y el bloque
   * terminaba con capacidad SIN USAR pese a que algo pendiente sí calzaba
   * (auditoría 2026-08-17, encontrado con búsqueda numérica, no a mano).
   *
   * Con cap=0.336 el algoritmo de antes amparaba 0.320 m³ (0.016 m³
   * desperdiciados, con Comercial entero en faltante); el de ahora ampara
   * los 0.336 exactos — cero capacidad libre.
   */
  const renglon = (id: string, piezas: number, m3Unit: number, tipo: PiezaCubicada["tipo"], largo = 10): PiezaCubicada => ({
    id, cantidad: piezas, espesor: 2, ancho: 8, largo,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie: "Tornillo", tipo,
    m3: Math.round(piezas * m3Unit * 1e6) / 1e6,
    pieTablar: Math.round(piezas * m3Unit * PT_M3_TEST * 100) / 100,
  });
  // 25 medidas de Tabla, cada una distinta (varía el largo) para que cada una
  // sea su propia `vivas` y aporte su propio residuo — así se arma el hueco
  // grande que antes se comían de a poco.
  const chicos: PiezaCubicada[] = Array.from({ length: 25 }, (_, i) =>
    renglon(`a${i}`, 8 + (i % 5), 0.02 + (i % 7) * 0.004, "Tabla", 10 + i));
  const grande = renglon("b", 1, 0.15, "Comercial");

  it("no deja capacidad sin usar pudiendo caber algo pendiente", () => {
    const d = distribuirPorCapacidad([bloque("1", "Tornillo", 0.336, { aprovechablePct: 100 })], [...chicos, grande], "tipo");
    const b = d.especies[0].bloques[0];
    expect(b.usadoM3).toBeCloseTo(0.336, 6);
    expect(b.libreM3).toBeCloseTo(0, 6);
  });

  it("nunca ampara MENOS que el orden de prioridad puro, en un barrido de capacidades", () => {
    // No exige que Comercial entre siempre —a veces la mezcla óptima es sin
    // ella—, exige que el bloque nunca quede peor que lo que ya lograba el
    // criterio de negocio (mayor residuo primero) en soledad: el nuevo
    // algoritmo agrega candidatos, nunca se queda corto contra el de antes.
    const soloPrioridad = (cap: number) => {
      // Mismo cálculo que el paso (1) de `llenarBloque`, pero completando el
      // hueco YA NO con el algoritmo nuevo sino repitiendo el criterio viejo
      // (mayor residuo, tamaño como desempate) — para tener un piso de
      // comparación sin depender de funciones privadas del módulo.
      const piezas = [...chicos, grande].map((r) => ({ piezas: r.cantidad, m3Unit: r.m3 / r.cantidad }));
      const total = piezas.reduce((a, p) => a + p.piezas * p.m3Unit, 0);
      const ratio = Math.min(1, cap / total);
      const vivas = piezas.map((p) => {
        const exacto = p.piezas * ratio;
        const asignadas = Math.min(p.piezas, Math.floor(exacto + 1e-9));
        return { ...p, asignadas, resto: exacto - asignadas };
      });
      let usado = vivas.reduce((a, v) => a + v.asignadas * v.m3Unit, 0);
      const orden = [...vivas].sort((a, b) => b.resto - a.resto || b.m3Unit - a.m3Unit);
      let cambio = true;
      while (cambio) {
        cambio = false;
        for (const v of orden) {
          if (v.asignadas >= v.piezas) continue;
          if (usado + v.m3Unit > cap + 1e-6) continue;
          v.asignadas += 1; usado += v.m3Unit; cambio = true;
        }
      }
      return usado;
    };
    for (let capX1000 = 300; capX1000 < 500; capX1000 += 3) {
      const cap = capX1000 / 1000;
      const d = distribuirPorCapacidad([bloque("1", "Tornillo", cap, { aprovechablePct: 100 })], [...chicos, grande], "tipo");
      const usadoReal = d.especies[0].bloques[0].usadoM3;
      expect(usadoReal).toBeGreaterThanOrEqual(soloPrioridad(cap) - 1e-6);
    }
  });
});

describe("repartirPorDia · el Libro se registra jornada por jornada", () => {
  const d = distribuirPorCapacidad(
    [bloque("1", "Tornillo", 20, { aprovechablePct: 55, dias: 3 })],
    [pieza("a", "Tornillo", 7, "Comercial"), pieza("b", "Tornillo", 4, "Tabla")],
    "tipo",
  );
  const b = d.especies[0].bloques[0];

  it("saneado de días: sin dato, negativo o basura ⇒ 1", () => {
    expect(diasDe({ dias: undefined })).toBe(1);
    expect(diasDe({ dias: null })).toBe(1);
    expect(diasDe({ dias: 0 })).toBe(1);
    expect(diasDe({ dias: -4 })).toBe(1);
    expect(diasDe({ dias: 5.8 })).toBe(5);
    // Un bloque de más de un año no existe; 10 000 filas de papel sí.
    expect(diasDe({ dias: 5000 })).toBe(366);
  });

  it("devuelve una entrada por día, aunque alguna quede vacía", () => {
    expect(b.dias).toBe(3);
    expect(b.porDia.map((x) => x.dia)).toEqual([1, 2, 3]);
    const pocas = repartirPorDia([{ clave: "c", label: "Corta", m3: 0.03, pieTablar: 12, piezas: 2, medidas: [
      { clave: "k", medida: "1×3×4", espesor: 1, ancho: 3, largo: 4, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", m3: 0.03, pieTablar: 12, piezas: 2 },
    ] }], 4);
    expect(pocas.map((x) => x.piezas)).toEqual([1, 1, 0, 0]);
  });

  it("reparte PIEZAS enteras, sin fracciones de tabla", () => {
    for (const dia of b.porDia) {
      expect(Number.isInteger(dia.piezas)).toBe(true);
      for (const g of dia.grupos) for (const m of g.medidas) expect(Number.isInteger(m.piezas)).toBe(true);
    }
  });

  it("los días SUMAN exactamente lo que ampara el bloque", () => {
    const piezas = b.porDia.reduce((a, x) => a + x.piezas, 0);
    const m3 = b.porDia.reduce((a, x) => a + x.m3, 0);
    const pt = b.porDia.reduce((a, x) => a + x.pieTablar, 0);
    expect(piezas).toBe(b.asignado.reduce((a, g) => a + g.piezas, 0));
    expect(m3).toBeCloseTo(b.usadoM3, 4);
    expect(pt).toBeCloseTo(b.asignado.reduce((a, g) => a + g.pieTablar, 0), 2);
  });

  it("el reparto entre días es parejo: los primeros llevan la pieza suelta", () => {
    // 1000 piezas en 3 días → 334 · 333 · 333.
    const comercial = b.porDia.map((x) => x.grupos.find((g) => g.label === "Comercial")?.piezas ?? 0);
    expect(comercial).toEqual([334, 333, 333]);
    expect(Math.max(...comercial) - Math.min(...comercial)).toBeLessThanOrEqual(1);
  });

  it("sin días declarados, todo cae en una sola jornada", () => {
    const uno = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { aprovechablePct: 55 })],
      [pieza("a", "Tornillo", 7, "Comercial")],
      "tipo",
    );
    const b1 = uno.especies[0].bloques[0];
    expect(b1.dias).toBe(1);
    expect(b1.porDia).toHaveLength(1);
    expect(b1.porDia[0].piezas).toBe(b1.asignado.reduce((a, g) => a + g.piezas, 0));
  });
});

describe("⭐ el bloque dicho A MANO", () => {
  const renglon = (id: string, piezas: number, m3Unit: number, tipo: PiezaCubicada["tipo"]): PiezaCubicada => ({
    id, cantidad: piezas, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Tornillo", tipo,
    m3: Math.round(piezas * m3Unit * 10000) / 10000,
    pieTablar: Math.round(piezas * m3Unit * PT_M3_TEST * 100) / 100,
  });
  const lote = [renglon("a", 100, 0.03, "Comercial"), renglon("b", 50, 0.01, "Tabla")];

  it("«ampara X m³» le gana al porcentaje supuesto", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { aprovechablePct: 55, amparaManualM3: 2 })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    // 20 × 55 % daría 11 m³; lo medido manda: ampara 2.
    expect(b.capacidadM3).toBe(2);
    expect(b.usadoM3).toBeLessThanOrEqual(2);
    expect(d.especies[0].faltanteM3).toBeGreaterThan(0);
  });

  it("el tope de PIEZAS corta aunque sobre capacidad", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 55, piezasManual: 30 })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const piezas = b.asignado.reduce((a, g) => a + g.piezas, 0);
    expect(piezas).toBe(30);
    // Y sigue siendo una MEZCLA: no se llena con un solo tipo.
    expect(b.asignado.length).toBeGreaterThan(1);
    // Lo que no entró queda en el faltante, no desaparece.
    const falta = d.especies[0].faltante.reduce((a, f) => a + f.piezas, 0);
    expect(piezas + falta).toBe(150);
  });

  it("un bloque con tope 0 no carga nada (todavía no dio madera)", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { piezasManual: 0 })],
      lote,
      "tipo",
    );
    expect(d.especies[0].bloques[0].asignado).toEqual([]);
    expect(d.especies[0].faltante.reduce((a, f) => a + f.piezas, 0)).toBe(150);
  });

  it("sin dato manual, sigue mandando el % aprovechable", () => {
    const d = distribuirPorCapacidad([bloque("1", "Tornillo", 20, { aprovechablePct: 50 })], lote, "tipo");
    expect(d.especies[0].bloques[0].capacidadM3).toBe(10);
  });
});

describe("⭐ overridesLinea · editar una línea del resultado ya distribuido", () => {
  const renglon = (id: string, piezas: number, m3Unit: number, tipo: PiezaCubicada["tipo"]): PiezaCubicada => ({
    id, cantidad: piezas, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Tornillo", tipo,
    m3: Math.round(piezas * m3Unit * 10000) / 10000,
    pieTablar: Math.round(piezas * m3Unit * PT_M3_TEST * 100) / 100,
  });
  // 100 piezas de Comercial (3 m³) + 50 de Tabla (0.5 m³): 3.5 m³ pendientes.
  const lote = [renglon("a", 100, 0.03, "Comercial"), renglon("b", 50, 0.01, "Tabla")];

  it("capar las PIEZAS de una línea libera capacidad para el resto del bloque", () => {
    const clave = claveOverrideLinea("tipo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, overridesLinea: { [clave]: { piezas: 40 } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const comercial = b.asignado.find((g) => g.label === "Comercial");
    const tabla = b.asignado.find((g) => g.label === "Tabla");
    expect(comercial?.piezas).toBe(40);
    // Las 60 piezas de Comercial que no entraron por el tope quedan en faltante...
    const faltanteComercial = d.especies[0].faltante.find((f) => f.label === "Comercial");
    expect(faltanteComercial?.piezas).toBe(60);
    // ...y Tabla, que antes competía por la misma capacidad, ahora entra COMPLETA.
    expect(tabla?.piezas).toBe(50);
  });

  it("capar el m³ de una línea también libera capacidad para el resto", () => {
    const clave = claveOverrideLinea("tipo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, overridesLinea: { [clave]: { m3: 1 } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const comercial = b.asignado.find((g) => g.label === "Comercial");
    const tabla = b.asignado.find((g) => g.label === "Tabla");
    // 1 m³ ÷ 0.03 por pieza = 33 piezas enteras (no se parte ninguna).
    expect(comercial?.piezas).toBe(33);
    expect(comercial!.m3).toBeLessThanOrEqual(1);
    expect(tabla?.piezas).toBe(50);
  });

  it("piezas: 0 deja la línea en 0 piezas, VISIBLE (no desaparece del resultado)", () => {
    // Si desapareciera, no habría forma de deshacer el override desde el
    // resultado ya distribuido — quedaría "atrapada" en 0 para siempre.
    const clave = claveOverrideLinea("tipo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, overridesLinea: { [clave]: { piezas: 0 } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const comercial = b.asignado.find((g) => g.label === "Comercial");
    expect(comercial?.piezas).toBe(0);
    expect(comercial?.m3).toBe(0);
    // Las 100 piezas que no entraron por el tope quedan en faltante igual.
    expect(d.especies[0].faltante.find((f) => f.label === "Comercial")?.piezas).toBe(100);
    // Tabla no tiene override: sigue entrando normal.
    expect(b.asignado.find((g) => g.label === "Tabla")?.piezas).toBe(50);
    // Y la línea en 0 también sigue viéndose en el desglose por día —si no,
    // la pantalla (que dibuja `porDia`, no `asignado`) la ocultaría igual.
    const comercialDelDia = b.porDia[0].grupos.find((g) => g.label === "Comercial");
    expect(comercialDelDia?.piezas).toBe(0);
  });

  it("un override armado bajo OTRO `dim` queda inactivo, no se aplica por error", () => {
    // La clave se armó para "largo", pero la distribución corre en "tipo": no debe matchear.
    const clave = claveOverrideLinea("largo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, overridesLinea: { [clave]: { piezas: 40 } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    // Sin override activo, Comercial entra completa (100), como si no hubiera override.
    expect(b.asignado.find((g) => g.label === "Comercial")?.piezas).toBe(100);
  });

  it("una entrada sin piezas ni m³ declarados no cuenta como override", () => {
    const clave = claveOverrideLinea("tipo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, overridesLinea: { [clave]: { piezas: null, m3: null } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    expect(b.asignado.find((g) => g.label === "Comercial")?.piezas).toBe(100);
  });

  it("el tope de piezas del BLOQUE sigue contando lo que ya puso una línea con override", () => {
    const clave = claveOverrideLinea("tipo", "Comercial");
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, piezasManual: 60, overridesLinea: { [clave]: { piezas: 40 } } })],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const total = b.asignado.reduce((a, g) => a + g.piezas, 0);
    // 40 de Comercial (override) + a lo sumo 20 más del resto = 60, el tope del bloque.
    expect(total).toBe(60);
    expect(b.asignado.find((g) => g.label === "Comercial")?.piezas).toBe(40);
  });
});

describe("⭐ largoFiltro · un bloque puede tomar sólo ciertos largos", () => {
  const doce = (id: string, cantidad: number) => ({
    ...pieza(id, "Tornillo", (cantidad * 0.0315), "Comercial"),
    cantidad, largo: 12,
    m3: Math.round(cantidad * 0.0315 * 100) / 100,
  });
  const diez = (id: string, cantidad: number) => ({
    ...pieza(id, "Tornillo", (cantidad * 0.0315), "Comercial"),
    cantidad,
    m3: Math.round(cantidad * 0.0315 * 100) / 100,
  });

  it("con el filtro completo y capacidad de sobra, COMPLEMENTA con otros largos en vez de desperdiciar capacidad", () => {
    // Pedido explícito de Brandon (2026-08-17): «fijo 12 y 11 pies y esos dan
    // 2 m³ pero el bloque tiene para más — que se complemente con lo demás
    // (otros largos/tipos) para aprovechar el volumen». El filtro reserva
    // PRIORIDAD para el largo declarado, no bloquea el resto del bloque.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 100 }] })],
      [doce("d", 40), diez("z", 40)],
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const medidas = b.asignado.flatMap((g) => g.medidas);
    // Los 40 de 12' (el largo filtrado) entran completos, con prioridad.
    expect(medidas.filter((m) => m.largo === 12).reduce((a, m) => a + m.piezas, 0)).toBe(40);
    // Como sobra capacidad, TAMBIÉN entran los de 10' (fuera del filtro) —
    // nada queda sin usar pudiendo caber.
    expect(medidas.filter((m) => m.largo === 10).reduce((a, m) => a + m.piezas, 0)).toBe(40);
    expect(d.especies[0].faltante).toEqual([]);
  });

  it("con `pct` PARCIAL, el complemento NO se come el resto reservado del mismo largo", () => {
    // El sentido de «parcial» es reservar el resto para otro lado. Si el
    // complemento (sin filtro) pudiera tomar el resto del MISMO largo sólo
    // porque no hay nada más que lo compita, el `pct` no serviría de nada —
    // cualquier lote de un solo largo terminaría completándose igual.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 30 }] })],
      [doce("d", 40)],
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    expect(b.asignado.reduce((a, g) => a + g.piezas, 0)).toBe(12); // floor(40 × 0.30), no más
    expect(d.especies[0].faltante.reduce((a, f) => a + f.piezas, 0)).toBe(28); // el resto SIGUE reservado
  });

  it("con `pct` parcial en un largo y OTRO largo sin filtrar, el complemento sí toma el que no tiene reserva", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 30 }] })],
      [doce("d", 40), diez("z", 40)],
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const medidas = b.asignado.flatMap((g) => g.medidas);
    expect(medidas.filter((m) => m.largo === 12).reduce((a, m) => a + m.piezas, 0)).toBe(12); // el 30 % reservado
    expect(medidas.filter((m) => m.largo === 10).reduce((a, m) => a + m.piezas, 0)).toBe(40); // completo, sin reserva
    // Los otros 28 de 12' siguen disponibles — acá caen en faltante.
    const faltante12 = d.especies[0].faltante.flatMap((f) => f.medidas).filter((m) => m.largo === 12);
    expect(faltante12.reduce((a, m) => a + m.piezas, 0)).toBe(28);
  });

  it("dos bloques con el MISMO filtro se reparten ese largo por orden y capacidad", () => {
    // «12 pies, la mitad en un bloque y la mitad en el otro» — sin un % a
    // mano: el primero se llena hasta SU capacidad, lo que sobra pasa al
    // segundo, también filtrado a 12.
    const d = distribuirPorCapacidad(
      [
        bloque("1", "Tornillo", 100, { aprovechablePct: 50, amparaManualM3: 0.63, largoFiltro: [{ largo: 12, pct: 100 }] }),
        bloque("2", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 100 }] }),
      ],
      [doce("d", 40)],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    const piezas1 = b1.asignado.reduce((a, g) => a + g.piezas, 0);
    const piezas2 = b2.asignado.reduce((a, g) => a + g.piezas, 0);
    expect(piezas1).toBe(20); // 0.63 m³ ÷ 0.0315 m³/pieza = 20 piezas exactas
    expect(piezas2).toBe(20); // el resto de las 40
    expect(d.especies[0].faltante).toEqual([]);
  });

  it("sin filtro (como siempre), el bloque toma cualquier largo", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100 })],
      [doce("d", 20), diez("z", 20)],
      "tipo",
    );
    const largos = new Set(d.especies[0].bloques[0].asignado.flatMap((g) => g.medidas).map((m) => m.largo));
    expect(largos).toEqual(new Set([12, 10]));
  });

  it("con pct parcial, el bloque sólo toma esa proporción del pendiente — el resto sigue disponible", () => {
    // 40 piezas de 12', pct 30 → tope 12 piezas para ESTE bloque (no 40),
    // aunque le sobre capacidad de sobra para llevarse todas.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 30 }] })],
      [doce("d", 40)],
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const piezas = b.asignado.reduce((a, g) => a + g.piezas, 0);
    expect(piezas).toBe(12); // floor(40 × 0.30)
    // Las otras 28 NO están perdidas: siguen pendientes (acá, sin otro
    // bloque que las tome, caen en faltante).
    const faltante = d.especies[0].faltante.reduce((a, f) => a + f.piezas, 0);
    expect(faltante).toBe(28);
  });

  it("dos bloques con el MISMO largo y pct distinto reparten por PORCENTAJE, no por capacidad", () => {
    // El primero se queda con el 25 % de lo pendiente (10 de 40); al
    // segundo, sin filtro, le entra el resto entero — el pct manda sobre lo
    // que ve el primero, la capacidad decide cuánto usa cada uno.
    const d = distribuirPorCapacidad(
      [
        bloque("1", "Tornillo", 100, { aprovechablePct: 100, largoFiltro: [{ largo: 12, pct: 25 }] }),
        bloque("2", "Tornillo", 100, { aprovechablePct: 100 }),
      ],
      [doce("d", 40)],
      "tipo",
    );
    const [b1, b2] = d.especies[0].bloques;
    expect(b1.asignado.reduce((a, g) => a + g.piezas, 0)).toBe(10); // 40 × 0.25
    expect(b2.asignado.reduce((a, g) => a + g.piezas, 0)).toBe(30); // el resto
    expect(d.especies[0].faltante).toEqual([]);
  });
});

describe("bloquesDesdeTrozas", () => {
  it("agrupa por especie y deja el conteo en la etiqueta", () => {
    const b = bloquesDesdeTrozas([
      { especie: "Tornillo", m3: 1.2 },
      { especie: "Tornillo", m3: 0.8 },
      { especie: "Cedro", m3: 3 },
    ]);
    expect(b).toHaveLength(2);
    const t = b.find((x) => x.especie === "Tornillo")!;
    expect(t.m3).toBe(2);
    expect(t.etiqueta).toContain("2 trozas");
  });

  it("las trozas sin especie no se mezclan con las que sí la tienen", () => {
    const b = bloquesDesdeTrozas([{ m3: 5 }, { especie: "Cedro", m3: 3 }]);
    expect(b.find((x) => x.especie === "")?.m3).toBe(5);
  });

  it("una sola troza va en singular", () => {
    expect(bloquesDesdeTrozas([{ especie: "Cedro", m3: 3 }])[0].etiqueta).toContain("1 troza");
  });
});

describe("claveEspecie", () => {
  it("agrupa las variantes que un formulario deja escribir distinto", () => {
    expect(claveEspecie("Tornillo")).toBe(claveEspecie(" TORNILLO "));
  });
});

describe("juzgarRendimiento", () => {
  it("40–65 % es lo normal del aserrío", () => {
    expect(juzgarRendimiento(55).tono).toBe("success");
  });
  it("más de 100 % es imposible, no «muy bueno»", () => {
    expect(juzgarRendimiento(160).label).toContain("imposible");
  });
  it("sin rolliza no se juzga nada", () => {
    expect(juzgarRendimiento(null).tono).toBe("neutral");
  });
});

describe("distribucionACsv", () => {
  const d = distribuirPorCapacidad(
    [bloque("1", "Tornillo", 10, { aprovechablePct: 50 })],
    [pieza("a", "Tornillo", 8, "Comercial")],
    "tipo",
  );
  const csv = distribucionACsv(d, "Por tipo");

  it("explica en el archivo cómo se distribuyó", () => {
    // El CSV viaja solo: sin la nota se lee como un prorrateo.
    expect(csv).toContain("ampara hasta su capacidad");
  });

  it("lleva la tabla de faltante", () => {
    expect(csv).toContain("FALTANTE POR DISTRIBUIR");
    expect(csv).toContain("FALTA POR DISTRIBUIR");
  });

  it("usa `;` y coma decimal como el resto del libro", () => {
    expect(csv).toContain("Especie;Bloque;");
    expect(csv).toContain("3,0000"); // los 3 m³ sin amparar
  });

  it("informa la capacidad libre", () => {
    expect(csv).toContain("CAPACIDAD LIBRE");
  });
});

describe("amparadaPt · el pie tablar del respaldo, no el del lote", () => {
  it("suma sólo lo asignado, no todo lo producido", () => {
    // En una fila que dice «TOTAL AMPARADO 5 m³», poner el pie tablar de los 8
    // producidos es declarar de más justo en el renglón del respaldo.
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 10, { aprovechablePct: 50 })],
      [pieza("a", "Tornillo", 8, "Comercial")],
      "tipo",
    );
    const e = d.especies[0];
    expect(e.aserradaM3).toBe(8);
    expect(e.amparadaM3).toBe(5);
    // El PT amparado es 5/8 del producido.
    expect(e.amparadaPt).toBeCloseTo(e.aserradaPt * (5 / 8), 1);
    expect(e.amparadaPt).toBeLessThan(e.aserradaPt);
    expect(d.totales.amparadaPt).toBe(e.amparadaPt);
  });

  it("con todo amparado, coincide con el producido", () => {
    const d = distribuirPorCapacidad(
      [bloque("1", "Tornillo", 20, { aprovechablePct: 55 })],
      [pieza("a", "Tornillo", 11, "Comercial")],
      "tipo",
    );
    expect(d.totales.amparadaPt).toBeCloseTo(d.totales.aserradaPt, 1);
  });
});
