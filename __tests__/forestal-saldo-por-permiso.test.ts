import { describe, expect, it } from "vitest";
import {
  SIN_ESPECIE,
  SIN_PERMISO,
  agregarRolliza,
  saldoPorPermiso,
  simularCorrida,
  type CorridaSinOrigen,
  type RollizaDePermiso,
} from "@/lib/forestal/saldo-por-permiso";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible => ({
  woodEntryId: "w1",
  codificacion: null,
  especieComun: "Tornillo",
  volumenM3: 1,
  permiso: "CON-25-001",
  ...p,
});

const corrida = (p: Partial<CorridaSinOrigen> & { id: string }): CorridaSinOrigen => ({
  lineNo: 1,
  fecha: "2026-09-10",
  especie: "Tornillo",
  permiso: "CON-25-001",
  cantidad: 1,
  unidad: "m3",
  referencia: null,
  ...p,
});

describe("agregarRolliza — el patio por permiso y especie", () => {
  it("separa lo disponible de lo ingresado: una troza consumida entró pero ya no está", () => {
    const r = agregarRolliza([
      troza({ id: "a", volumenM3: 3 }),
      troza({ id: "b", volumenM3: 2, consumidaEnId: "corrida-1" }),
    ]);
    expect(r).toHaveLength(1);
    const t = r[0].especies[0];
    expect(t.m3Ingresado).toBe(5);
    expect(t.piezasIngresadas).toBe(2);
    expect(t.m3Disponible).toBe(3);
    expect(t.piezasDisponibles).toBe(1);
  });

  it("«TORNILLO» y «Tornillo» son la misma madera", () => {
    const r = agregarRolliza([
      troza({ id: "a", especieComun: "TORNILLO", volumenM3: 2 }),
      troza({ id: "b", especieComun: "Tornillo", volumenM3: 1 }),
    ]);
    expect(r[0].especies).toHaveLength(1);
    expect(r[0].especies[0].m3Ingresado).toBe(3);
  });

  it("las trozas sin permiso se agrupan y se nombran, no se descartan", () => {
    const r = agregarRolliza([troza({ id: "a", permiso: null, volumenM3: 4 })]);
    expect(r[0].permiso).toBeNull();
    expect(saldoPorPermiso(r, [])[0].etiqueta).toBe(SIN_PERMISO);
  });
});

describe("saldoPorPermiso — el techo del 56 % y lo que queda", () => {
  const rolliza: RollizaDePermiso[] = [
    {
      permiso: "CON-25-001",
      especies: [
        {
          especie: "Tornillo",
          clave: "tornillo",
          piezasDisponibles: 10,
          m3Disponible: 100,
          piezasIngresadas: 12,
          m3Ingresado: 120,
        },
      ],
    },
  ];

  it("de 100 m³ de rolliza salen 56 m³ de tabla como MÁXIMO, o 23.744 pies", () => {
    const [s] = saldoPorPermiso(rolliza, []);
    expect(s.especies[0].aserrableM3).toBe(56);
    // 100 × 0.56 × 424
    expect(s.especies[0].aserrablePt).toBe(23744);
    expect(s.especies[0].sobranteM3).toBe(56);
  });

  it("resta lo declarado sin lote y dice cuánta rolliza se llevó", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", cantidad: 5.6 })]);
    const f = s.especies[0];
    expect(f.producidoM3).toBe(5.6);
    expect(f.sobranteM3).toBe(50.4);
    // 5.6 ÷ 0.56 = 10 m³ de troza comprometidos; quedan 90 de los 100.
    expect(f.rollizaEquivalenteM3).toBe(10);
    expect(f.rollizaSobranteM3).toBe(90);
    expect(f.corridas).toBe(1);
  });

  it("las tres cifras de pies cierran a la vista: sobrante = aserrable − producido", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", cantidad: 3.333 })]);
    const f = s.especies[0];
    expect(f.sobrantePt).toBe(f.aserrablePt - f.producidoPt);
  });

  it("la base decide qué rolliza se mira: en patio o todo lo que entró", () => {
    const [patio] = saldoPorPermiso(rolliza, [], { base: "patio" });
    const [todo] = saldoPorPermiso(rolliza, [], { base: "ingresado" });
    expect(patio.especies[0].rollizaM3).toBe(100);
    expect(todo.especies[0].rollizaM3).toBe(120);
    expect(todo.especies[0].aserrableM3).toBe(67.2);
  });

  it("una corrida sin lote de una especie que el permiso no tiene aparece EN ROJO, no escondida", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", especie: "Cedro", cantidad: 2 })]);
    const cedro = s.especies.find((e) => e.clave === "cedro");
    expect(cedro).toBeDefined();
    expect(cedro!.rollizaM3).toBe(0);
    expect(cedro!.sobranteM3).toBe(-2);
    expect(s.hayExceso).toBe(true);
  });

  it("una milésima de m³ es redondeo de cubicación, no sobreproducción", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", cantidad: 56.001 })]);
    expect(s.especies[0].sobranteM3).toBe(-0.001);
    expect(s.hayExceso).toBe(false);
  });

  it("lo que no se declara en m³ no se convierte: se lista aparte", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", cantidad: 800, unidad: "pt" })]);
    expect(s.especies[0].producidoM3).toBe(0);
    expect(s.sinUnidadM3).toHaveLength(1);
    expect(s.corridas).toHaveLength(1);
  });

  it("una corrida sin especie declara su categoría, no desaparece", () => {
    const [s] = saldoPorPermiso(rolliza, [corrida({ id: "c1", especie: null, cantidad: 1 })]);
    expect(s.especies.some((e) => e.especie === SIN_ESPECIE)).toBe(true);
  });

  it("los totales suman las filas que se ven", () => {
    const [s] = saldoPorPermiso(rolliza, [
      corrida({ id: "c1", cantidad: 2 }),
      corrida({ id: "c2", especie: "Cedro", cantidad: 1 }),
    ]);
    expect(s.totales.producidoM3).toBe(3);
    expect(s.totales.aserrableM3).toBe(56);
    expect(s.totales.sobranteM3).toBe(53);
  });
});

