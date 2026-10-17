/**
 * El N° solo no identifica la guía (29-09-2026, memoria
 * `numero-de-guia-tramo-a-tramo`): dos titulares comparten la serie 019-001 y
 * pueden tener el MISMO N°. Las búsquedas por N° de las capas del puente TH→CTP
 * exigen el mismo titular o permiso cuando el llamador lo tiene, y con dos
 * candidatas de dueños distintos sin con qué elegir dicen «ambigua» — nunca
 * devuelven la primera.
 *
 * Base simulada: un `prisma` falso con las filas justas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    guardadas: [] as Record<string, unknown>[],
    gtfs: [] as Record<string, unknown>[],
    ingresos: [] as Record<string, unknown>[],
  };
  const termina = (v: unknown, w: { endsWith?: string } | undefined) =>
    !w?.endsWith || String(v ?? "").toLowerCase().endsWith(w.endsWith.toLowerCase());
  const prisma = {
    forestGuiaGuardada: {
      findMany: vi.fn(
        async (q: {
          where: {
            tenantId: string;
            id?: { in?: string[]; not?: string };
            gtfNumber?: { endsWith: string };
            OR?: { gtfNumber?: { endsWith: string }; numeroRegistro?: string }[];
          };
        }) =>
          estado.guardadas.filter(
            (g) =>
              g.tenantId === q.where.tenantId &&
              !g.deletedAt &&
              (!q.where.id?.in || q.where.id.in.includes(g.id as string)) &&
              (!q.where.id?.not || q.where.id.not !== g.id) &&
              termina(g.gtfNumber, q.where.gtfNumber) &&
              (!q.where.OR ||
                q.where.OR.some((o) => (o.gtfNumber ? termina(g.gtfNumber, o.gtfNumber) : o.numeroRegistro === g.numeroRegistro))),
          ),
      ),
      findFirst: vi.fn(async (q: { where: { id: string; tenantId: string } }) =>
        estado.guardadas.find((g) => g.id === q.where.id && g.tenantId === q.where.tenantId) ?? null,
      ),
    },
    forestGtf: {
      findMany: vi.fn(async (q: { where: { tenantId: string; gtfNumber?: { endsWith: string } } }) =>
        estado.gtfs.filter((g) => g.tenantId === q.where.tenantId && !g.deletedAt && termina(g.gtfNumber, q.where.gtfNumber)),
      ),
    },
    woodEntry: {
      findMany: vi.fn(async (q: { where: { tenantId: string; gtfNumber?: { endsWith: string } } }) =>
        estado.ingresos.filter((e) => e.tenantId === q.where.tenantId && termina(e.gtfNumber, q.where.gtfNumber)),
      ),
    },
  };
  return { estado, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { GtfNumeroDB } from "@/lib/db/gtf-numero.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";

const T = "t-prueba";
const CHIVIS = "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS";
const QUIN = "QUINCHUNLLA PEREZ, NELLY";

beforeEach(() => {
  /* El mismo N° 019-001-0000013 en dos talonarios, escrito de dos formas
     (la base sólo admite una guardada viva por el MISMO texto). */
  H.estado.guardadas = [
    { id: "g-quin", tenantId: T, gtfNumber: "019-001-0000013", titularNombre: QUIN, permisoCodigo: "19-SEC/REG-PLT-2018-020", deletedAt: null },
    { id: "g-chivis", tenantId: T, gtfNumber: "19-001-13", titularNombre: CHIVIS, permisoCodigo: "19-SEC/REG-PLT-2021-017", deletedAt: null },
  ];
  H.estado.gtfs = [
    { id: "th-quin", tenantId: T, gtfNumber: "019-001-0000013", titularName: QUIN, tituloHabilitante: null, deletedAt: null },
    { id: "th-chivis", tenantId: T, gtfNumber: "19-001-13", titularName: CHIVIS, tituloHabilitante: null, deletedAt: null },
  ];
  H.estado.ingresos = [
    { id: "i1", tenantId: T, gtfNumber: "019-001-0000013", providerName: QUIN, originCode: "19-SEC/REG-PLT-2018-020", libroNro: 7 },
  ];
});

