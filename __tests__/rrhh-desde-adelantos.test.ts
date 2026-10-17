/**
 * __tests__/rrhh-desde-adelantos.test.ts
 *
 * «Traer desde Adelantos» (pedido de Brandon, 2026-09-14) — `ColaboradoresDB
 * .traerDesdeAdelantos`/`candidatosDesdeAdelantos`. Mockea `@/lib/prisma` y
 * `@/lib/db/adelantos.db` para probar la lógica de omisión sin tocar una base
 * real: cada motivo (`ya_vinculado`, `documento_duplicado`, `no_encontrado`,
 * `es_empresa`) con su caso, y el IDOR de un beneficiario que no es de este
 * tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockColaboradorCreate = vi.fn();
const mockColaboradorFindMany = vi.fn();
const mockColaboradorFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    colaborador: {
      create: mockColaboradorCreate,
      findMany: mockColaboradorFindMany,
      findFirst: mockColaboradorFindFirst,
    },
  },
}));

const mockListBeneficiarios = vi.fn();
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: { listBeneficiarios: mockListBeneficiarios },
}));

vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));

// Import DESPUÉS de los mocks.
const { ColaboradoresDB } = await import("@/lib/db/rrhh-colaboradores.db");

interface BenefFixture {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  tipoDocumento: string | null;
  activo: boolean;
  saldoPendiente: Record<string, number>;
}

const benef = (p: Partial<BenefFixture> = {}): BenefFixture => ({
  id: "b1",
  nombre: "Juan Pérez",
  documento: "12345678",
  telefono: "999888777",
  tipoDocumento: "DNI",
  activo: true,
  saldoPendiente: { PEN: 0 },
  ...p,
});

/** Simula lo que Prisma devuelve de un `create`: hace eco de `data` con los defaults del modelo. */
function crearFalso({ data }: { data: Record<string, unknown> }) {
  return {
    id: `col-${data.beneficiarioId}`,
    nombre: data.nombre,
    apodo: null,
    tipoDocumento: data.tipoDocumento ?? null,
    documento: data.documento ?? null,
    celular: data.celular ?? null,
    direccion: null,
    contactoEmergenciaNombre: null,
    contactoEmergenciaCelular: null,
    puestoId: null,
    puesto: null,
    estado: data.estado,
    fechaIngreso: data.fechaIngreso ?? null,
    fechaCese: null,
    motivoCese: null,
    observaciones: null,
    beneficiarioId: data.beneficiarioId,
    adminUserId: null,
    createdAt: new Date("2026-09-14T00:00:00.000Z"),
    updatedAt: new Date("2026-09-14T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto: nadie vinculado todavía, ningún documento en uso.
  mockColaboradorFindMany.mockResolvedValue([]);
  mockColaboradorCreate.mockImplementation(crearFalso);
});

describe("ColaboradoresDB.traerDesdeAdelantos", () => {
  it("crea copiando nombre/documento/celular del beneficiario — nunca lo que mande el cliente", async () => {
    mockListBeneficiarios.mockResolvedValue([benef()]);
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(r.omitidos).toEqual([]);
    expect(r.creados).toHaveLength(1);
    expect(mockColaboradorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          nombre: "Juan Pérez",
          documento: "12345678",
          tipoDocumento: "DNI",
          celular: "999888777",
          beneficiarioId: "b1",
          estado: "ACTIVO",
        }),
      }),
    );
  });

  it("IDOR: un id que no aparece en AdelantosDB.listBeneficiarios de ESTE tenant → no_encontrado, no crea", async () => {
    mockListBeneficiarios.mockResolvedValue([]); // el tenant no tiene ese beneficiario (es de otro)
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["ajeno-1"] }, "qaadmin");
    expect(r.omitidos).toEqual([{ beneficiarioId: "ajeno-1", nombre: "—", motivo: "no_encontrado" }]);
    expect(r.creados).toEqual([]);
    expect(mockColaboradorCreate).not.toHaveBeenCalled();
  });

  it("ya vinculado a otro colaborador vivo → ya_vinculado, no crea", async () => {
    mockListBeneficiarios.mockResolvedValue([benef()]);
    mockColaboradorFindMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("beneficiarioId" in where ? [{ beneficiarioId: "b1" }] : []),
    );
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(r.omitidos).toEqual([{ beneficiarioId: "b1", nombre: "Juan Pérez", motivo: "ya_vinculado" }]);
    expect(mockColaboradorCreate).not.toHaveBeenCalled();
  });

  it("documento ya usado por otro colaborador vivo → documento_duplicado, no crea", async () => {
    mockListBeneficiarios.mockResolvedValue([benef()]);
    mockColaboradorFindMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("documento" in where ? [{ documento: "12345678" }] : []),
    );
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(r.omitidos).toEqual([{ beneficiarioId: "b1", nombre: "Juan Pérez", motivo: "documento_duplicado" }]);
    expect(mockColaboradorCreate).not.toHaveBeenCalled();
  });

  it("RUC-20 (empresa) sin incluirEmpresas → es_empresa, no crea", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ documento: "20456789012", tipoDocumento: "RUC" })]);
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(r.omitidos).toEqual([{ beneficiarioId: "b1", nombre: "Juan Pérez", motivo: "es_empresa" }]);
    expect(mockColaboradorCreate).not.toHaveBeenCalled();
  });

  it("CONTROL NEGATIVO: la misma empresa CON incluirEmpresas sí se crea", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ documento: "20456789012", tipoDocumento: "RUC" })]);
    const r = await ColaboradoresDB.traerDesdeAdelantos(
      "t1",
      { beneficiarioIds: ["b1"], incluirEmpresas: ["b1"] },
      "qaadmin",
    );
    expect(r.omitidos).toEqual([]);
    expect(r.creados).toHaveLength(1);
  });

  it("CONTROL NEGATIVO: un RUC-10 (persona natural) NO se trata como empresa — se crea normal", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ documento: "10456789012", tipoDocumento: "RUC" })]);
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(r.omitidos).toEqual([]);
    expect(r.creados).toHaveLength(1);
    // El tipoDocumento que se guarda es OTRO (Colaborador no admite "RUC").
    expect(mockColaboradorCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoDocumento: "OTRO", documento: "10456789012" }) }),
    );
  });

  it("un lote mezclado: cada persona es independiente (una omitida no tumba a las demás)", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ id: "b1" }), benef({ id: "b2", nombre: "Rosa" })]);
    mockColaboradorFindMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("beneficiarioId" in where ? [{ beneficiarioId: "b1" }] : []),
    );
    const r = await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1", "b2"] }, "qaadmin");
    expect(r.omitidos).toEqual([{ beneficiarioId: "b1", nombre: "Juan Pérez", motivo: "ya_vinculado" }]);
    expect(r.creados).toHaveLength(1);
  });

  it("sin documento: no manda tipoDocumento ni documento (nunca inventa uno)", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ documento: null })]);
    await ColaboradoresDB.traerDesdeAdelantos("t1", { beneficiarioIds: ["b1"] }, "qaadmin");
    expect(mockColaboradorCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documento: null, tipoDocumento: null }) }),
    );
  });
});

