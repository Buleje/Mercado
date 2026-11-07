/**
 * PATCH parcial de una ficha del directorio (ADR-524): solo se escribe lo que
 * vino, `null` borra, los adjuntos se suman/quitan sin reemplazar la lista y
 * el cambio de RUC deja su nota en la bitácora.
 *
 * Bug que previene: el POST con `id` trataba el cuerpo como la fila entera y
 * el MCP borraba la cuenta, el RUC o los adjuntos que no mandaba.
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fila: Record<string, unknown> = {};
  const prisma = {
    forestParty: {
      findFirst: vi.fn(async () => ({ ...fila })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...fila, ...data })),
    },
    document: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  return { fila, prisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CONSUMO_VIGENTE: {} }));

import { datosDelPatch, ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { fichaPersonaSchema, parteInputSchema, partePatchSchema } from "@/lib/forestal/directorio";

type Antes = Parameters<typeof datosDelPatch>[0];

function antes(over: Partial<Antes> = {}): Antes {
  return {
    id: "p1",
    tenantId: "t1",
    nombre: "DRUCILA PEREZ",
    roles: ["arrendador"],
    docTipo: "DNI",
    docNumero: "80186494",
    ruc: "10801864941",
    rucEstado: "activo",
    rucEstadoDesde: null,
    cuentaCci: "00212345678901234567",
    banco: "BCP",
    notas: "nota vieja",
    adjuntos: [{ documentId: "d1", rotulo: "DNI", vinculadoEl: "2026-10-01T00:00:00.000Z" }],
    ...over,
  } as unknown as Antes;
}

const AHORA = new Date("2026-10-30T15:00:00Z");

describe("datosDelPatch", () => {
  it("solo toca las claves presentes (la cuenta y el RUC no viajan → no se escriben)", () => {
    const r = datosDelPatch(antes(), { whatsapp: "917013738" }, AHORA);
    expect(r.data).toEqual({ whatsapp: "917013738" });
    expect(r.tocados).toEqual(["whatsapp"]);
    expect(r.notasAuto).toEqual([]);
  });

  it("null y \"\" borran (no se guarda un vacío que finge ser dato)", () => {
    const r = datosDelPatch(antes(), { cuentaCci: null, banco: "" }, AHORA);
    expect(r.data).toMatchObject({ cuentaCci: null, banco: null });
  });

  it("los días se guardan como fecha UTC (sin correrse un día en Lima)", () => {
    const r = datosDelPatch(antes(), { dniVenceEl: "2031-05-20", nacimientoEl: null }, AHORA);
    expect((r.data.dniVenceEl as Date).toISOString()).toBe("2031-05-20T00:00:00.000Z");
    expect(r.data.nacimientoEl).toBeNull();
  });

  it("adjuntos: agrega sin repetir y conserva los que ya estaban", () => {
    const r = datosDelPatch(
      antes(),
      { adjuntosAgregar: [{ documentId: "d1", rotulo: "DNI otra vez" }, { documentId: "d2", rotulo: "Ficha RUC" }] },
      AHORA,
    );
    expect(r.data.adjuntos).toEqual([
      { documentId: "d1", rotulo: "DNI", vinculadoEl: "2026-10-01T00:00:00.000Z" },
      { documentId: "d2", rotulo: "Ficha RUC", vinculadoEl: AHORA.toISOString() },
    ]);
    expect(r.tocados).toContain("adjuntos (+1 −0)");
  });

  it("adjuntos: quitar saca solo ese papel", () => {
    const r = datosDelPatch(antes(), { adjuntosQuitar: ["d1"] }, AHORA);
    expect(r.data.adjuntos).toEqual([]);
  });

  it("sin adjuntos en el patch, la lista ni se toca", () => {
    const r = datosDelPatch(antes(), { notas: "nueva" }, AHORA);
    expect(r.data).not.toHaveProperty("adjuntos");
  });

  it("cambio de RUC → nota en la bitácora con el antes y el después", () => {
    const r = datosDelPatch(antes(), { ruc: "10 80186494 1" }, AHORA);
    expect(r.data.ruc).toBe("10801864941");
    expect(r.notasAuto).toEqual([]); // mismo RUC sin espacios: no es un cambio
    const r2 = datosDelPatch(antes(), { ruc: "20123456789" }, AHORA);
    expect(r2.notasAuto).toEqual(["Cambió el RUC: 10801864941 → 20123456789"]);
  });

  it("cambio de estado del RUC → nota con el desde", () => {
    const r = datosDelPatch(antes(), { rucEstado: "baja_definitiva", rucEstadoDesde: "2025-03-01" }, AHORA);
    expect(r.notasAuto).toEqual(["Cambió el estado del RUC: activo → baja definitiva (desde 2025-03-01)"]);
  });

  it("número de documento sin cambiar el tipo usa el tipo de antes", () => {
    const r = datosDelPatch(antes(), { docNumero: "80186495" }, AHORA);
    expect(r.data).toMatchObject({ docTipo: "DNI", docNumero: "80186495" });
  });
});

describe("partePatchSchema", () => {
  it("es estricto: una clave desconocida se rechaza en vez de ignorarse", () => {
    expect(partePatchSchema.safeParse({ claveSol: "x" }).success).toBe(false);
  });

  it("vacío es válido (no escribe nada)", () => {
    expect(partePatchSchema.safeParse({}).success).toBe(true);
  });

  it("una clave en las notas → rechazada", () => {
    expect(partePatchSchema.safeParse({ notas: "clave sol: ABCD1234" }).success).toBe(false);
  });
});

/**
 * Riesgo que señaló el carril frontend: la libreta y otras pantallas guardan
 * una ficha EXISTENTE con `POST` de la fila entera (`guardarParte` con id).
 * Ese camino no conoce los 10 campos de la ficha de persona ni los adjuntos:
 * si no vienen, no se tocan (no se pisan con null).
 */
