/**
 * Árbol de origen en la troza a mano (15-10): la regla que comparten el modal
 * y el servidor (`lib/forestal/loth-arbol-a-mano.ts`), la numeración con árbol
 * (`piezasAMano`), la marca firme para anular (`aMano` en el item de la GTF) y
 * que la lectura del censo no cruza negocios (`ForestLothArbolesAManoDB`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ wheres: [] as { modelo: string; where: Record<string, unknown> }[] }));

vi.mock("@/lib/prisma", () => {
  const modelo = (nombre: string, filas: () => unknown[]) => ({
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      H.wheres.push({ modelo: nombre, where });
      return filas();
    },
  });
  return {
    prisma: {
      forestPlan: modelo("forestPlan", () => [{ id: "plan-1" }]),
      forestCensusTree: modelo("forestCensusTree", () => [
        { id: "a1", treeCode: " 001-TOR ", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", planId: "plan-1", estado: "talado" },
      ]),
      forestLothEntry: modelo("forestLothEntry", () => [
        { section: "tala", treeCode: "001-TOR", trozaCode: null, volumeM3: 1.2, lineNo: 1 },
        { section: "trozado", treeCode: "001-TOR", trozaCode: "001-TOR-A-0123", volumeM3: 0.4, lineNo: 2 },
        // Sin árbol en la columna, pero con el código del árbol: también ocupa su letra.
        { section: "trozado", treeCode: null, trozaCode: "001-TOR-B", volumeM3: 0.1, lineNo: 3 },
        // Otro árbol en la columna (QA: «DEMO-014-A» con árbol «014-TOR»): ocupa la «C» de la guía, T4 no la suma.
        { section: "trozado", treeCode: "014-TOR", trozaCode: "001-TOR-C", volumeM3: 0.3, lineNo: 4 },
      ]),
    },
  };
});

import { ForestLothArbolesAManoDB } from "@/lib/db/forest-loth-arboles-a-mano.db";
import {
  arbolesParaLaFila,
  excesoDeLaTala,
  restanteDeLaTala,
  revisarArbolDeTroza,
  siguienteCodigoDelArbol,
  type ArbolParaTroza,
} from "@/lib/forestal/loth-arbol-a-mano";
import {
  ID_A_MANO,
  conCodigosDelServidor,
  piezasAMano,
  trozaAManoSchema,
  trozadosNacidosDeLaGuia,
  trozasDelLibroAMano,
} from "@/lib/forestal/loth-trozas-a-mano";

const arbol = (o: Partial<ArbolParaTroza> = {}): ArbolParaTroza => ({
  id: "a1",
  treeCode: "001-TOR",
  especie: "Tornillo",
  cientifico: "Cedrelinga cateniformis",
  planId: "plan-1",
  estado: "talado",
  talaM3: null,
  trozadoM3: 0,
  trozas: [],
  ...o,
});

describe("árbol de la troza a mano — la regla del modal y del servidor", () => {
  it("el árbol tiene que existir, la guía tener permiso y ser el del árbol", () => {
    expect(revisarArbolDeTroza(undefined, { planDeLaGuia: "plan-1", especie: null })).toMatchObject({ ok: false, code: "ARBOL_NO_EXISTE" });
    expect(revisarArbolDeTroza(arbol(), { planDeLaGuia: null, especie: null })).toMatchObject({
      ok: false,
      code: "GUIA_SIN_PERMISO_CON_ARBOL",
      detail: { treeCode: "001-TOR", planDelArbol: "plan-1" },
    });
    // La misma regla de la tala contra el censo (TALA_PLAN_DISTINTO_AL_CENSO).
    expect(revisarArbolDeTroza(arbol(), { planDeLaGuia: "plan-2", especie: null })).toMatchObject({ ok: false, code: "TALA_PLAN_DISTINTO_AL_CENSO" });
  });

  it("la especie es la del censo: otra no pasa; vacía toma la del árbol (con su científico)", () => {
    const mal = revisarArbolDeTroza(arbol(), { planDeLaGuia: "plan-1", especie: "Cumala" });
    expect(mal).toMatchObject({ ok: false, code: "TALA_ESPECIE_DISTINTA_AL_CENSO" });
    if (!mal.ok) expect(mal.mensaje).toMatch(/Se registra con la especie del censo/);
    expect(revisarArbolDeTroza(arbol(), { planDeLaGuia: "plan-1", especie: "  " })).toEqual({
      ok: true,
      treeCode: "001-TOR",
      planId: "plan-1",
      especie: "Tornillo",
      cientifico: "Cedrelinga cateniformis",
    });
    // La grafía no importa: «TORNILLO» es la misma especie.
    expect(revisarArbolDeTroza(arbol(), { planDeLaGuia: "plan-1", especie: "TORNILLO" }).ok).toBe(true);
  });

  it("T4 antes de registrar: sin tala no mide; con tala, lo trozado + lo nuevo no pasa lo tumbado", () => {
    expect(excesoDeLaTala(arbol({ talaM3: null, trozadoM3: 9 }), 5)).toBeNull();
    expect(excesoDeLaTala(arbol({ talaM3: 1.2, trozadoM3: 0.8 }), 0.4)).toBeNull();
    expect(excesoDeLaTala(arbol({ talaM3: 1.2, trozadoM3: 0.8 }), 0.4001)).toMatch(/001-TOR se taló con 1,200 m³ y ya tiene 0,800 m³/);
    expect(restanteDeLaTala(arbol({ talaM3: 1.2, trozadoM3: 0.8 }))).toBe(0.4);
    expect(restanteDeLaTala(arbol())).toBeNull();
  });

  it("el selector ofrece los de la especie y del permiso de la guía, primero los que tienen tala", () => {
    const arboles = [
      arbol({ id: "1", treeCode: "010-TOR" }),
      arbol({ id: "2", treeCode: "002-TOR", talaM3: 1 }),
      arbol({ id: "3", treeCode: "003-CUM", especie: "Cumala" }),
      arbol({ id: "4", treeCode: "004-TOR", planId: "plan-2" }),
      arbol({ id: "5", treeCode: "9-TOR" }),
    ];
    expect(arbolesParaLaFila(arboles, { especie: "tornillo", planId: "plan-1" }).map((a) => a.treeCode)).toEqual(["002-TOR", "9-TOR", "010-TOR"]);
    // Sin permiso en la guía: todos los permisos (la pantalla propone «Usar el permiso»).
    expect(arbolesParaLaFila(arboles, { especie: "Tornillo", planId: null }).map((a) => a.id)).toEqual(["2", "4", "5", "1"]);
    expect(arbolesParaLaFila(arboles, { q: "cum" }).map((a) => a.id)).toEqual(["3"]);
  });
});

describe("numeración con árbol — como el trozado de siempre", () => {
  it("árbol + la letra que sigue; las del libro ocupan su letra sin el sufijo de la guía", () => {
    expect(siguienteCodigoDelArbol("001-TOR", [])).toBe("001-TOR-A");
    expect(siguienteCodigoDelArbol("001-TOR", ["001-TOR-A-0123", "002-TOR-B", "001-TORNO-B"])).toBe("001-TOR-B");
    expect(siguienteCodigoDelArbol("001-TOR", ["001-tor-a", "001-TOR-B-019/0123"])).toBe("001-TOR-C");
    // Un árbol trozado con números sigue con números (`siguienteCodigoDeTroza`).
    expect(siguienteCodigoDelArbol("7", ["7-1", "7-2-0123"])).toBe("7-3");
  });

  it("las filas con árbol numeran por árbol; las sin árbol, 1, 2, 3 saltando lo que ya imprime la guía", () => {
    const arboles = new Map([["a1", { treeCode: "001-TOR", trozas: ["001-TOR-A-0099"] }]]);
    const piezas = piezasAMano(
      [
        { d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 2, arbolId: "a1" },
        { d1Cm: 50, d2Cm: 45, largoM: 3, cantidad: 1 },
        { d1Cm: 50, d2Cm: 45, largoM: 3, cantidad: 1, arbolId: "a1", especie: "Tornillo" },
        // Árbol que la pantalla todavía no leyó: número y sin árbol (el servidor decide).
        { d1Cm: 50, d2Cm: 45, largoM: 3, cantidad: 1, arbolId: "otro" },
      ],
      ["1", "001-TOR-B"],
      arboles,
    );
    expect(piezas.map((p) => [p.codigo, p.treeCode, p.arbolId])).toEqual([
      ["001-TOR-C", "001-TOR", "a1"],
      ["001-TOR-D", "001-TOR", "a1"],
      ["2", null, null],
      ["001-TOR-E", "001-TOR", "a1"],
      ["3", null, null],
    ]);
    const comoLibro = trozasDelLibroAMano(piezas, "plan-1");
    expect(comoLibro.map((t) => t.arbol)).toEqual(["001-TOR", "001-TOR", null, "001-TOR", null]);
    expect(comoLibro.every((t) => !("arbolId" in t) && !("treeCode" in t))).toBe(true);
  });

  it("el papel registrado lleva el código que dio el servidor (otra guía pudo llevarse la letra)", () => {
    const vista = trozasDelLibroAMano(piezasAMano([{ d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 2, arbolId: "a1" }], [], new Map([["a1", { treeCode: "001-TOR", trozas: [] }]])), "plan-1");
    expect(vista.map((t) => t.codigo)).toEqual(["001-TOR-A", "001-TOR-B"]);
    const papel = conCodigosDelServidor(vista, ["001-TOR-B", "001-TOR-C"]);
    expect(papel.map((t) => [t.codigo, t.id])).toEqual([
      ["001-TOR-B", `${ID_A_MANO}001-TOR-B`],
      ["001-TOR-C", `${ID_A_MANO}001-TOR-C`],
    ]);
    expect(papel[0].volumeM3).toBe(vista[0].volumeM3);
    // Sin lista, o que no cuadra: lo de la vista previa.
    expect(conCodigosDelServidor(vista, undefined)).toEqual(vista);
    expect(conCodigosDelServidor(vista, ["x"])).toEqual(vista);
  });

  it("el POST acepta el id del árbol (opcional) y rechaza uno con caracteres raros", () => {
    const base = { d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 1 };
    expect(trozaAManoSchema.safeParse({ ...base, arbolId: "cmabc123" }).success).toBe(true);
    expect(trozaAManoSchema.safeParse({ ...base, arbolId: null }).success).toBe(true);
    expect(trozaAManoSchema.safeParse(base).success).toBe(true);
    expect(trozaAManoSchema.safeParse({ ...base, arbolId: "a1' OR 1=1" }).success).toBe(false);
  });
});

describe("anular la guía — la marca firme `aMano`", () => {
  it("anula la troza a mano CON árbol por la marca, no por el texto; la del libro con árbol queda", () => {
    const gtf = {
      gtfNumber: "019-001-0000123",
      items: [
        { trozaCode: "001-TOR-A-0123", trozadoId: "mano-arbol", aMano: true },
        { trozaCode: "002-TOR-A", trozadoId: "del-libro" },
        // Guía de antes de la marca: sin árbol + la cita exacta.
        { trozaCode: "1-0123", trozadoId: "vieja" },
      ],
    };
    const trozados = [
      { id: "mano-arbol", treeCode: "001-TOR", observations: "Lo que sea" },
      { id: "del-libro", treeCode: "002-TOR", observations: null },
      { id: "vieja", treeCode: null, observations: null },
    ];
    expect(trozadosNacidosDeLaGuia(gtf, trozados)).toEqual(["mano-arbol"]);
    // La marca sin el trozado en los items no alcanza (ADR-450 L4 manda).
    expect(trozadosNacidosDeLaGuia({ ...gtf, items: [{ aMano: true }] }, trozados)).toEqual([]);
    // `aMano: "true"` (texto) no es la marca.
    expect(trozadosNacidosDeLaGuia({ ...gtf, items: [{ trozadoId: "del-libro", aMano: "true" }] }, trozados)).toEqual([]);
  });
});

describe("ForestLothArbolesAManoDB.paraElegir — multi-tenant", () => {
  beforeEach(() => {
    H.wheres = [];
  });

  it("toda lectura va por el tenantId pedido (otro negocio no ve este censo)", async () => {
    const arboles = await ForestLothArbolesAManoDB.paraElegir("tenant-a");
    expect(H.wheres.map((w) => w.modelo)).toEqual(["forestPlan", "forestCensusTree", "forestLothEntry"]);
    expect(H.wheres.every((w) => w.where.tenantId === "tenant-a")).toBe(true);
    // Los descartados y los de planes dados de baja no se ofrecen.
    expect(H.wheres[1].where).toMatchObject({ deletedAt: null, estado: { not: "descartado" }, planId: { in: ["plan-1"] } });
    expect(H.wheres[0].where).toMatchObject({ deletedAt: null });
    await expect(ForestLothArbolesAManoDB.paraElegir("")).rejects.toThrow(/tenantId/);
  });

  it("arma tala, lo trozado (por la columna del árbol, como T4) y las letras ocupadas (también por el código)", async () => {
    const [a] = await ForestLothArbolesAManoDB.paraElegir("tenant-a");
    expect(a).toEqual({
      id: "a1",
      treeCode: "001-TOR",
      especie: "Tornillo",
      cientifico: "Cedrelinga cateniformis",
      planId: "plan-1",
      estado: "talado",
      talaM3: 1.2,
      trozadoM3: 0.4,
      trozas: ["001-TOR-A-0123", "001-TOR-B", "001-TOR-C"],
    });
    expect(siguienteCodigoDelArbol(a.treeCode, a.trozas)).toBe("001-TOR-D");
  });
});