describe("ColaboradoresDB.candidatosDesdeAdelantos", () => {
  it("excluye a quien ya tiene un colaborador vivo vinculado y reporta yaVinculados", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ id: "b1" }), benef({ id: "b2", nombre: "Rosa" })]);
    mockColaboradorFindMany.mockResolvedValue([{ beneficiarioId: "b1" }]);
    const r = await ColaboradoresDB.candidatosDesdeAdelantos("t1");
    expect(r.candidatos.map((c) => c.beneficiarioId)).toEqual(["b2"]);
    expect(r.yaVinculados).toBe(1);
  });

  it("excluye a los beneficiarios inactivos (baja lógica de Adelantos)", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ id: "b1", activo: false }), benef({ id: "b2" })]);
    const r = await ColaboradoresDB.candidatosDesdeAdelantos("t1");
    expect(r.candidatos.map((c) => c.beneficiarioId)).toEqual(["b2"]);
  });

  it("marca esEmpresa en el candidato sin excluirlo de la lista (el filtro es al traer)", async () => {
    mockListBeneficiarios.mockResolvedValue([benef({ documento: "20456789012", tipoDocumento: "RUC" })]);
    const r = await ColaboradoresDB.candidatosDesdeAdelantos("t1");
    expect(r.candidatos[0].esEmpresa).toBe(true);
  });
});
