/**
 * T6 en la VISTA PREVIA del importador de guías (ADR-461, 04-10). Antes, una
 * guía que pasaba el cupo T9 pedía motivo, la persona lo escribía y la
 * importación la rechazaba igual con `T6_EXCESO_AUTORIZADO` (lo despachado
 * pasa lo autorizado: tope legal, sin motivo posible).
 *
 * Contra `ForestLothImportarDB.vistaPrevia` con la revisión REAL y un `prisma`
 * falso: la medida (`ForestLothDB.medidaT6`) es la misma que usa `enforceT6`
 * al despachar, y el exceso de la vista se cruza con el que da el servidor.
 *
 * Escenario: Azúcar huayo con 45 m³ AUTORIZADOS; ya salió la troza 9-AZ-A con 10 m³.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const estado = { especies: [] as Fila[], lineas: [] as Fila[], escrituras: 0 };
  const deTenant = (where: Fila) => (f: Fila) => f.tenantId === where.tenantId;
  const db = {
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    forestCensusTree: { findMany: async () => [] },
    forestPlan: { findFirst: async () => ({ planType: "PO", planNumber: "PO-1", tituloHabilitante: null }) },
    forestPlanSpecies: {
      findMany: async ({ where }: { where: Fila }) => estado.especies.filter((s) => deTenant(where)(s) && s.planId === where.planId),
      aggregate: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) => {
        const filas = estado.especies.filter((s) => s.tenantId === where.tenantId && where.id.in.includes(String(s.id)));
        const v = filas.map((s) => s.volumenAutorizadoM3).filter((x): x is number => typeof x === "number");
        return { _sum: { volumenAutorizadoM3: v.length ? v.reduce((a, b) => a + b, 0) : null } };
      },
    },
    forestLothEntry: {
      findMany: async ({ where }: { where: Fila }) => estado.lineas.filter((l) => deTenant(where)(l) && l.section === where.section),
      groupBy: async ({ where }: { where: Fila & { trozaCode?: { in: string[] } } }) => {
        const filas = estado.lineas.filter(
          (l) =>
            deTenant(where)(l) &&
            l.section === where.section &&
            (!where.trozaCode || where.trozaCode.in.includes(String(l.trozaCode))),
        );
        const por = new Map<string, Fila & { _sum: { volumeM3: number; quantity: number } }>();
        for (const l of filas) {
          const k = `${String(l.speciesCommon)}|${String(l.speciesScientific)}`;
          const g = por.get(k) ?? { speciesCommon: l.speciesCommon, speciesScientific: l.speciesScientific, _sum: { volumeM3: 0, quantity: 0 } };
          g._sum.volumeM3 += Number(l.volumeM3 ?? 0);
          g._sum.quantity += Number(l.quantity ?? 0);
          por.set(k, g);
        }
        return [...por.values()];
      },
      create: async () => {
        estado.escrituras += 1;
        return {};
      },
      update: async () => {
        estado.escrituras += 1;
        return {};
      },
    },
  };
  return { estado, db };
});

vi.mock("@/lib/prisma", () => ({ prisma: { ...H.db, $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(H.db) } }));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => [], closedPeriodOf: async () => null } }));
vi.mock("@/lib/db/forest-loth-poa.db", () => ({ ForestLothPoaDB: { get: async () => ({ dmcOverrides: {} }) } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: () => {} }));

import { ForestLothDB, LothInvariantError } from "@/lib/db/forest-loth.db";
import { vistaPreviaDeTanda, type LibroDeLaGuia, type PlanDelLibro } from "@/lib/forestal/loth-importar-guia";
import { rehacerTanda } from "@/lib/forestal/loth-importar-guia-tanda";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { ContextoTanda, GuiaVistaPrevia } from "@/lib/forestal/loth-importar-guia-tipos";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esImportable } from "@/components/admin/forestal/hooks/importar-guias-pantalla";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

const T = "tenant-blas";
const AZ = { comun: "Azúcar huayo", cientifico: "Hymenaea courbaril" };

const ficha = (gtf: string, fecha: string, trozas: [string, number][]) =>
  ({
    gtfNumber: gtf,
    numeroRegistro: `R-${gtf}`,
    fechaExpedicion: fecha,
    estado: "Vigente",
    titular: "Blas",
    numeroTitulo: "PO-1",
    trozas: trozas.map(([codificacion, volumen]) => ({
      codificacion,
      dimensiones: "90.0 X 85.0 X 11.0",
      ...AZ,
      tipoProducto: "Troza",
      presentacion: null,
      cantidad: 1,
      unidad: "m3",
      volumen,
    })),
  }) as unknown as GtfSerfor;

const vista = async (...fichas: GtfSerfor[]) =>
  (
    await ForestLothImportarDB.vistaPrevia(
      T,
      fichas.map((f, i) => ({ clave: `c${i}`, fuente: { tipo: "ficha", ficha: f } as never, ficha: f, verificada: true, falla: null, planElegido: "P1" })),
    )
  ).guias;

/** `enforceT6` es privado: es la función a la que llega cada despacho del importador. */
const enforceT6 = (vol: number) =>
  (ForestLothDB as unknown as { enforceT6: (...a: unknown[]) => Promise<void> }).enforceT6(H.db, T, "P1", AZ.comun, AZ.cientifico, vol);

