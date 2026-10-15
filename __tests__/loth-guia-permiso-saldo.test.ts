// @vitest-environment node
/**
 * «Asignar permiso» revisa lo autorizado (15-10): la comparación por especie de
 * lo que trae la guía contra el saldo del permiso, con la MISMA severidad que
 * el despacho (T7 y T6 bloquean; sin especie no se juzga).
 */
import { describe, expect, it, vi } from "vitest";

/* Sólo para el 422 del despacho: la ruta corta antes de tocar la base (`prisma` vacío lo prueba). */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", async (real) => ({ ...(await real<typeof import("@/lib/cache")>()), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: vi.fn() }));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => [], closedPeriodOf: async () => null } }));
vi.mock("@/lib/db/forest-especies.db", () => ({ ForestEspeciesDB: { get: async () => ({ agregadas: [], ocultas: [] }) } }));

import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { lothErrorResponse } from "@/lib/forestal/loth-api-errors";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { especieEnRegistro, mensajeEspecieFueraDelRegistro, rechazoT7 } from "@/lib/forestal/loth-plan-especie";
import { mensajeT6, type MedidaT6 } from "@/lib/forestal/loth-t6";
import {
  avisoSinEspecie,
  compararGuiaConPermiso,
  mensajeTrozasDeOtroPermiso,
  type TrozaParaElPermiso,
} from "@/lib/forestal/loth-guia-permiso-saldo";