describe("simularCorrida — el antes y el después de lo que se está por registrar", () => {
  const rolliza: RollizaDePermiso[] = [
    {
      permiso: "CON-25-001",
      especies: [
        { especie: "Tornillo", clave: "tornillo", piezasDisponibles: 5, m3Disponible: 20, piezasIngresadas: 5, m3Ingresado: 20 },
      ],
    },
  ];

  it("el borrador entra como una corrida más: no hay una segunda aritmética", () => {
    const { antes, despues } = simularCorrida(
      rolliza,
      [],
      corrida({ id: "borrador", cantidad: 4 }),
    );
    expect(antes!.especies[0].sobranteM3).toBe(11.2);
    expect(despues!.especies[0].sobranteM3).toBe(7.2);
  });

  it("simular sobre un permiso sin rolliza devuelve el grupo igual — con el rojo a la vista", () => {
    const { despues } = simularCorrida(rolliza, [], corrida({ id: "b", permiso: "PER-9", cantidad: 1 }));
    expect(despues).not.toBeNull();
    expect(despues!.hayExceso).toBe(true);
  });
});

describe("paquetesDeLoCubicado — el código del paquete es único en toda la planta", () => {
  const pieza = (id: string, espesor: number, ancho: number, largo: number) => ({
    id, cantidad: 10, espesor, ancho, largo,
    uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const,
    especie: "Tornillo", pieTablar: 100, m3: 0.236,
  });

  it("sigue la serie de la planta en vez de empezar de SL-1 cada vez", async () => {
    const { paquetesDeLoCubicado } = await import("@/components/admin/forestal/CtpProducirSinLoteModal");
    const r = paquetesDeLoCubicado([pieza("a", 2, 8, 10), pieza("b", 1, 6, 8)], {
      codigosEnPlanta: ["PQ-2609-004", "PQ-2609-003"],
      hoy: new Date("2026-09-10T12:00:00Z"),
    });
    expect(r.map((p) => p.codigo)).toEqual(["PQ-2609-005", "PQ-2609-006"]);
    /* Timeout explícito: importa un componente pesado y con la suite entera
       en paralelo los 5 s por defecto no alcanzan — falló dos veces el
       2026-09-11 sin que nada del código cambiara. */
  }, 20_000);

  it("dos medidas de la misma tanda nunca piden el mismo código", async () => {
    const { paquetesDeLoCubicado } = await import("@/components/admin/forestal/CtpProducirSinLoteModal");
    const r = paquetesDeLoCubicado([pieza("a", 2, 8, 10), pieza("b", 1, 6, 8), pieza("c", 3, 9, 12)], {
      hoy: new Date("2026-09-10T12:00:00Z"),
    });
    expect(new Set(r.map((p) => p.codigo)).size).toBe(3);
    /* Timeout explícito: importa un componente pesado y con la suite entera
       en paralelo los 5 s por defecto no alcanzan — falló dos veces el
       2026-09-11 sin que nada del código cambiara. */
  }, 20_000);
});
