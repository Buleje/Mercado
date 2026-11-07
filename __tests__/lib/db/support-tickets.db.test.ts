import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    supportTicket: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    tenant: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    $executeRaw: vi.fn(async () => 1),
    // La tx de `crearCorreccion` corre sobre el mismo cliente falso.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn((_k: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateByPrefix: vi.fn(),
}));

import { SupportTicketsDB, aSolicitudDTO, aSolicitudPlataformaDTO, type CrearCorreccionData } from "@/lib/db/support-tickets.db";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";

const st = prisma.supportTicket as unknown as Record<string, ReturnType<typeof vi.fn>>;
const T = "tenant-a";
const OTRO = "tenant-b";

function fila(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    subject: "Corrección de guía 001-123 (Guía del Libro TH)",
    message: "La placa está mal",
    priority: "medium",
    status: "open",
    reply: null,
    repliedAt: null,
    tenantId: T,
    createdBy: "qaadmin",
    createdAt: new Date("2026-10-23T10:00:00Z"),
    updatedAt: new Date("2026-10-23T10:00:00Z"),
    kind: "correccion_guia",
    entityType: "loth_gtf",
    entityId: "gtf1",
    detalle: {
      v: 1,
      guiaNumero: "001-123",
      guiaFecha: "2026-10-20",
      cambios: [{ donde: "casillero", clave: "12", correcto: "ABC-123", etiqueta: "(12) Placa", dice: "ABC-128" }],
    },
    resolucion: null,
    resolvedBy: null,
    resolvedAt: null,
    ...over,
  };
}

function pedido(over: Partial<CrearCorreccionData> = {}): CrearCorreccionData {
  return {
    entityType: "loth_gtf",
    entityId: "gtf1",
    guiaNumero: "001-123",
    guiaFecha: "2026-10-20",
    cambios: [{ donde: "casillero", clave: "12", correcto: "ABC-123", etiqueta: "(12) Placa", dice: "ABC-128" }],
    motivo: "La placa está mal",
    createdBy: "qaadmin",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crearCorreccion", () => {
  it("crea con tenantId, kind y detalle armado por el servidor; invalida sólo ese negocio", async () => {
    st.findFirst.mockResolvedValue(null);
    st.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fila(data));

    const r = await SupportTicketsDB.crearCorreccion(T, pedido());

    expect(r.ok).toBe(true);
    const data = st.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: T, kind: "correccion_guia", entityType: "loth_gtf", entityId: "gtf1", status: "open" });
    expect(data.detalle.cambios[0]).toEqual({ donde: "casillero", clave: "12", correcto: "ABC-123", etiqueta: "(12) Placa", dice: "ABC-128" });
    expect(st.findFirst.mock.calls[0][0].where.tenantId).toBe(T);
    expect(invalidateByPrefix).toHaveBeenCalledWith(`support:${T}:`);
    if (r.ok) expect(r.solicitud.estadoEtiqueta).toBe("Pendiente");
  });

  it("no deja una segunda solicitud abierta para la misma guía", async () => {
    st.findFirst.mockResolvedValue({ id: "ya" });
    const r = await SupportTicketsDB.crearCorreccion(T, pedido());
    expect(r).toEqual({ ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: "ya" });
    expect(st.create).not.toHaveBeenCalled();
  });

  it("rechaza datos inválidos sin tocar la base (motivo corto, sin tenant, propiedades de más no pasan)", async () => {
    expect((await SupportTicketsDB.crearCorreccion(T, pedido({ motivo: "mal" }))).ok).toBe(false);
    expect((await SupportTicketsDB.crearCorreccion("", pedido())).ok).toBe(false);
    expect(st.findFirst).not.toHaveBeenCalled();

    st.findFirst.mockResolvedValue(null);
    st.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fila(data));
    const conBasura = { ...pedido().cambios[0], tenantId: OTRO } as CrearCorreccionData["cambios"][number];
    await SupportTicketsDB.crearCorreccion(T, pedido({ cambios: [conBasura] }));
    expect(Object.keys(st.create.mock.calls[0][0].data.detalle.cambios[0]).sort()).toEqual(
      ["clave", "correcto", "dice", "donde", "etiqueta"],
    );
  });
});