const PLAN = [
  { speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis" },
  { speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum" },
];
const troza = (codigo: string, speciesCommon: string | null, volumeM3: number | null, extra: Partial<TrozaParaElPermiso> = {}): TrozaParaElPermiso => ({
  codigo,
  speciesCommon,
  speciesScientific: null,
  volumeM3,
  ...extra,
});
/** La medida de HOY: `movilizado` ya trae la guía sin permiso adentro (ADR-459). */
const medidas = (m: Record<string, MedidaT6>) => new Map(Object.entries(m).map(([k, v]) => [claveEspecie(k), v]));

describe("compararGuiaConPermiso", () => {
  it("cabe: «ya salió» es lo movilizado SIN la guía y «queda» descuenta la guía", () => {
    const s = compararGuiaConPermiso(
      [troza("DEMO-023-A", "Tornillo", 1.2), troza("DEMO-023-B", "tornillo", 0.8)],
      PLAN,
      medidas({ Tornillo: { autorizado: 320, movilizado: 12 } }),
      false,
    );
    expect(s.bloqueo).toBeNull();
    expect(s.especies).toEqual([
      { especie: "Tornillo", trozas: 2, guiaM3: 2, autorizadoM3: 320, yaSalioM3: 10, quedaM3: 308, estado: "cabe" },
    ]);
  });

  it("pasa: bloquea con el mismo mensaje T6 del despacho", () => {
    const s = compararGuiaConPermiso([troza("1-0001", "Capirona", 3)], PLAN, medidas({ Capirona: { autorizado: 10, movilizado: 11 } }), false);
    expect(s.especies[0]).toMatchObject({ estado: "pasa", yaSalioM3: 8, quedaM3: -1 });
    expect(s.bloqueo).toEqual({
      codigo: "T6_EXCESO_AUTORIZADO",
      especie: "Capirona",
      mensaje: mensajeT6("Capirona", { autorizado: 10, movilizado: 8 }, 3, false),
    });
    expect(s.bloqueo?.mensaje).toContain("ya se movilizaron 8 m³; este despacho de 3 m³ excede lo autorizado");
  });

  it("justo en el techo cabe (≤, nunca ==)", () => {
    const s = compararGuiaConPermiso([troza("1-0001", "Capirona", 2)], PLAN, medidas({ Capirona: { autorizado: 10, movilizado: 10 } }), false);
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ estado: "cabe", quedaM3: 0 });
  });

  it("sin especie: no se compara, se cuenta y se nombra", () => {
    const s = compararGuiaConPermiso(
      [troza("1-0482", null, 0.9), troza("1-0483", "  ", 0.4), troza("DEMO-023-A", "Tornillo", 1.2)],
      PLAN,
      medidas({ Tornillo: { autorizado: 320, movilizado: 1.2 } }),
      false,
    );
    expect(s.sinEspecie).toEqual({ trozas: 2, codigos: ["1-0482", "1-0483"] });
    expect(s.bloqueo).toBeNull();
    expect(s.especies).toHaveLength(1);
    expect(avisoSinEspecie(2)).toBe("2 trozas sin especie: no se pueden comparar con lo autorizado");
    expect(avisoSinEspecie(1)).toBe("1 troza sin especie: no se puede comparar con lo autorizado");
  });

  it("especie fuera del permiso: T7 bloquea y va primero aunque otra pase T6", () => {
    const s = compararGuiaConPermiso(
      [troza("1-0001", "Capirona", 5), troza("1-0002", "Shihuahuaco", 1)],
      PLAN,
      medidas({ Capirona: { autorizado: 1, movilizado: 5 } }),
      false,
    );
    expect(s.especies.map((e) => e.estado)).toEqual(["fuera_del_permiso", "pasa"]);
    expect(s.bloqueo).toEqual({ codigo: "T7_ESPECIE_NO_AUTORIZADA", especie: "Shihuahuaco", mensaje: rechazoT7(PLAN, "Shihuahuaco", null, false) });
    expect(s.bloqueo?.mensaje).toMatch(/^La especie "Shihuahuaco" no está autorizada en el plan de manejo \(POA\)/);
    expect(s.bloqueo?.mensaje).toContain('La especie "Shihuahuaco" no está autorizada en el plan de manejo (POA)');
  });

  it("en una plantación T7 y T6 hablan del registro", () => {
    const t7 = compararGuiaConPermiso([troza("1-0002", "Shihuahuaco", 1)], PLAN, medidas({}), true);
    expect(t7.bloqueo?.mensaje).toBe(mensajeEspecieFueraDelRegistro("Shihuahuaco"));
    const t6 = compararGuiaConPermiso([troza("1-0001", "Tornillo", 2)], PLAN, medidas({ Tornillo: { autorizado: 1, movilizado: 2 } }), true);
    expect(t6.bloqueo?.mensaje).toContain("El registro de la plantación tiene 1 m³ de Tornillo");
    expect(t6.bloqueo?.mensaje).toContain("excede lo registrado");
  });

  it("permiso sin especies cargadas: T7 no juzga y no hay techo", () => {
    const s = compararGuiaConPermiso([troza("1-0002", "Shihuahuaco", 9)], [], medidas({}), false);
    expect(s.permisoSinEspecies).toBe(true);
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ estado: "sin_techo", autorizadoM3: null, quedaM3: null });
  });

  it("especie del permiso sin volumen autorizado: sin techo, no bloquea", () => {
    const s = compararGuiaConPermiso([troza("1-0001", "Tornillo", 50)], PLAN, medidas({ Tornillo: { autorizado: null, movilizado: 60 } }), false);
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ estado: "sin_techo", yaSalioM3: 10 });
  });

  it("troza sin volumen: no se juzga T6 (como el despacho)", () => {
    const s = compararGuiaConPermiso([troza("1-0001", "Capirona", null)], PLAN, medidas({ Capirona: { autorizado: 1, movilizado: 5 } }), false);
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ estado: "cabe", guiaM3: 0 });
  });

  it("una troza de otro permiso no cuenta en éste y bloquea, por troza y antes que T7", () => {
    const s = compararGuiaConPermiso(
      [
        troza("1-0001", "Tornillo", 400, { deOtroPermiso: true, otroPermiso: "PO-OTRO-9" }),
        troza("1-0002", "Tornillo", 1),
        troza("1-0003", "Shihuahuaco", 1),
      ],
      PLAN,
      medidas({ Tornillo: { autorizado: 320, movilizado: 1 } }),
      false,
    );
    expect(s.deOtroPermiso).toEqual({ trozas: 1, codigos: ["1-0001"], porTroza: [{ codigo: "1-0001", permiso: "PO-OTRO-9" }] });
    expect(s.bloqueo).toEqual({ codigo: "TROZA_DE_OTRO_PERMISO", especie: null, mensaje: mensajeTrozasDeOtroPermiso(s.deOtroPermiso.porTroza) });
    expect(s.bloqueo?.mensaje).toContain("1-0001 (PO-OTRO-9)");
    expect(s.bloqueo?.mensaje).toContain("Asígnale a la guía el permiso PO-OTRO-9");
    expect(s.especies.find((e) => e.especie === "Tornillo")).toMatchObject({ trozas: 1, guiaM3: 1, yaSalioM3: 0 });
  });

  it("varias de permisos distintos: las nombra todas (hasta 8) sin sugerir uno", () => {
    const otras = Array.from({ length: 10 }, (_, i) => troza(`1-${i}`, "Tornillo", 1, { deOtroPermiso: true, otroPermiso: i % 2 ? "PO-A" : "PO-B" }));
    const m = compararGuiaConPermiso(otras, PLAN, new Map(), false).bloqueo?.mensaje ?? "";
    expect(m).toMatch(/^10 trozas de esta guía ya son de otro permiso: 1-0 \(PO-B\), 1-1 \(PO-A\)/);
    expect(m).toContain(" y 2 más.");
    expect(m).not.toMatch(/asígnale/i);
  });

  it("se reconoce por el nombre científico y se muestra como la escribe el permiso", () => {
    const s = compararGuiaConPermiso(
      [troza("1-0001", "Tornillo rojo", 1, { speciesScientific: "Cedrelinga cateniformis" })],
      PLAN,
      medidas({ Tornillo: { autorizado: 320, movilizado: 1 } }),
      false,
    );
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ especie: "Tornillo", estado: "cabe" });
  });
});

