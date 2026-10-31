/**
 * La propuesta de vinculación a partir de los códigos escritos al cubicar.
 *
 * Los datos salen del tenant real (`inversiones-agroforestales-blas-sociedad-anonima`,
 * medido 2026-09-15): 160 trozas / 197,646 m³ en el patio, 49 con codificación
 * «-» (= sin código), 7 códigos de guía recibida —todos de la guía
 * 010-001-0000005, permiso 10-HUA-PUE/PER-FMP-2026-007— y ninguno ambiguo.
 * Las corridas sin origen son 14; la N° 18 declara 35,647 m³.
 */
import { describe, it, expect } from "vitest";
import {
  codigosDeLoCubicado,
  medirAlcance,
  proponerVinculacion,
} from "@/lib/forestal/propuesta-de-vinculacion";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const GUIA = "010-001-0000005";
const PERMISO = "10-HUA-PUE/PER-FMP-2026-007";

/** Una troza del patio como la devuelve `/api/admin/forestal/trozas/patio`. */
const troza = (p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible => ({
  woodEntryId: "we-1",
  codificacion: null,
  codigoPlanta: null,
  especieComun: "Tornillo",
  volumenM3: 2.808,
  largoM: 8.5,
  gtfNumber: GUIA,
  permiso: PERMISO,
  guiaRecepcionada: true,
  fechaIngreso: "2026-08-20",
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  consumidaEnId: null,
  despachadaEnId: null,
  loteAserrioId: null,
  loteAserrioCode: null,
  ...p,
});

/* Las 7 trozas reales de Blas que quedan proponibles. */
const PATIO_BLAS: TrozaConsumible[] = [
  troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808 }),
  troza({ id: "t2", codificacion: "115-B", volumenM3: 2.153 }),
  troza({ id: "t3", codificacion: "115-C", volumenM3: 1.956 }),
  troza({ id: "t4", codificacion: "116-B", volumenM3: 2.991 }),
  troza({ id: "t5", codificacion: "215-B", volumenM3: 1.752 }),
  troza({ id: "t6", codificacion: "226-B", volumenM3: 1.44 }),
  troza({ id: "t7", codificacion: "233-A", volumenM3: 3.453 }),
  /* Las 49 sin código: codificación «-» no es un código. */
  ...Array.from({ length: 49 }, (_, i) => troza({ id: `guion-${i}`, codificacion: "-", volumenM3: 1.2 })),
];

const CORRIDA = { especie: "Tornillo", producidoM3: 35.647 };

describe("codigosDeLoCubicado", () => {
  it("saca los repetidos y los «-», y respeta el orden en que se escribieron", () => {
    expect(
      codigosDeLoCubicado([
        { codigo: "233-A" }, { codigo: "115-A" }, { codigo: "233-a" },
        { codigo: "-" }, { codigo: "  " }, { codigo: null }, {},
      ]),
    ).toEqual(["233-A", "115-A"]);
  });
});

