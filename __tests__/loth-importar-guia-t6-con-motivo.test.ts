/**
 * T6 con motivo al IMPORTAR una guía que SERFOR ya emitió (ADR-468, 04-10).
 *
 * Contra `ForestLothImportarDB.importarGuia` con el despacho REAL
 * (`despacharConGuiaEnTx` → `enforceInvariants` → `enforceT6`) sobre un
 * `prisma` falso que ve lo que escribe la misma tx; la revisión de la guía
 * se fija. La ruta va con el `requireAdmin` real y `resolverFuentes` real
 * (sólo se finge la sesión y la red de SERFOR): «verificada» sale del
 * servidor, nunca del cuerpo.
 *
 * Escenario: Azúcar huayo con 45 m³ AUTORIZADOS; ya salió 9-AZ-A (10 m³).
 * La guía despacha 2-AZ-Q y 2-AZ-R (20 + 20) → 50 de 45, exceso 5.
 *
 * Revisión independiente + seguridad (04-10): la excepción exige además que
 * el título de la guía sea el del permiso, que el Trozado del libro mida lo
 * que dice la guía, y `confirmaDespacho`; el evento lleva el aporte propio de
 * la guía, la IP y el navegador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const estado = {
    especies: [] as Fila[],
    lineas: [] as Fila[],
    gtfs: [] as Fila[],
    audit: [] as Fila[],
    payload: null as null | { username: string; role: string; tenantId: string },
    ficha: null as unknown,
    /** Lo que devuelve la revisión fijada (`revisarGuia`): las trozas de la guía. */
    trozasRev: [] as Fila[],
  };
  const enSeccion = (l: Fila, s: unknown) =>
    typeof s === "string" ? l.section === s : !s || (s as { in: string[] }).in.includes(String(l.section));
  const conTroza = (l: Fila, t: unknown) =>
    t == null ? true : typeof t === "string" ? l.trozaCode === t : (t as { in: string[] }).in.includes(String(l.trozaCode));
  const vivas = (where: Fila) =>
    estado.lineas.filter(
      (l) => l.tenantId === where.tenantId && (l.status ?? "registrado") === "registrado" && enSeccion(l, where.section) && conTroza(l, where.trozaCode),
    );
  const tx = {
    $queryRaw: async () => [{ ok: true }],
    $executeRaw: async () => 1,
    forestCensusTree: { findMany: async () => [] },
    forestPlan: { findFirst: async () => ({ planType: "PO", planNumber: "PO-1", tituloHabilitante: null, parcelaCorta: null }) },
    forestPlanSpecies: {
      findMany: async ({ where }: { where: Fila }) => estado.especies.filter((s) => s.tenantId === where.tenantId && s.planId === where.planId),
      aggregate: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) => {
        const v = estado.especies
          .filter((s) => s.tenantId === where.tenantId && where.id.in.includes(String(s.id)))
          .map((s) => s.volumenAutorizadoM3)
          .filter((x): x is number => typeof x === "number");
        return { _sum: { volumenAutorizadoM3: v.length ? v.reduce((a, b) => a + b, 0) : null } };
      },
    },
    forestLothEntry: {
      findFirst: async ({ where }: { where: Fila }) => vivas(where)[0] ?? null,
      findMany: async ({ where }: { where: Fila }) => vivas(where),
      aggregate: async () => ({ _max: { lineNo: estado.lineas.length } }),
      groupBy: async ({ where }: { where: Fila }) => {
        const por = new Map<string, Fila & { _sum: { volumeM3: number; quantity: number } }>();
        for (const l of vivas(where)) {
          const k = `${String(l.speciesCommon)}|${String(l.speciesScientific)}`;
          const g = por.get(k) ?? { speciesCommon: l.speciesCommon, speciesScientific: l.speciesScientific, _sum: { volumeM3: 0, quantity: 0 } };
          g._sum.volumeM3 += Number(l.volumeM3 ?? 0);
          g._sum.quantity += Number(l.quantity ?? 0);
          por.set(k, g);
        }
        return [...por.values()];
      },
      // Como la base: lo escrito en la tx lo ve la medición de la troza siguiente.
      create: async ({ data }: { data: Fila }) => {
        const fila = { ...data, id: `l${estado.lineas.length + 1}` };
        estado.lineas.push(fila);
        return fila;
      },
    },
    forestGtf: {
      // El control de repetidos del despacho a mano (`exigirSinRepetir`): no hay otra guía con ese N°.
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: { data: Fila }) => {
        const fila = { ...data, id: `g${estado.gtfs.length + 1}` };
        estado.gtfs.push(fila);
        return fila;
      },
    },
    activityLog: {
      create: async ({ data }: { data: Fila }) => {
        estado.audit.push(data);
        return data;
      },
    },
  };
  return { estado, tx };
});