describe("T7 al asignar = la decisión del despacho (`rechazoT7`, `especieEnRegistro`)", () => {
  /* El registro como lo escribe el permiso: con el científico entre paréntesis. */
  const REGISTRO = [
    { speciesCommon: "Tornillo (Cedrelinga cateniformis)", speciesScientific: null },
    { speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum" },
  ];

  it("«Tornillo» contra «Tornillo (Cedrelinga cateniformis)» del registro: está, no bloquea", () => {
    expect(especieEnRegistro(REGISTRO, "Tornillo", null)).toBe(true);
    const s = compararGuiaConPermiso([troza("A-1", "Tornillo", 1)], REGISTRO, new Map(), false);
    expect(s.bloqueo).toBeNull();
    expect(s.especies[0]).toMatchObject({ especie: "Tornillo (Cedrelinga cateniformis)", estado: "sin_techo" });
  });

  it("por científico: otro nombre común con el científico del registro es esa especie", () => {
    expect(especieEnRegistro(REGISTRO, "Capirona blanca", "Calycophyllum spruceanum")).toBe(true);
    const s = compararGuiaConPermiso([troza("A-1", "Capirona blanca", 1, { speciesScientific: "Calycophyllum spruceanum" })], REGISTRO, new Map(), false);
    expect(s.bloqueo).toBeNull();
  });

  it.each([
    ["Tornillo", null, false],
    ["TORNILLO", null, false],
    ["Capirona blanca", "Calycophyllum spruceanum", false],
    ["Shihuahuaco", null, false],
    ["Shihuahuaco", "Dipteryx micrantha", false],
    ["Shihuahuaco", null, true],
  ] as const)("%s (%s, plantación %s): bloquea sii no está en el registro, con el mensaje del despacho", (sp, cientifico, plantacion) => {
    const s = compararGuiaConPermiso([troza("A-1", sp, 1, { speciesScientific: cientifico })], REGISTRO, new Map(), plantacion);
    const fuera = !especieEnRegistro(REGISTRO, sp, cientifico);
    expect(s.bloqueo?.codigo === "T7_ESPECIE_NO_AUTORIZADA").toBe(fuera);
    expect(s.bloqueo?.mensaje ?? null).toBe(rechazoT7(REGISTRO, sp, cientifico, plantacion));
  });

  it("rechazoT7: sin especies cargadas o sin especie no juzga; en plantación habla del registro", () => {
    expect(rechazoT7([], "Shihuahuaco", null, false)).toBeNull();
    expect(rechazoT7(REGISTRO, "  ", null, false)).toBeNull();
    expect(rechazoT7(REGISTRO, " Shihuahuaco ", null, true)).toBe(mensajeEspecieFueraDelRegistro("Shihuahuaco"));
  });
});

describe("despacho con trozas a mano: especie fuera del catálogo", () => {
  const fila = (especie: string) => ({ d1Cm: 40, d2Cm: 42, largoM: 3, cantidad: 1, especie });

  it("responde 422 ESPECIE_FUERA_DEL_CATALOGO antes de tocar la base", async () => {
    const err = await ForestLothDB.despacharConGuia("t-qa", {
      gtfNumber: "025-001-0000001",
      gtfDate: new Date("2026-10-15T00:00:00Z"),
      trozaCodes: [],
      aMano: { filas: [fila("Tornillo"), fila("Palo inventado")], planId: null },
      gtfDatos: {} as never,
      titularName: null,
      createdBy: "qa",
    }).catch((e: unknown) => e);
    const res = lothErrorResponse(err, "test", "t-qa");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: "ESPECIE_FUERA_DEL_CATALOGO",
      message: expect.stringContaining("«Palo inventado» no está en el catálogo"),
      detail: { especie: "Palo inventado" },
    });
  });

  it("una del catálogo pasa con la grafía del catálogo y su científico", async () => {
    const [f] = await ForestLothDB.especiesAManoDelCatalogo("t-qa", [fila("TORNILLO")]);
    expect(f.especie).toBe("Tornillo");
    expect(f.cientifico).toMatch(/^Cedrelinga/);
  });
});