describe("listarDelNegocio / obtenerDelNegocio — aislamiento por tenant", () => {
  it("filtra SIEMPRE por tenantId y kind, cachea por negocio", async () => {
    st.findMany.mockResolvedValue([fila()]);
    const lista = await SupportTicketsDB.listarDelNegocio(T, { entityId: "gtf1" });
    expect(st.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: T, kind: "correccion_guia", entityId: "gtf1" });
    expect(vi.mocked(getOrSet).mock.calls[0][0].startsWith(`support:${T}:`)).toBe(true);
    expect(lista[0]).toMatchObject({ guiaNumero: "001-123", estado: "open", createdAt: "2026-10-23T10:00:00.000Z" });
  });

  it("obtenerDelNegocio no devuelve la solicitud de otra tienda", async () => {
    st.findFirst.mockResolvedValue(null);
    expect(await SupportTicketsDB.obtenerDelNegocio(OTRO, "s1")).toBeNull();
    expect(st.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", tenantId: OTRO, kind: "correccion_guia" });
  });

  it("una fila que el Prisma viejo dejó en «replied» se lee como «En revisión»", async () => {
    st.findMany.mockResolvedValue([fila({ status: "replied" })]);
    const [s] = await SupportTicketsDB.listarDelNegocio(T);
    expect(s.estado).toBe("in_review");
    expect(s.estadoEtiqueta).toBe("En revisión");
  });
});

describe("cambiarEstado", () => {
  it("corrección: cerrar sin resolución → falta_resolucion", async () => {
    st.findUnique.mockResolvedValue(fila());
    expect(await SupportTicketsDB.cambiarEstado("s1", { estado: "closed" })).toEqual({ ok: false, error: "falta_resolucion" });
    expect(st.updateMany).not.toHaveBeenCalled();
  });

  it("corrección: estado de ticket general → estado_invalido; salto no permitido → transicion_invalida", async () => {
    st.findUnique.mockResolvedValue(fila());
    expect(await SupportTicketsDB.cambiarEstado("s1", { estado: "replied" })).toEqual({ ok: false, error: "estado_invalido" });
    st.findUnique.mockResolvedValue(fila({ status: "closed" }));
    expect(await SupportTicketsDB.cambiarEstado("s1", { estado: "rejected", resolucion: "no corresponde" })).toEqual({
      ok: false,
      error: "transicion_invalida",
    });
  });

  it("corrección: resolver anota quién y cuándo, con guarda de concurrencia, e invalida su negocio", async () => {
    st.findUnique.mockResolvedValueOnce(fila({ status: "in_review" })).mockResolvedValueOnce(fila({ status: "closed" }));
    st.updateMany.mockResolvedValue({ count: 1 });
    const r = await SupportTicketsDB.cambiarEstado("s1", { estado: "closed", resolucion: "Anulé la 001-123 y emití la 001-124", por: "brandon" });
    expect(r.ok).toBe(true);
    const arg = st.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "s1", status: "in_review" });
    expect(arg.data).toMatchObject({ status: "closed", resolvedBy: "brandon", resolucion: "Anulé la 001-123 y emití la 001-124" });
    expect(arg.data.resolvedAt).toBeInstanceOf(Date);
    expect(invalidateByPrefix).toHaveBeenCalledWith(`support:${T}:`);
  });

  it("si otro lo cambió entre medio → cambio_concurrente", async () => {
    st.findUnique.mockResolvedValue(fila());
    st.updateMany.mockResolvedValue({ count: 0 });
    expect(await SupportTicketsDB.cambiarEstado("s1", { estado: "in_review" })).toEqual({ ok: false, error: "cambio_concurrente" });
  });

  it("ticket general: sólo open|replied|closed y sólo escribe status (como antes)", async () => {
    st.findUnique.mockResolvedValue(fila({ kind: "general", entityType: null, entityId: null, detalle: null }));
    expect(await SupportTicketsDB.cambiarEstado("s1", { estado: "rejected" })).toEqual({ ok: false, error: "estado_invalido" });
    st.updateMany.mockResolvedValue({ count: 1 });
    await SupportTicketsDB.cambiarEstado("s1", { estado: "replied" });
    expect(st.updateMany.mock.calls[0][0].data).toEqual({ status: "replied" });
  });

  it("no existe → no_existe", async () => {
    st.findUnique.mockResolvedValue(null);
    expect(await SupportTicketsDB.cambiarEstado("x", { estado: "open" })).toEqual({ ok: false, error: "no_existe" });
  });

  const ex = prisma as unknown as { $executeRaw: ReturnType<typeof vi.fn>; $transaction: ReturnType<typeof vi.fn> };

  it("reabrir una rechazada con OTRA abierta para la misma guía → ya_hay_una_abierta, bajo el candado de crear, sin escribir", async () => {
    st.findUnique.mockResolvedValue(fila({ status: "rejected", resolucion: "no corresponde", resolvedBy: "brandon" }));
    st.findFirst.mockResolvedValue({ id: "s-nueva" });
    const r = await SupportTicketsDB.cambiarEstado("s1", { estado: "in_review", por: "brandon" });
    expect(r).toEqual({ ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: "s-nueva" });
    expect(ex.$executeRaw.mock.calls[0].slice(1)).toEqual([T, "correccion-guia:loth_gtf:gtf1"]);
    expect(ex.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(st.findFirst.mock.invocationCallOrder[0]);
    expect(st.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: T,
      kind: "correccion_guia",
      entityType: "loth_gtf",
      entityId: "gtf1",
      id: { not: "s1" },
    });
    expect(st.updateMany).not.toHaveBeenCalled();
    expect(invalidateByPrefix).not.toHaveBeenCalled();
  });

  it("reabrir una resuelta sin otra abierta → escribe dentro de la tx y limpia la resolución", async () => {
    st.findUnique.mockResolvedValueOnce(fila({ status: "closed", resolucion: "hecho", resolvedBy: "brandon" })).mockResolvedValueOnce(fila({ status: "in_review" }));
    st.findFirst.mockResolvedValue(null);
    st.updateMany.mockResolvedValue({ count: 1 });
    const r = await SupportTicketsDB.cambiarEstado("s1", { estado: "in_review" });
    expect(r.ok).toBe(true);
    expect(ex.$transaction).toHaveBeenCalledTimes(1);
    expect(st.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "s1", status: "closed" },
      data: { status: "in_review", resolucion: null, resolvedBy: null, resolvedAt: null },
    });
    expect(invalidateByPrefix).toHaveBeenCalledWith(`support:${T}:`);
  });

  it("moverse entre abiertos (pendiente → en revisión) no toma el candado", async () => {
    st.findUnique.mockResolvedValue(fila());
    st.updateMany.mockResolvedValue({ count: 1 });
    await SupportTicketsDB.cambiarEstado("s1", { estado: "in_review" });
    expect(ex.$transaction).not.toHaveBeenCalled();
    expect(st.findFirst).not.toHaveBeenCalled();
  });
});