vi.mock("@/lib/prisma", () => ({ prisma: { ...H.tx, $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(H.tx) } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.estado.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/forestal/serfor-gtf-fetch", () => ({
  consultarGtfEnSerfor: async () => ({ ok: true, resultado: { estado: "encontrada", gtf: H.estado.ficha, mensaje: null } }),
}));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => [], closedPeriodOf: async () => null } }));
vi.mock("@/lib/db/forest-loth-poa.db", () => ({ ForestLothPoaDB: { get: async () => ({ dmcOverrides: {} }) } }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: { getPlan: async () => null, crearPlanEnTx: async () => null, despuesDelAlta: () => {} },
  ContratoAjenoError: class ContratoAjenoError extends Error {},
}));
vi.mock("@/lib/db/gtf-numero.db", () => ({ GtfNumeroDB: { bloquear: async () => {} }, ESTADOS_SIN_INGRESO: [] }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: () => {} }));
vi.mock("@/lib/forestal/loth-importar-guia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forestal/loth-importar-guia")>()),
  revisarGuia: () => ({ yaImportada: null, avisos: [], talas: [], trozas: H.estado.trozasRev }),
}));

import { ForestLothDB, LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { rehacerTanda } from "@/lib/forestal/loth-importar-guia-tanda";
import { faltaMotivoDeCupo, pideMotivo, esImportable } from "@/components/admin/forestal/hooks/importar-guias-pantalla";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { GuiaParaRevisar, LibroDeLaGuia } from "@/lib/forestal/loth-importar-guia";
import { POST as postImportar } from "@/app/api/admin/forestal/loth/importar-guia/route";

const T = "tenant-blas";
const GTF = "019-001-0000123";
const REG = "1-10-0474633";
const AZ = { comun: "Azúcar huayo", cientifico: "Hymenaea courbaril" };
const MOTIVO = "SERFOR emitió la guía con el volumen medido en el bosque";

const fichaDe = (gtfNumber: string, registro: string, trozas: [string, number][], numeroTitulo = "PO-1") =>
  ({
    gtfNumber,
    numeroRegistro: registro,
    fechaExpedicion: "15/09/2026",
    estado: "Vigente",
    titular: "Blas",
    numeroTitulo,
    trozas: trozas.map(([codificacion, volumen]) => ({
      codificacion, dimensiones: "90.0 X 85.0 X 11.0", ...AZ, tipoProducto: "Troza", presentacion: null, cantidad: 1, unidad: "m3", volumen,
    })),
  }) as unknown as GtfSerfor;
const FICHA = fichaDe(GTF, REG, [["2-AZ-Q", 20], ["2-AZ-R", 20]]);

/** La revisión fijada: cada troza de la guía YA estaba en el Trozado del plan, con el volumen de la GUÍA. */
const revisionDe = (trozas: [string, number][]) =>
  trozas.map(([trozaCode, volumeM3]) => ({ trozaCode, treeCode: trozaCode.slice(0, 4), ...{ speciesCommon: AZ.comun, speciesScientific: AZ.cientifico }, estado: "ya_trozada", volumeM3 }));

const trozado = (trozaCode: string, volumeM3: number, tenantId = T) => ({
  tenantId, planId: "P1", section: "trozado", trozaCode, treeCode: trozaCode.slice(0, 4), speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumeM3,
});

const importar = (
  extra: { ficha?: GtfSerfor; verificada?: boolean; motivoSobreCupo?: string; puedeExcederDespacho?: boolean; confirmaDespacho?: boolean } = {},
) =>
  ForestLothImportarDB.importarGuia(T, {
    ficha: extra.ficha ?? FICHA,
    verificada: extra.verificada ?? true,
    planDestino: { tipo: "existente", planId: "P1" },
    crearTala: false,
    createdBy: "qa-admin",
    motivoSobreCupo: extra.motivoSobreCupo ?? null,
    puedeExcederCupo: extra.puedeExcederDespacho,
    puedeExcederDespacho: extra.puedeExcederDespacho,
    // La vista mostró el exceso (por defecto): sin esto, T6 duro.
    confirmaDespacho: extra.confirmaDespacho ?? true,
    sesion: { ipAddress: "10.0.0.7", userAgent: "Vitest" },
  });

/** Lo que lee `libroDe`: el Trozado del negocio (con el volumen ESCRITO en el libro). */
const libroDeLaBase = (): LibroDeLaGuia =>
  ({
    trozados: H.estado.lineas
      .filter((l) => l.tenantId === T && l.section === "trozado")
      .map((l, i) => ({ ...l, id: `z${i}`, lineNo: i + 1, treeCode: l.treeCode, referencial: null, gtfNumber: null })),
    talas: [],
    salidas: [],
    guias: [],
    cierres: [],
  }) as unknown as LibroDeLaGuia;

const despachosDeLaGuia = () => H.estado.lineas.filter((l) => l.section === "despacho_troza" && l.gtfNumber === GTF);

beforeEach(() => {
  vi.restoreAllMocks();
  H.estado.especies = [
    { id: "s1", tenantId: T, planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumenAutorizadoM3: 45 },
    // Otro negocio con la misma especie y el mismo plan id: ni suma techo ni se mira.
    { id: "s9", tenantId: "otro", planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico, volumenAutorizadoM3: 900 },
  ];
  H.estado.lineas = [
    trozado("9-AZ-A", 10),
    { tenantId: T, planId: "P1", section: "despacho_troza", trozaCode: "9-AZ-A", gtfNumber: "019-001-0000001" },
    trozado("2-AZ-Q", 20),
    trozado("2-AZ-R", 20),
    // Lo de otro negocio no cuenta como movilizado de éste.
    trozado("7-AZ-X", 500, "otro"),
    { tenantId: "otro", planId: "P1", section: "despacho_troza", trozaCode: "7-AZ-X" },
  ];
  H.estado.gtfs = [];
  H.estado.audit = [];
  H.estado.ficha = FICHA;
  H.estado.trozasRev = revisionDe([["2-AZ-Q", 20], ["2-AZ-R", 20]]);
  vi.spyOn(ForestLothDB, "getActiveCaratula").mockResolvedValue(null as never);
  vi.spyOn(ForestLothDB, "auditarDespachoConGuia").mockImplementation(() => {});
  vi.spyOn(ForestLothImportarDB, "bajoDmcDe").mockResolvedValue(new Map());
  vi.spyOn(ForestLothImportarDB, "planesYContratos").mockResolvedValue({
    planes: [
      {
        id: "P1", planType: "PO", planNumber: "PO-1", tituloHabilitante: null, titularName: "Blas", contratoId: null,
        especies: [{ planId: "P1", speciesCommon: AZ.comun, speciesScientific: AZ.cientifico }],
      },
    ],
    contratos: [],
  } as never);
  vi.spyOn(ForestLothImportarDB, "libroDe").mockImplementation(async () => libroDeLaBase() as never);
});

describe("T6 con motivo en la importación (ADR-468)", () => {
  it("verificada + motivo + admin → importada, y `loth_despacho_sobre_autorizado` con 10 + 40 = 50 de 45, exceso 5", async () => {
    const r = await importar({ motivoSobreCupo: `  ${MOTIVO}​ `, puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "importada", codigo: null, volumenM3: 40 });
    expect(r.mensaje).toContain(`Pasa lo autorizado de ${AZ.comun} (exceso ${fmtM3(5)} m³)`);
    expect(despachosDeLaGuia()).toHaveLength(2);
    expect(H.estado.audit).toHaveLength(1);
    expect(H.estado.audit[0]).toMatchObject({
      tenantId: T,
      action: "loth_despacho_sobre_autorizado",
      entity: "ForestGtf",
      entityId: H.estado.gtfs[0].id,
      user: "qa-admin",
      ipAddress: "10.0.0.7",
      userAgent: "Vitest",
    });
    const detail = String(H.estado.audit[0].detail);
    expect(detail).toContain(`GTF ${GTF} (registro SERFOR ${REG}), verificada en SERFOR`);
    expect(detail).toContain(`ya habían salido ${fmtM3(10)} m³ + esta guía ${fmtM3(40)} m³ = ${fmtM3(50)} de ${fmtM3(45)} m³ autorizados`);
    expect(detail).toContain(`exceso ${fmtM3(5)} m³, de los que esta guía aporta ${fmtM3(5)} m³. Motivo: ${MOTIVO}`);
    expect(detail.endsWith(MOTIVO)).toBe(true);
  });

  it("dentro de lo autorizado con motivo → importada SIN evento (el motivo no fabrica un exceso)", async () => {
    H.estado.especies[0].volumenAutorizadoM3 = 60;
    const r = await importar({ motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(r.estado).toBe("importada");
    expect(r.mensaje).not.toContain("Pasa lo autorizado");
    expect(H.estado.audit).toHaveLength(0);
  });

  it("verificada SIN motivo → T6_EXCESO_AUTORIZADO, el mismo rechazo de siempre, sin evento", async () => {
    const r = await importar({ puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(r.mensaje).toContain(`El POA autoriza 45 m³ de ${AZ.comun} y ya se movilizaron 30 m³; este despacho de 20 m³ excede lo autorizado.`);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("NO verificada (foto/PDF) + motivo + admin → T6_EXCESO_AUTORIZADO", async () => {
    const r = await importar({ verificada: false, motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(H.estado.audit).toHaveLength(0);
  });

  it("verificada + motivo SIN rol decidido (encargado) → T6_EXCESO_AUTORIZADO", async () => {
    const r = await importar({ motivoSobreCupo: MOTIVO, puedeExcederDespacho: false });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(H.estado.audit).toHaveLength(0);
  });

  it("motivo de menos de 5 letras («.....») → T6_EXCESO_AUTORIZADO", async () => {
    const r = await importar({ motivoSobreCupo: ".....", puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
  });

  it("motivo + admin SIN `confirmaDespacho` (el motivo era para T9) → T6, y el rechazo dice por qué", async () => {
    const r = await importar({ motivoSobreCupo: MOTIVO, puedeExcederDespacho: true, confirmaDespacho: false });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(r.mensaje).toContain("no se confirmó en la vista previa el despacho sobre lo autorizado");
    expect(H.estado.audit).toHaveLength(0);
  });

  it("troza YA trozada con 25 m³ en el libro y 2,5 en la ficha → T6 (no se exime un volumen que SERFOR no verificó)", async () => {
    H.estado.lineas.find((l) => l.trozaCode === "2-AZ-Q" && l.section === "trozado")!.volumeM3 = 25;
    H.estado.trozasRev = revisionDe([["2-AZ-Q", 2.5], ["2-AZ-R", 20]]);
    const r = await importar({ ficha: fichaDe(GTF, REG, [["2-AZ-Q", 2.5], ["2-AZ-R", 20]]), motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(r.mensaje).toContain(`2-AZ-Q: ${fmtM3(25)} m³ en el Trozado, ${fmtM3(2.5)} m³ en la guía`);
    expect(H.estado.audit).toHaveLength(0);
    expect(H.estado.gtfs).toHaveLength(0);
  });

  it("verificada con el título de OTRO permiso, importada a éste → T6 (verificada ≠ de este permiso)", async () => {
    const r = await importar({ ficha: fichaDe(GTF, REG, [["2-AZ-Q", 20], ["2-AZ-R", 20]], "PO-99"), motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(r.mensaje).toContain("el título de la guía (PO-99) no es el del permiso elegido (PO PO-1 · Blas)");
    expect(H.estado.audit).toHaveLength(0);
  });

  it("DOS guías verificadas con motivo → dos eventos; el 2.º cuenta lo de la 1.ª en «ya habían salido» y dice su aporte propio", async () => {
    expect((await importar({ motivoSobreCupo: MOTIVO, puedeExcederDespacho: true })).estado).toBe("importada");
    H.estado.lineas.push(trozado("2-AZ-S", 15));
    H.estado.trozasRev = revisionDe([["2-AZ-S", 15]]);
    const r2 = await importar({ ficha: fichaDe("019-001-0000124", "1-10-0474634", [["2-AZ-S", 15]]), motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(r2.estado).toBe("importada");
    expect(H.estado.audit).toHaveLength(2);
    const [d1, d2] = H.estado.audit.map((a) => String(a.detail));
    expect(d1).toContain(`ya habían salido ${fmtM3(10)} m³ + esta guía ${fmtM3(40)} m³ = ${fmtM3(50)} de ${fmtM3(45)} m³`);
    expect(d1).toContain(`exceso ${fmtM3(5)} m³, de los que esta guía aporta ${fmtM3(5)} m³`);
    // 10 + 40 de la 1.ª = 50 ya salidos; + 15 = 65 de 45 → exceso 20, de los que la 2.ª pone 15.
    expect(d2).toContain(`GTF 019-001-0000124`);
    expect(d2).toContain(`ya habían salido ${fmtM3(50)} m³ + esta guía ${fmtM3(15)} m³ = ${fmtM3(65)} de ${fmtM3(45)} m³`);
    expect(d2).toContain(`exceso ${fmtM3(20)} m³, de los que esta guía aporta ${fmtM3(15)} m³`);
  });
});

describe("El despacho a mano (fuera del importador): T6 igual que antes", () => {
  it("despacharConGuiaEnTx sin excepción → T6_EXCESO_AUTORIZADO con el mismo detalle (30 movilizado + 20 > 45)", async () => {
    const err = await ForestLothDB.despacharConGuiaEnTx(
      H.tx as never,
      T,
      {
        gtfNumber: GTF,
        gtfDate: new Date("2026-09-15T00:00:00Z"),
        trozaCodes: ["2-AZ-Q", "2-AZ-R"],
        gtfDatos: { titulos: [], transportista: { nombre: "", docNumero: "" }, vehiculo: { conductor: "", licencia: "", placa: "" }, traslado: { puntoPartida: "" }, destinatario: { nombre: "" }, observaciones: "" } as never,
        titularName: "Blas",
        createdBy: "almacen",
      },
      null,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LothInvariantError);
    expect(err).toMatchObject({ code: "T6_EXCESO_AUTORIZADO", detail: { species: AZ.comun, autorizado: 45, movilizado: 30, pedido: 20 } });
    expect(H.estado.gtfs).toHaveLength(0);
  });
});

/* ── La ruta: el rol de la sesión, la verificación del servidor ───────────── */

describe("POST /api/admin/forestal/loth/importar-guia — T6 con motivo", () => {
  let ip = 0;
  const post = (item: Record<string, unknown>) =>
    postImportar(
      new NextRequest("http://localhost/api/admin/forestal/loth/importar-guia", {
        method: "POST",
        headers: {
          cookie: "buleje-admin-sess=token-falso",
          "content-type": "application/json",
          "x-forwarded-for": `10.8.0.${++ip}`,
          "user-agent": "Chrome QA",
        },
        body: JSON.stringify({ items: [{ planDestino: { tipo: "existente", planId: "P1" }, crearTala: false, ...item }] }),
      }),
    );
  const deSerfor = { fuente: { tipo: "serfor", numeroRegistro: REG }, confirmaDespacho: true };

  beforeEach(() => {
    H.estado.payload = { username: "qa-admin", role: "admin", tenantId: T };
  });

  it("SERFOR (verificada por el servidor) + motivo + admin → 201 importada + evento con el usuario de la sesión", async () => {
    const r = await post({ ...deSerfor, motivoSobreCupo: MOTIVO });
    expect(r.status).toBe(201);
    expect((await r.json()).resultados[0]).toMatchObject({ estado: "importada" });
    expect(H.estado.audit).toEqual([
      expect.objectContaining({ action: "loth_despacho_sobre_autorizado", user: "qa-admin", ipAddress: `10.8.0.${ip}`, userAgent: "Chrome QA" }),
    ]);
  });

  it("dueño (owner) también puede", async () => {
    H.estado.payload = { username: "dueno", role: "owner", tenantId: T };
    expect((await (await post({ ...deSerfor, motivoSobreCupo: MOTIVO })).json()).resultados[0].estado).toBe("importada");
  });

  it("SERFOR + motivo SIN `confirmaDespacho` en el cuerpo → rechazada T6", async () => {
    const r = await post({ fuente: deSerfor.fuente, motivoSobreCupo: MOTIVO });
    expect((await r.json()).resultados[0]).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(H.estado.audit).toHaveLength(0);
  });

  it("SERFOR sin motivo → rechazada T6, nada escrito", async () => {
    const r = await post(deSerfor);
    expect(r.status).toBe(200);
    expect((await r.json()).resultados[0]).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(H.estado.gtfs).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("ficha de foto/PDF + motivo, aunque el cuerpo diga `verificada: true` → rechazada T6 (lo decide el servidor)", async () => {
    const r = await post({ fuente: { tipo: "ficha", ficha: FICHA, verificada: true }, verificada: true, confirmaDespacho: true, motivoSobreCupo: MOTIVO });
    expect((await r.json()).resultados[0]).toMatchObject({ estado: "rechazada", codigo: "T6_EXCESO_AUTORIZADO" });
    expect(H.estado.audit).toHaveLength(0);
  });

  it("encargado (manager) con motivo → 403, nada escrito", async () => {
    H.estado.payload = { username: "enc", role: "manager", tenantId: T };
    const r = await post({ ...deSerfor, motivoSobreCupo: MOTIVO });
    expect(r.status).toBe(403);
    expect(H.estado.gtfs).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("sin sesión → 401", async () => {
    H.estado.payload = null;
    expect((await post({ ...deSerfor, motivoSobreCupo: MOTIVO })).status).toBe(401);
  });
});

/* ── La vista previa: verificada + admin pide motivo; el resto, como hoy ──── */

describe("Vista previa: T6 con motivo sólo para la guía verificada y admin/dueño", () => {
  const guia = (verificada: boolean): GuiaParaRevisar =>
    ({ clave: "c0", fuente: { tipo: verificada ? "serfor" : "ficha", ficha: FICHA } as never, ficha: FICHA, verificada, falla: null, planElegido: "P1" }) as GuiaParaRevisar;

  it("verificada + admin → lista, sin aviso que bloquee, `t6ConMotivo` con las cuentas; sin motivo falta, con motivo no", async () => {
    const { guias: [g], tanda } = await ForestLothImportarDB.vistaPrevia(T, [guia(true)], { puedePasarT6: true });
    expect(tanda.puedePasarT6).toBe(true);
    expect(g.estado).toBe("lista");
    expect(esImportable(g, false)).toBe(true);
    expect(g.t6ConMotivo).toBe(true);
    expect(g.avisos.some((a) => a.codigo === "exceso_autorizado")).toBe(false);
    expect(g.sobreAutorizado).toEqual([expect.objectContaining({ autorizadoM3: 45, yaSalioM3: 10, despachaM3: 40, excesoM3: 5 })]);
    expect(pideMotivo(g, false)).toBe(true);
    expect(faltaMotivoDeCupo(g, false, "")).toBe(true);
    expect(faltaMotivoDeCupo(g, false, MOTIVO)).toBe(false);
    // La vista dice el mismo exceso que deja el evento de la importación.
    await importar({ motivoSobreCupo: MOTIVO, puedeExcederDespacho: true });
    expect(String(H.estado.audit[0].detail)).toContain(`exceso ${fmtM3(g.sobreAutorizado?.[0].excesoM3 ?? -1)} m³`);
  });

  it("verificada vista por un encargado → bloqueada: «Sólo el dueño o el administrador…»", async () => {
    const { guias: [g] } = await ForestLothImportarDB.vistaPrevia(T, [guia(true)], { puedePasarT6: false });
    expect(g.estado).toBe("bloqueada");
    expect(g.t6ConMotivo).toBe(false);
    expect(g.avisos.find((a) => a.codigo === "exceso_autorizado")?.mensaje).toMatch(/^Sólo el dueño o el administrador pueden importarla, con motivo: /);
    expect(pideMotivo(g, false)).toBe(false);
  });

  it("NO verificada + admin → bloqueada como hoy: «No se puede importar, ni con motivo…»", async () => {
    const { guias: [g] } = await ForestLothImportarDB.vistaPrevia(T, [guia(false)], { puedePasarT6: true });
    expect(g.estado).toBe("bloqueada");
    expect(g.t6ConMotivo).toBe(false);
    expect(g.avisos.find((a) => a.codigo === "exceso_autorizado")?.mensaje).toMatch(/^No se puede importar, ni con motivo: /);
  });

  it("verificada + admin, pero con el título de OTRO permiso → bloqueada y el aviso dice por qué", async () => {
    const otra = fichaDe(GTF, REG, [["2-AZ-Q", 20], ["2-AZ-R", 20]], "PO-99");
    const x = { ...guia(true), ficha: otra, fuente: { tipo: "serfor", numeroRegistro: REG } } as GuiaParaRevisar;
    const { guias: [g] } = await ForestLothImportarDB.vistaPrevia(T, [x], { puedePasarT6: true });
    expect(g.estado).toBe("bloqueada");
    expect(g.t6ConMotivo).toBe(false);
    expect(g.avisos.find((a) => a.codigo === "exceso_autorizado")?.mensaje).toContain(
      "Aunque está verificada en SERFOR, el título de la guía (PO-99) no es el del permiso elegido (PO PO-1 · Blas).",
    );
  });

  it("verificada + admin, troza del libro con otro volumen que la ficha → bloqueada (mismo reparo que la importación)", async () => {
    H.estado.lineas.find((l) => l.trozaCode === "2-AZ-Q" && l.section === "trozado")!.volumeM3 = 25;
    const x = { ...guia(true), ficha: fichaDe(GTF, REG, [["2-AZ-Q", 2.5], ["2-AZ-R", 20]]) } as GuiaParaRevisar;
    const { guias: [g] } = await ForestLothImportarDB.vistaPrevia(T, [x], { puedePasarT6: true });
    expect(g.estado).toBe("bloqueada");
    expect(g.t6ConMotivo).toBe(false);
    expect(g.avisos.find((a) => a.codigo === "exceso_autorizado")?.mensaje).toContain(`2-AZ-Q: ${fmtM3(25)} m³ en el Trozado, ${fmtM3(2.5)} m³ en la guía`);
  });

  it("la pantalla rehace la tanda con el mismo permiso que dio el servidor (y sin él, bloquea)", async () => {
    const { guias, tanda } = await ForestLothImportarDB.vistaPrevia(T, [guia(true)], { puedePasarT6: true });
    const elegir = () => ({ marcada: true, crearTala: false });
    expect(rehacerTanda(guias, tanda, elegir)[0].t6ConMotivo).toBe(true);
    expect(rehacerTanda(guias, { ...tanda, puedePasarT6: undefined }, elegir)[0].estado).toBe("bloqueada");
  });
});