describe("GuiasGuardadasDB — la guardada de ESTE titular, o «ambigua»", () => {
  it("con el titular (escrito distinto) o el permiso, la suya", async () => {
    const a = await GuiasGuardadasDB.porNumeroGtf(T, "019-001-0000013", { titular: "C.N. Santa Rosa de Chivis" });
    expect(a?.id).toBe("g-chivis");
    const b = await GuiasGuardadasDB.porNumeroGtf(T, "19-001-0000013", { permiso: "19 SEC REG PLT 2018 020" });
    expect(b?.id).toBe("g-quin");
  });

  it("sin titular ni permiso, dos candidatas → «ambigua» y porNumeroGtf devuelve null (no la primera)", async () => {
    const e = await GuiasGuardadasDB.eleccionPorNumeroGtf(T, "019-001-0000013");
    expect(e.estado).toBe("ambigua");
    expect(await GuiasGuardadasDB.porNumeroGtf(T, "019-001-0000013")).toBeNull();
    expect(await GuiasGuardadasDB.filaPor(T, { gtfNumber: "019-001-0000013" })).toBeNull();
  });

  it("de un tercer titular: ninguna", async () => {
    expect(await GuiasGuardadasDB.porNumeroGtf(T, "019-001-0000013", { titular: "CCNN SAN LUIS DE CHINCHIGUANI" })).toBeNull();
  });

  it("una sola candidata sin identidad: esa", async () => {
    H.estado.guardadas = H.estado.guardadas.slice(0, 1);
    expect((await GuiasGuardadasDB.porNumeroGtf(T, "19-001-13"))?.id).toBe("g-quin");
  });
});

describe("GtfNumeroDB.ingresosVivos — «¿ya entró?» de ESTA guía", () => {
  it("el ingreso de Quinchunlla no es la guía de Chivis con el mismo N°", async () => {
    expect(await GtfNumeroDB.ingresosVivos(H.prisma as never, T, "19-001-13", { identidad: { titular: CHIVIS } })).toEqual([]);
    const suyos = await GtfNumeroDB.ingresosVivos(H.prisma as never, T, "19-001-13", { identidad: { titular: QUIN } });
    expect(suyos.map((e) => e.id)).toEqual(["i1"]);
  });

  it("sin identidad vienen todos (el llamador decide)", async () => {
    expect((await GtfNumeroDB.ingresosVivos(H.prisma as never, T, "019-001-0000013")).length).toBe(1);
  });
});

describe("ForestGtfDB.findByNumber — tramo a tramo y por dueño", () => {
  it("dos guías del libro con el mismo N° y sin titular buscado → «ambigua»", async () => {
    const e = await ForestGtfDB.findByNumber(T, "019-001-0000013");
    expect(e.estado).toBe("ambigua");
  });

  it("con el titular, la suya; escrita sin ceros también", async () => {
    const e = await ForestGtfDB.findByNumber(T, "19-001-0000013", { titular: CHIVIS });
    expect(e.estado === "una" && e.guia.id).toBe("th-chivis");
  });

  it("ninguna con ese N°", async () => {
    expect((await ForestGtfDB.findByNumber(T, "019-001-0000099")).estado).toBe("ninguna");
  });
});

describe("GuiasGuardadasDB.crear — el 409 dice de quién es la otra (hallazgo 4)", () => {
  it("«Esa guía ya está guardada (GTF … de QUINCHUNLLA …)»", async () => {
    H.estado.guardadas = H.estado.guardadas.slice(0, 1);
    const r = await GuiasGuardadasDB.crear(
      T,
      {
        numeroRegistro: null,
        gtfNumber: "19-001-13",
        gtfDate: null,
        titularNombre: CHIVIS,
        titularDoc: null,
        permisoCodigo: null,
        contratoId: null,
        notas: null,
        serforGtf: null,
        serforConsultadaEn: null,
      },
      "prueba",
    );
    expect(r).toMatchObject({ ok: false, status: 409, error: "ya_guardada", id: "g-quin" });
    expect(!r.ok && r.message).toBe(`Esa guía ya está guardada (GTF 019-001-0000013 de ${QUIN}).`);
  });
});