describe("guardarParte con id (POST de la fila entera)", () => {
  const NUEVOS = Object.keys(fichaPersonaSchema.shape);

  it("los 10 campos de la ficha de persona no son parte del cuerpo del POST", () => {
    expect(NUEVOS).toHaveLength(10);
    const delPost = new Set(Object.keys(parteInputSchema.shape));
    expect(NUEVOS.filter((k) => delPost.has(k))).toEqual([]);
  });

  it("no escribe los campos nuevos ni los adjuntos que no vinieron", async () => {
    Object.assign(h.fila, antes({ dniVenceEl: new Date("2031-05-20T00:00:00Z"), estadoCivil: "casado" } as Partial<Antes>));
    await ForestDirectorioDB.guardarParte("t1", { id: "p1", roles: ["arrendador"], nombre: "Drucila Perez" } as Parameters<typeof ForestDirectorioDB.guardarParte>[1], "brandon");
    const llamada = h.prisma.forestParty.update.mock.calls.at(-1)?.[0] as { where: unknown; data: Record<string, unknown> };
    expect(llamada.data).toBeDefined();
    for (const k of [...NUEVOS, "adjuntos"]) expect(llamada.data).not.toHaveProperty(k);
    expect(h.prisma.forestParty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "p1", tenantId: "t1" }) }),
    );
  });

  it("si el cuerpo trae adjuntos, esos sí se escriben (la lista viene entera a propósito)", async () => {
    Object.assign(h.fila, antes());
    const adjuntos = [{ documentId: "d9", rotulo: "Contrato", vinculadoEl: "2026-10-30T00:00:00.000Z" }];
    await ForestDirectorioDB.guardarParte("t1", { id: "p1", roles: ["arrendador"], nombre: "Drucila Perez", adjuntos } as Parameters<typeof ForestDirectorioDB.guardarParte>[1], "brandon");
    const llamada = h.prisma.forestParty.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect(llamada.data.adjuntos).toEqual(adjuntos);
    // ADR-524 S4: ficha de PERSONA (arrendador) → el papel queda atado y con candado.
    const wheres = h.prisma.document.updateMany.mock.calls.map((c) => (c as unknown as [{ where: Record<string, unknown> }])[0].where);
    expect(wheres).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: "t1", id: { in: ["d9"] }, NOT: { tags: { has: "parte:p1" } } }),
        expect.objectContaining({ tenantId: "t1", allowedRoles: { isEmpty: true } }),
      ]),
    );
  });
});