describe("quién resolvió: el negocio no ve el usuario del superadmin", () => {
  it("panel → «Equipo Buleje»; bandeja del superadmin → el usuario real; sin resolver → null en los dos", () => {
    const resuelta = fila({ status: "closed", resolucion: "hecho", resolvedBy: "superadmin-login", resolvedAt: new Date() });
    expect(aSolicitudDTO(resuelta).resolvedBy).toBe("Equipo Buleje");
    expect(JSON.stringify(aSolicitudDTO(resuelta))).not.toContain("superadmin-login");
    expect(aSolicitudPlataformaDTO({ ...resuelta, tenant: null }).resolvedBy).toBe("superadmin-login");
    expect(aSolicitudDTO(fila()).resolvedBy).toBeNull();
    expect(aSolicitudPlataformaDTO({ ...fila(), tenant: null }).resolvedBy).toBeNull();
  });
});

describe("responder y listarPlataforma", () => {
  it("responder: general → replied; corrección pendiente → in_review", async () => {
    st.findUnique.mockResolvedValueOnce({ id: "g", tenantId: T, subject: "Hola", kind: "general", status: "open" });
    await SupportTicketsDB.responder("g", "ok");
    expect(st.update.mock.calls[0][0].data.status).toBe("replied");
    st.findUnique.mockResolvedValueOnce({ id: "s1", tenantId: T, subject: "x", kind: "correccion_guia", status: "open" });
    await SupportTicketsDB.responder("s1", "lo vemos");
    expect(st.update.mock.calls[1][0].data.status).toBe("in_review");
  });

  it("listarPlataforma junta cada ticket con su tienda", async () => {
    st.findMany.mockResolvedValue([fila(), fila({ id: "s2", tenantId: OTRO })]);
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([
      { id: T, name: "Tienda A", slug: "a", ownerEmail: null },
    ] as never);
    const rows = await SupportTicketsDB.listarPlataforma({ kind: "correccion_guia" });
    expect(st.findMany.mock.calls[0][0].where).toEqual({ kind: "correccion_guia" });
    expect(rows.map((r) => r.tenant?.name ?? null)).toEqual(["Tienda A", null]);
  });
});