/** Lo que deja escrito el despacho de una troza (para la medición siguiente). */
const despachar = (trozaCode: string, volumeM3: number) =>
  H.estado.lineas.push(
    { tenantId: T, planId: "P1", status: "registrado", section: "trozado", trozaCode, speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumeM3 },
    { tenantId: T, planId: "P1", status: "registrado", section: "despacho_troza", trozaCode },
  );

beforeEach(() => {
  vi.restoreAllMocks();
  H.estado.especies = [
    { id: "s1", tenantId: T, planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumenAutorizadoM3: 45 },
    // Otro negocio con la misma especie y el mismo plan id: no suma.
    { id: "s9", tenantId: "otro", planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumenAutorizadoM3: 900 },
  ];
  H.estado.lineas = [];
  H.estado.escrituras = 0;
  despachar("9-AZ-A", 10);
  vi.spyOn(ForestLothImportarDB, "bajoDmcDe").mockResolvedValue(new Map());
  vi.spyOn(ForestLothImportarDB, "planesYContratos").mockResolvedValue({
    planes: [
      {
        id: "P1",
        planType: "PO",
        planNumber: "PO-1",
        tituloHabilitante: null,
        titularName: "Blas",
        contratoId: null,
        especies: [{ planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico }],
      },
    ],
    contratos: [],
  } as never);
  vi.spyOn(ForestLothImportarDB, "libroDe").mockResolvedValue({ trozados: [], talas: [], salidas: [], guias: [], cierres: [] } as never);
});

describe("T6 en la vista previa del importador", () => {
  it("la guía que despacha de más va BLOQUEADA (con y sin tala), con el exceso que da el servidor al despachar", async () => {
    const [g] = await vista(ficha("019-1", "15/09/2026", [["2-AZ-Q", 20], ["2-AZ-R", 20]]));
    expect(g.estado).toBe("bloqueada");
    expect(g.estadoSinTala).toBe("bloqueada");
    expect(esImportable(g, true)).toBe(false);
    expect(esImportable(g, false)).toBe(false);
    expect(g.sobreAutorizado).toEqual([
      expect.objectContaining({ especie: AZ.comun, autorizadoM3: 45, yaSalioM3: 10, despachaM3: 40, excesoM3: 5, plantacion: false }),
    ]);
    const aviso = g.avisos.find((a) => a.codigo === "exceso_autorizado");
    expect(aviso).toMatchObject({ nivel: "bloquea" });
    expect(aviso?.soloConTala).toBeUndefined();
    expect(aviso?.mensaje).toBe(
      `No se puede importar, ni con motivo: ya salieron ${fmtM3(10)} m³ de ${AZ.comun}, esta guía despacha ${fmtM3(40)} m³ más y el permiso autoriza ${fmtM3(45)} m³.`,
    );
    expect(g.mensaje).toBe(aviso?.mensaje);
    expect(H.estado.escrituras).toBe(0);

    // El servidor, troza por troza como el importador: la 1.ª entra (10 + 20 ≤ 45), la 2.ª no.
    await expect(enforceT6(20)).resolves.toBeUndefined();
    despachar("2-AZ-Q", 20);
    const err = await enforceT6(20).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LothInvariantError);
    expect(err).toMatchObject({ code: "T6_EXCESO_AUTORIZADO", detail: { autorizado: 45, movilizado: 30, pedido: 20 } });
    const d = (err as LothInvariantError).detail as { autorizado: number; movilizado: number; pedido: number };
    expect(d.movilizado + d.pedido - d.autorizado).toBe(g.sobreAutorizado?.[0].excesoM3);
  });

  it("dentro de lo autorizado (10 + 30 ≤ 45) → lista, sin aviso de T6", async () => {
    const [g] = await vista(ficha("019-1", "15/09/2026", [["2-AZ-Q", 15], ["2-AZ-R", 15]]));
    expect(g.estado).toBe("lista");
    expect(g.sobreAutorizado).toEqual([]);
    expect(g.avisos.some((a) => a.codigo === "exceso_autorizado")).toBe(false);
  });

  it("en la tanda, la 2.ª guía ve lo que despacha la 1.ª (10 + 20 + 20 > 45): sólo la 2.ª se bloquea", async () => {
    const [a, b] = await vista(
      ficha("019-2", "16/09/2026", [["3-AZ-A", 10], ["3-AZ-B", 10]]),
      ficha("019-1", "15/09/2026", [["2-AZ-Q", 10], ["2-AZ-R", 10]]),
    );
    // Se revisan por fecha: la del 15 primero.
    expect(b.estado).toBe("lista");
    expect(a.estado).toBe("bloqueada");
    expect(a.sobreAutorizado?.[0]).toMatchObject({ yaSalioM3: 30, despachaM3: 20, excesoM3: 5 });
  });
});