describe("proponerVinculacion — los casos reales de Blas", () => {
  it("un código que existe: propone la troza con su guía y su permiso", () => {
    const p = proponerVinculacion(CORRIDA, ["115-A"], PATIO_BLAS);
    expect(p.trozas).toHaveLength(1);
    expect(p.trozas[0]).toMatchObject({ id: "t1", guia: GUIA, permiso: PERMISO, volumenM3: 2.808 });
    expect(p.volumenM3).toBe(2.808);
    expect(p.origenes).toEqual([{ guia: GUIA, permiso: PERMISO, trozas: 1, volumenM3: 2.808 }]);
    expect(p.codigos[0].estado).toBe("propuesto");
    expect(p.codigosSinResolver).toBe(0);
  });

  it("los 7 códigos reales suman 16,553 m³ de una sola guía y un solo permiso", () => {
    const p = proponerVinculacion(CORRIDA, ["115-A", "115-B", "115-C", "116-B", "215-B", "226-B", "233-A"], PATIO_BLAS);
    expect(p.trozas).toHaveLength(7);
    expect(p.volumenM3).toBe(16.553);
    expect(p.origenes).toHaveLength(1);
    /* Medido: ninguna de las 7 está en un lote — por eso el modal no podía
       confirmar nada, y la propuesta tiene que decirlo. */
    expect(p.lotes).toEqual([]);
    expect(p.sinLote).toHaveLength(7);
  });

  it("dos piezas cubicadas de la MISMA troza no duplican su volumen", () => {
    const p = proponerVinculacion(CORRIDA, ["115-A", "115-a"], PATIO_BLAS);
    expect(p.trozas).toHaveLength(1);
    expect(p.volumenM3).toBe(2.808);
  });

  it("el código «-» se dice como «sin código», no se busca", () => {
    const p = proponerVinculacion(CORRIDA, ["-", "115-A"], PATIO_BLAS);
    expect(p.codigos[0]).toMatchObject({ estado: "sin-codigo", candidatas: [] });
    expect(p.codigos[0].detalle).toContain("sin código");
    /* Y no arrastra las 49 trozas que lo llevan. */
    expect(p.trozas).toHaveLength(1);
  });

  it("un código inexistente SE DICE, no se ignora", () => {
    const p = proponerVinculacion(CORRIDA, ["115-A", "999-Z"], PATIO_BLAS);
    expect(p.trozas).toHaveLength(1);
    expect(p.codigos[1]).toMatchObject({ codigo: "999-Z", estado: "desconocido" });
    expect(p.codigosSinResolver).toBe(1);
  });

  it("un código de guía SIN recepción no se propone y explica por qué", () => {
    const patio = [...PATIO_BLAS, troza({ id: "t8", codificacion: "300-A", gtfNumber: "010-001-0000099", guiaRecepcionada: false })];
    const p = proponerVinculacion(CORRIDA, ["300-A"], patio);
    expect(p.trozas).toEqual([]);
    expect(p.codigos[0].estado).toBe("sin-recepcion");
    expect(p.codigos[0].detalle).toContain("010-001-0000099");
  });

  it("un código ambiguo no se adivina: muestra las candidatas y no suma volumen", () => {
    const patio = [...PATIO_BLAS, troza({ id: "t9", codificacion: "115-A", volumenM3: 4.1, gtfNumber: "010-001-0000077" })];
    const p = proponerVinculacion(CORRIDA, ["115-A"], patio);
    expect(p.trozas).toEqual([]);
    expect(p.volumenM3).toBe(0);
    expect(p.codigos[0].estado).toBe("ambiguo");
    expect(p.codigos[0].candidatas.map((c) => c.id)).toEqual(["t1", "t9"]);
  });

  it("una troza ya consumida se nombra con su motivo, no como inexistente", () => {
    const patio = [troza({ id: "t1", codificacion: "115-A", consumidaEnId: "corrida-vieja" })];
    const p = proponerVinculacion(CORRIDA, ["115-A"], patio);
    expect(p.codigos[0].estado).toBe("no-disponible");
    expect(p.codigos[0].detalle).toContain("otra corrida");
  });

  it("marca la troza de otra especie sin descartarla", () => {
    const patio = [troza({ id: "t1", codificacion: "115-A", especieComun: "Cachimbo" })];
    const p = proponerVinculacion(CORRIDA, ["115-A"], patio);
    expect(p.trozas).toHaveLength(1);
    expect(p.otraEspecie.map((t) => t.id)).toEqual(["t1"]);
  });

  it("agrupa el lote cuando las trozas ya están apartadas en uno", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", loteAserrioId: "L1", loteAserrioCode: "LA-2026-010", volumenM3: 2.808 }),
      troza({ id: "t2", codificacion: "115-B", loteAserrioId: "L1", loteAserrioCode: "LA-2026-010", volumenM3: 2.153 }),
    ];
    const p = proponerVinculacion(CORRIDA, ["115-A", "115-B"], patio);
    expect(p.lotes).toEqual([{ id: "L1", code: "LA-2026-010", trozas: 2, volumenM3: 4.961 }]);
    expect(p.sinLote).toEqual([]);
  });
});

describe("el volumen que NO alcanza se ve ANTES de confirmar", () => {
  it("los 7 códigos no alcanzan para los 35,647 m³ de la corrida N° 18", () => {
    const p = proponerVinculacion(CORRIDA, ["115-A", "115-B", "115-C", "116-B", "215-B", "226-B", "233-A"], PATIO_BLAS);
    /* 35,647 / 0,56 = 63,6554 m³ de troza; hay 16,553 → faltan 47,1024. */
    expect(p.alcance).toMatchObject({
      veredicto: "imposible",
      propuestoM3: 16.553,
      necesarioM3: 63.6554,
      faltaM3: 47.1024,
    });
    /* El separador decimal lo pone el ICU del entorno (node vs navegador):
       se afirma la cifra, no la coma. */
    expect(p.alcance.mensaje).toMatch(/faltan 47[.,]102 m³/);
  });

  it("por encima del 56 % avisa y dice cuánta troza falta", () => {
    /* 10 m³ de producto con 17 de troza = 58,82 %: entra, pero pasa el tope. */
    expect(medirAlcance(10, 17, 5)).toMatchObject({
      veredicto: "sobre-el-tope",
      rendimientoPct: 58.82,
      necesarioM3: 17.8571,
      faltaM3: 0.8571,
    });
  });

  it("dentro del tope no advierte nada", () => {
    expect(medirAlcance(10, 20, 5)).toMatchObject({ veredicto: "alcanza", faltaM3: 0, mensaje: null });
  });

  it("una corrida que no declara en m³ no se compara: no se inventa el número", () => {
    /* Las corridas en pie tablar llegan con `producidoM3: 0` desde el saldo por
       permiso. Dividir por cero y decir «alcanza» sería inventar el veredicto. */
    const a = medirAlcance(0, 16.553, 7);
    expect(a.veredicto).toBe("sin-comparar");
    expect(a.faltaM3).toBe(0);
    expect(a.mensaje).toContain("no declara su producción en m³");
  });

  it("sin trozas no inventa un veredicto de rendimiento", () => {
    const p = proponerVinculacion(CORRIDA, ["999-Z"], PATIO_BLAS);
    expect(p.alcance.veredicto).toBe("sin-trozas");
    expect(p.alcance.rendimientoPct).toBeNull();
  });
});