describe("fase 2: candado, fotos, varias guías y bandeja", () => {
  const ex = prisma as unknown as { $executeRaw: ReturnType<typeof vi.fn>; $transaction: ReturnType<typeof vi.fn> };

  it("crearCorreccion pone la guía en fila (candado del negocio + guía) antes de mirar si hay una abierta", async () => {
    st.findFirst.mockResolvedValue(null);
    st.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fila(data));
    await SupportTicketsDB.crearCorreccion(T, pedido());
    expect(ex.$transaction).toHaveBeenCalledTimes(1);
    const valores = ex.$executeRaw.mock.calls[0].slice(1);
    expect(valores).toEqual([T, "correccion-guia:loth_gtf:gtf1"]);
    expect(ex.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(st.findFirst.mock.invocationCallOrder[0]);
  });

  it("guarda las fotos sin repetir y el DTO las devuelve (vacío = sin fotos)", async () => {
    st.findFirst.mockResolvedValue(null);
    st.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fila(data));
    const r = await SupportTicketsDB.crearCorreccion(T, pedido({ documentoIds: ["d1", "d2", "d1"] }));
    expect(st.create.mock.calls[0][0].data.detalle.documentoIds).toEqual(["d1", "d2"]);
    if (r.ok) expect(r.solicitud.documentoIds).toEqual(["d1", "d2"]);
    const sin = await SupportTicketsDB.crearCorreccion(T, pedido());
    expect(st.create.mock.calls[1][0].data.detalle.documentoIds).toBeUndefined();
    if (sin.ok) expect(sin.solicitud.documentoIds).toEqual([]);
  });

  it("listarDelNegocioPorGuias: una consulta, sólo ese negocio, caché del negocio", async () => {
    st.findMany.mockResolvedValue([fila(), fila({ id: "s2", entityId: "gtf2" })]);
    const r = await SupportTicketsDB.listarDelNegocioPorGuias(T, { entityType: "loth_gtf", entityIds: ["gtf2", "gtf1", "gtf1"] });
    expect(st.findMany).toHaveBeenCalledTimes(1);
    expect(st.findMany.mock.calls[0][0].where).toEqual({
      tenantId: T,
      kind: "correccion_guia",
      entityId: { in: ["gtf1", "gtf2"] },
      entityType: "loth_gtf",
    });
    expect(vi.mocked(getOrSet).mock.calls[0][0].startsWith(`support:${T}:`)).toBe(true);
    expect(r.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(await SupportTicketsDB.listarDelNegocioPorGuias(T, { entityIds: [] })).toEqual([]);
  });

  it("correccionesAbiertasPlataforma: cuenta Pendiente/En revisión (+ replied viejo) con su tienda", async () => {
    st.count.mockResolvedValue(3);
    st.findMany.mockResolvedValue([fila(), fila({ id: "s2", tenantId: OTRO, status: "replied" })]);
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([
      { id: T, name: "Tienda A", slug: "a", ownerEmail: "a@x.pe" },
    ] as never);
    const r = await SupportTicketsDB.correccionesAbiertasPlataforma(10);
    expect(st.count.mock.calls[0][0].where).toEqual({ kind: "correccion_guia", status: { in: ["open", "in_review", "replied"] } });
    expect(r.count).toBe(3);
    expect(r.filas.map((f) => [f.tenantName, f.estado])).toEqual([["Tienda A", "open"], [OTRO, "in_review"]]);
  });
});

describe("evidenciaPlataforma (bandeja del superadmin)", () => {
  const doc = prisma.document as unknown as { findMany: ReturnType<typeof vi.fn> };
  const detalle = (documentoIds?: string[]) => ({ v: 1, guiaNumero: "001", guiaFecha: null, cambios: [], ...(documentoIds ? { documentoIds } : {}) });

  it("una consulta; cada id con el tenant de SU solicitud, sin borrados; orden de documentoIds", async () => {
    doc.findMany.mockResolvedValueOnce([
      { id: "d2", tenantId: "A", name: "guia.pdf", mimeType: "application/pdf" },
      { id: "d1", tenantId: "A", name: "placa.jpg", mimeType: "image/jpeg" },
      { id: "d1", tenantId: "B", name: "ajena.jpg", mimeType: "image/jpeg" },
    ]);
    const r = await SupportTicketsDB.evidenciaPlataforma([
      { id: "s1", tenantId: "A", detalle: detalle(["d1", "d2", "d3"]) },
      { id: "s2", tenantId: "C", detalle: detalle(["d1"]) },
      { id: "s3", tenantId: "A", detalle: detalle() },
    ]);
    expect(doc.findMany).toHaveBeenCalledTimes(1);
    expect(doc.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      OR: [
        { tenantId: "A", id: { in: ["d1", "d2", "d3"] } },
        { tenantId: "C", id: { in: ["d1"] } },
      ],
    });
    expect(r.get("s1")).toEqual([
      { docId: "d1", nombre: "placa.jpg", mime: "image/jpeg" },
      { docId: "d2", nombre: "guia.pdf", mime: "application/pdf" },
    ]);
    // El d1 de la tienda B no se cuela en la solicitud de C.
    expect(r.get("s2")).toEqual([]);
    expect(r.has("s3")).toBe(false);
  });

  it("sin fotos no consulta", async () => {
    doc.findMany.mockClear();
    expect((await SupportTicketsDB.evidenciaPlataforma([{ id: "s", tenantId: "A", detalle: detalle() }])).size).toBe(0);
    expect(doc.findMany).not.toHaveBeenCalled();
  });
});