/* ── La tanda se rehace con las guías MARCADAS (revisión independiente 04-10) ── */

const PLANES = [
  {
    id: "P1",
    planType: "PO",
    planNumber: "PO-1",
    tituloHabilitante: null,
    titularName: "Blas",
    contratoId: null,
    especies: [
      { planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico },
      { planId: "P1", speciesCommon: "Tornillo", speciesScientific: null },
    ],
  },
] as unknown as PlanDelLibro[];
const LIBRO_VACIO = { trozados: [], talas: [], salidas: [], guias: [], cierres: [] } as unknown as LibroDeLaGuia;
const tandaT6 = (movilizado: number, cupos: ContextoTanda["cupos"] = []): ContextoTanda => ({
  cupos,
  t6: [{ planId: "P1", delPlan: [{ speciesCommon: AZ.comun, speciesScientific: AZ.cientifico }], medidas: [{ clave: claveEspecie(AZ.comun), autorizado: 45, movilizado }] }],
});
const base = (fichas: GtfSerfor[], libro = LIBRO_VACIO) =>
  vistaPreviaDeTanda(
    fichas.map((f, i) => ({ clave: `g${i}`, fuente: { tipo: "ficha", ficha: f } as never, ficha: f, verificada: true, falla: null, planElegido: "P1" })),
    { planes: PLANES, contratos: [], libro, bajoDmc: new Map() },
  );
const todas = (g: GuiaVistaPrevia) => ({ marcada: true, crearTala: g.crearTalaPorDefecto });

describe("rehacerTanda: T6/T9 con las guías marcadas", () => {
  it("una guía YA importada no se mide: sus trozas ya cuentan en lo movilizado (sin doble conteo)", () => {
    const tz = (code: string) => ({
      id: code, lineNo: 1, section: "trozado", planId: "P1", treeCode: code.split("-").slice(0, 2).join("-"), trozaCode: code,
      speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, diamMayorM: 0.9, diamMenorM: 0.85, lengthM: 11, volumeM3: 20, fecha: "2026-09-15", referencial: null,
    });
    const libro = {
      trozados: [tz("2-AZ-Q"), tz("2-AZ-R")],
      talas: [],
      salidas: [
        { trozaCode: "2-AZ-Q", section: "despacho_troza", lineNo: 1, gtfNumber: "019-1" },
        { trozaCode: "2-AZ-R", section: "despacho_troza", lineNo: 2, gtfNumber: "019-1" },
      ],
      guias: [{ id: "g1", gtfNumber: "019-1", status: "emitida", titularName: "Blas", tituloHabilitante: "PO-1", planId: "P1", observations: "Importada al Libro TH desde SERFOR · registro SERFOR R-019-1 (ADR-461)." }],
      cierres: [],
    } as unknown as LibroDeLaGuia;
    // Ya salieron 40 (estas mismas dos trozas): contarlas otra vez daría 80 de 45.
    const [g] = rehacerTanda(base([ficha("019-1", "15/09/2026", [["2-AZ-Q", 20], ["2-AZ-R", 20]])], libro), tandaT6(40), todas);
    expect(g.estado).toBe("ya_importada");
    expect(g.avisos.some((a) => a.codigo === "exceso_autorizado")).toBe(false);
    expect(g.sobreAutorizado).toBeNull();
  });

  it("2 guías que juntas pasan T6 (10 + 20 + 20 > 45): desmarcar la 1.ª deja importable la 2.ª", () => {
    const guias = base([ficha("019-1", "15/09/2026", [["2-AZ-Q", 20]]), ficha("019-2", "16/09/2026", [["3-AZ-A", 20]])]);
    const [a, b] = rehacerTanda(guias, tandaT6(10), todas);
    expect(a.estado).toBe("lista");
    expect(b.estado).toBe("bloqueada");
    const [a2, b2] = rehacerTanda(guias, tandaT6(10), (g) => ({ marcada: g.clave !== "g0", crearTala: true }));
    expect(a2.estado).toBe("lista");
    expect(b2.estado).toBe("lista");
    expect(b2.sobreAutorizado).toEqual([]);
    expect(esImportable(b2, true)).toBe(true);
  });

  it("T9 sigue al interruptor: con la tala de la 1.ª apagada, la 2.ª ya no pasa el cupo (20 + 20 > 30 → 20 ≤ 30)", () => {
    const cupos: ContextoTanda["cupos"] = [
      {
        planId: "P1",
        entrada: {
          censo: [
            { treeCode: "2-AZ", speciesCommon: AZ.comun, volumenEstimadoM3: 20 },
            { treeCode: "3-AZ", speciesCommon: AZ.comun, volumenEstimadoM3: 20 },
          ],
          talas: [],
          autorizadas: [{ speciesCommon: AZ.comun, volumenAutorizadoM3: 30 }],
          soloCenso: true,
        },
      },
    ];
    const guias = base([ficha("019-1", "15/09/2026", [["2-AZ-Q", 20]]), ficha("019-2", "16/09/2026", [["3-AZ-A", 20]])]);
    const sinT6: ContextoTanda = { cupos, t6: [] };
    expect(rehacerTanda(guias, sinT6, todas)[1].sobreCupo?.conTala).toEqual([expect.objectContaining({ totalConLaGuiaM3: 40, excesoM3: 10, exigeMotivo: true })]);
    const apagada = rehacerTanda(guias, sinT6, (g) => ({ marcada: true, crearTala: g.clave !== "g0" }));
    expect(apagada[1].sobreCupo?.conTala).toEqual([]);
  });

  it("el MISMO árbol en dos guías: desmarcar la 1.ª deja la tala de la 2.ª como nueva con SUS trozas (25, no 50)", () => {
    const cupos: ContextoTanda["cupos"] = [
      {
        planId: "P1",
        entrada: {
          censo: [{ treeCode: "2-AZ", speciesCommon: AZ.comun, volumenEstimadoM3: 20 }],
          talas: [],
          autorizadas: [{ speciesCommon: AZ.comun, volumenAutorizadoM3: 45 }],
          soloCenso: true,
        },
      },
    ];
    const guias = base([ficha("019-1", "15/09/2026", [["2-AZ-Q", 25]]), ficha("019-2", "16/09/2026", [["2-AZ-R", 25]])]);
    // La revisión arma la 2.ª contando la 1.ª: amplía 25 → 50, y pasa lo autorizado (50 de 45).
    expect(guias[1].talas.map((t) => [t.estado, t.volumeM3])).toEqual([["ampliar", 50]]);
    const [, b] = rehacerTanda(guias, { cupos, t6: [] }, todas);
    expect(b.sobreCupo?.conTala).toEqual([expect.objectContaining({ totalConLaGuiaM3: 50, excesoM3: 5 })]);
    // Sin la 1.ª, el servidor crearía la tala con 2-AZ-R sola: 25 de 45.
    const [, b2] = rehacerTanda(guias, { cupos, t6: [] }, (g) => ({ marcada: g.clave !== "g0", crearTala: true }));
    expect(b2.talas.map((t) => [t.estado, t.volumeM3, t.talaExistente])).toEqual([["nueva", 25, null]]);
    expect(b2.sobreCupo?.conTala).toEqual([]);
    // Y rehacer otra vez con todas vuelve a lo de la revisión (parte siempre de `base`).
    expect(rehacerTanda([guias[0], b2], { cupos, t6: [] }, todas)[1].talas[0]).toMatchObject({ estado: "ampliar", volumeM3: 50 });
  });

  it("la tala nueva con otra especie que la del censo se avisa (la importación la rechazaría): bloquea sólo con tala", () => {
    const cupos: ContextoTanda["cupos"] = [
      { planId: "P1", entrada: { censo: [{ treeCode: "2-AZ", speciesCommon: AZ.comun, volumenEstimadoM3: 20 }], talas: [], autorizadas: [], soloCenso: true } },
    ];
    const f = ficha("019-1", "15/09/2026", [["2-AZ-Q", 5]]);
    (f.trozas[0] as { comun: string | null; cientifico: string | null }).comun = "Tornillo";
    (f.trozas[0] as { comun: string | null; cientifico: string | null }).cientifico = null;
    const [g] = rehacerTanda(base([f]), { cupos, t6: [] }, todas);
    const aviso = g.avisos.find((a) => a.codigo === "especie_distinta_al_censo");
    expect(aviso).toMatchObject({ nivel: "bloquea", soloConTala: true });
    expect(aviso?.mensaje).toContain(`El árbol 2-AZ es ${AZ.comun} en el censo, no Tornillo`);
    expect(g.estado).toBe("bloqueada");
    expect(g.estadoSinTala).toBe("lista");
  });
});
