/**
 * ADR-512 · rutas de «Pedir corrección» de una guía EMITIDA:
 *   POST/GET /api/admin/solicitudes-correccion     (panel del negocio)
 *   PATCH    /api/superadmin/support/[id]/correccion (superadmin)
 *   GET      /api/superadmin/support?kind=correccion_guia
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { csrfMock } from "../helpers/mocks";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/csrf", () => csrfMock());
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  leer: vi.fn(),
  crear: vi.fn(),
  listar: vi.fn(),
  porGuias: vi.fn(),
  tiendaDe: vi.fn(async () => ({ id: "t-A", name: "Tienda A", slug: "a", ownerEmail: "a@x.pe" })),
  obtener: vi.fn(),
  cambiar: vi.fn(),
  plataforma: vi.fn(),
  doc: vi.fn(),
  activity: vi.fn(async () => undefined),
  mail: vi.fn(async () => undefined),
  notif: vi.fn(async () => ({ id: "n1", created: true })),
  audit: vi.fn(async () => undefined),
  session: vi.fn(),
  platformAPI: vi.fn(),
  evidencia: vi.fn(async (_tickets: unknown[]): Promise<Map<string, unknown[]>> => new Map()),
  descargar: vi.fn(),
}));

/* requireAdmin de verdad: sin cookie 401; el rol tiene que estar en la lista
   (el encargado pasa siempre, por diseño). El mock reproduce ese contrato y
   anota qué roles pidió la ruta. */
vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/soporte/correccion-guia-guias", () => ({ leerGuiaParaCorreccion: m.leer }));
vi.mock("@/lib/db/support-tickets.db", () => ({
  SupportTicketsDB: {
    crearCorreccion: m.crear,
    listarDelNegocio: m.listar,
    listarDelNegocioPorGuias: m.porGuias,
    tiendaDe: m.tiendaDe,
    obtener: m.obtener,
    cambiarEstado: m.cambiar,
    listarPlataforma: m.plataforma,
    evidenciaPlataforma: m.evidencia,
  },
  aSolicitudDTO: (t: { id: string; status: string; resolucion: string | null; entityType: string; tenantId: string }) => ({
    id: t.id,
    entityType: t.entityType,
    entityId: "gtf1",
    guiaNumero: "001-123",
    estado: t.status,
    resolucion: t.resolucion,
  }),
  aSolicitudPlataformaDTO: (t: { id: string }) => ({ id: t.id, guiaNumero: "001-123" }),
}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { getById: m.doc } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.activity }));
vi.mock("@/lib/mailer-superadmin", () => ({ avisarCorreccionGuiaAlSuperadmin: m.mail }));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { create: m.notif } }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: m.session,
  PLATFORM_SESSION: { COOKIE_NAME: "buleje-platform-sess" },
}));
vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: m.platformAPI }));
vi.mock("@/lib/documents/storage", async () => {
  const u = await vi.importActual<typeof import("@/lib/documents/upload-limits")>("@/lib/documents/upload-limits");
  return { downloadFromStorage: m.descargar, esInlineSeguro: u.esInlineSeguro };
});

import { POST, GET } from "@/app/api/admin/solicitudes-correccion/route";
import { PATCH } from "@/app/api/superadmin/support/[id]/correccion/route";
import { GET as bandeja } from "@/app/api/superadmin/support/route";
import { GET as evidencia } from "@/app/api/superadmin/support/[id]/evidencia/[docId]/route";
import { validateSuperadminCsrf } from "@/lib/csrf";

const URL_PANEL = "http://localhost:3000/api/admin/solicitudes-correccion";
const flush = () => new Promise((r) => setTimeout(r, 0));

function comoRol(rol: string | null) {
  m.requireAdmin.mockImplementation(async (_req: NextRequest, roles: string[]) => {
    if (!rol) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (rol !== "manager" && !roles.includes(rol)) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    return { role: rol, username: `qa-${rol}`, tenantId: "t-A" };
  });
}

const guia = {
  numero: "001-123",
  fecha: "2026-10-20",
  casilleros: new Map([["12", { etiqueta: "(12) Propietario del producto", dice: "ABC-128" }]]),
  filas: [],
};

function post(body: unknown) {
  return new NextRequest(URL_PANEL, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const pedido = (over: Record<string, unknown> = {}) => ({
  entityType: "loth_gtf",
  entityId: "gtf1",
  cambios: [{ donde: "casillero", clave: "12", correcto: "ABC-123", dice: "INVENTADO POR EL NAVEGADOR", etiqueta: "X" }],
  motivo: "La placa está mal escrita",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  comoRol("almacenero");
  m.leer.mockResolvedValue({ ok: true, guia });
  m.crear.mockImplementation(async (_t: string, d: Record<string, unknown>) => ({
    ok: true,
    solicitud: { id: "s1", entityType: "loth_gtf", guiaNumero: d.guiaNumero, cambios: d.cambios, motivo: d.motivo, createdBy: d.createdBy },
  }));
});

describe("POST /api/admin/solicitudes-correccion", () => {
  it("roles: sin sesión 401, cajero 403; admin/owner/almacenero/manager pasan", async () => {
    comoRol(null);
    expect((await POST(post(pedido()))).status).toBe(401);
    comoRol("cajero");
    expect((await POST(post(pedido()))).status).toBe(403);
    for (const rol of ["admin", "owner", "almacenero", "manager"]) {
      comoRol(rol);
      expect((await POST(post(pedido()))).status).toBe(201);
    }
    expect(m.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner", "almacenero"]);
  });

  it("201: lee la guía con el tenant del JWT y `dice` sale de la guía, no del body", async () => {
    const res = await POST(post(pedido()));
    expect(res.status).toBe(201);
    expect(m.leer).toHaveBeenCalledWith("t-A", "loth_gtf", "gtf1");
    const [tenantId, data] = m.crear.mock.calls[0];
    expect(tenantId).toBe("t-A");
    expect(data).toMatchObject({ guiaNumero: "001-123", guiaFecha: "2026-10-20", createdBy: "qa-almacenero", documentoIds: [] });
    expect(data.cambios).toEqual([
      { donde: "casillero", clave: "12", correcto: "ABC-123", etiqueta: "(12) Propietario del producto", dice: "ABC-128" },
    ]);
    const json = await res.json();
    expect(json.ok).toBe(true);
    await flush();
    expect(m.activity).toHaveBeenCalledWith(
      "soporte_correccion_pedida",
      "SupportTicket",
      expect.stringContaining("001-123"),
      "s1",
      "qa-almacenero",
      undefined,
      "t-A",
    );
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ tenantName: "Tienda A", guiaNumero: "001-123", createdBy: "qa-almacenero" }));
  });

  it("guía de otro negocio → 404 y no crea nada", async () => {
    m.leer.mockResolvedValue({ ok: false, error: "no_existe" });
    const res = await POST(post(pedido({ entityId: "gtf-de-otro" })));
    expect(res.status).toBe(404);
    expect((await res.json()).codigo).toBe("no_existe");
    expect(m.crear).not.toHaveBeenCalled();
  });

  it("guía anulada → 409 no_emitida", async () => {
    m.leer.mockResolvedValue({ ok: false, error: "no_emitida", estado: "anulada" });
    const res = await POST(post(pedido()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, codigo: "no_emitida" });
  });

  it("una abierta por guía → 409 con el id de la abierta", async () => {
    m.crear.mockResolvedValue({ ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: "s-vieja" });
    const res = await POST(post(pedido()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ codigo: "ya_hay_una_abierta", solicitudAbiertaId: "s-vieja" });
    await flush();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("casillero que el formato no tiene → 400; ítem que la guía no lista → 400 item_desconocido; motivo corto → 400 sin leer la guía", async () => {
    const r1 = await POST(post(pedido({ cambios: [{ donde: "casillero", clave: "99", correcto: "x" }] })));
    expect(r1.status).toBe(400);
    expect(await r1.json()).toMatchObject({ codigo: "casillero_desconocido", clave: "99" });
    m.leer.mockClear();
    const r3 = await POST(post(pedido({ cambios: [{ donde: "item", clave: "NO-EXISTE-1", correcto: "x" }] })));
    expect(r3.status).toBe(400);
    expect(await r3.json()).toMatchObject({ ok: false, codigo: "item_desconocido", clave: "NO-EXISTE-1" });
    expect(m.crear).not.toHaveBeenCalled();
    m.leer.mockClear();
    const r2 = await POST(post(pedido({ motivo: "mal" })));
    expect(r2.status).toBe(400);
    expect(m.leer).not.toHaveBeenCalled();
  });

  it("fotos: cada id se busca en el Archivo del negocio con el rol de quien pide; una ajena → 400", async () => {
    m.doc.mockImplementation(async (_t: string, id: string) => (id === "d-mio" ? { id } : null));
    const r = await POST(post(pedido({ documentoIds: ["d-mio", "d-ajeno"] })));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe("documento_ajeno");
    expect(m.doc).toHaveBeenCalledWith("t-A", "d-ajeno", "almacenero");
    expect(m.crear).not.toHaveBeenCalled();
    const ok = await POST(post(pedido({ documentoIds: ["d-mio", "d-mio"] })));
    expect(ok.status).toBe(201);
    expect(m.crear.mock.calls[0][1].documentoIds).toEqual(["d-mio"]);
  });
});

describe("GET /api/admin/solicitudes-correccion", () => {
  it("?entityIds=a,b → una consulta del negocio del JWT y porGuia por id (la abierta gana)", async () => {
    m.porGuias.mockResolvedValue([
      { id: "s3", entityId: "gtf1", estado: "rejected", estadoEtiqueta: "Rechazada", createdAt: "2026-10-23" },
      { id: "s2", entityId: "gtf1", estado: "open", estadoEtiqueta: "Pendiente", createdAt: "2026-10-22" },
      { id: "s1", entityId: "gtf2", estado: "closed", estadoEtiqueta: "Resuelta", createdAt: "2026-10-21" },
    ]);
    const res = await GET(new NextRequest(`${URL_PANEL}?entityType=loth_gtf&entityIds=gtf1,gtf2,gtf1`));
    expect(res.status).toBe(200);
    expect(m.porGuias).toHaveBeenCalledWith("t-A", { entityType: "loth_gtf", entityIds: ["gtf1", "gtf2"] });
    const json = await res.json();
    expect(json.porGuia.gtf1).toMatchObject({ id: "s2", abierta: true });
    expect(json.porGuia.gtf2).toMatchObject({ id: "s1", abierta: false });
  });

  it("sin entityIds filtra por guía con listarDelNegocio; más de 200 guías → 400; sin sesión 401", async () => {
    m.listar.mockResolvedValue([]);
    await GET(new NextRequest(`${URL_PANEL}?entityId=gtf1`));
    expect(m.listar).toHaveBeenCalledWith("t-A", { entityId: "gtf1" });
    const muchas = Array.from({ length: 201 }, (_, i) => `g${i}`).join(",");
    expect((await GET(new NextRequest(`${URL_PANEL}?entityIds=${muchas}`))).status).toBe(400);
    comoRol(null);
    expect((await GET(new NextRequest(URL_PANEL))).status).toBe(401);
  });
});

describe("PATCH /api/superadmin/support/[id]/correccion", () => {
  const URL_SA = "http://localhost:3000/api/superadmin/support/s1/correccion";
  const patch = (body: unknown, cookie = true) =>
    new NextRequest(URL_SA, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(cookie ? { cookie: "buleje-platform-sess=tok" } : {}) },
    });
  const params = { params: Promise.resolve({ id: "s1" }) };
  const ticket = (status: string, resolucion: string | null = null) => ({
    id: "s1",
    kind: "correccion_guia",
    status,
    resolucion,
    entityType: "loth_gtf",
    tenantId: "t-A",
  });

  beforeEach(() => {
    m.session.mockResolvedValue({ username: "brandon" });
    m.obtener.mockResolvedValue(ticket("open"));
  });

  it("sin sesión 401; CSRF inválido 403", async () => {
    expect((await PATCH(patch({ estado: "in_review" }, false), params)).status).toBe(401);
    vi.mocked(validateSuperadminCsrf).mockReturnValueOnce(false);
    expect((await PATCH(patch({ estado: "in_review" }), params)).status).toBe(403);
  });

  it("open → in_review: 200, aviso LOW al negocio y audit de los dos lados", async () => {
    m.cambiar.mockResolvedValue({ ok: true, ticket: ticket("in_review") });
    const res = await PATCH(patch({ estado: "in_review" }), params);
    expect(res.status).toBe(200);
    expect(m.cambiar).toHaveBeenCalledWith("s1", { estado: "in_review", resolucion: null, por: "brandon" });
    await flush();
    expect(m.notif).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-A", type: "soporte_correccion_guia", severity: "LOW", entityId: "s1" }),
    );
    expect(m.audit).toHaveBeenCalledWith("support_correccion", expect.any(String), expect.objectContaining({ tenantId: "t-A" }), "brandon");
    // El registro del negocio dice «Equipo Buleje»: el usuario de entrada sólo va en el del superadmin.
    expect(m.activity).toHaveBeenCalledWith("soporte_correccion_in_review", "SupportTicket", expect.any(String), "s1", "Equipo Buleje", undefined, "t-A");
    expect(JSON.stringify(m.activity.mock.calls)).not.toContain("brandon");
  });

  it("resolver con respuesta: aviso MEDIUM cuyo cuerpo es la respuesta y enlace a la guía", async () => {
    m.obtener.mockResolvedValue(ticket("in_review"));
    m.cambiar.mockResolvedValue({ ok: true, ticket: ticket("closed", "Se anuló y se emitió la 001-124") });
    const res = await PATCH(patch({ estado: "closed", resolucion: "Se anuló y se emitió la 001-124" }), params);
    expect(res.status).toBe(200);
    await flush();
    expect(m.notif).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "MEDIUM",
        body: "Se anuló y se emitió la 001-124",
        actionUrl: "/admin?tab=loth-libro-operaciones&vista=gtf",
      }),
    );
  });

  it("rechazar sin motivo → 400 sin tocar la base", async () => {
    const res = await PATCH(patch({ estado: "rejected" }), params);
    expect(res.status).toBe(400);
    expect(m.cambiar).not.toHaveBeenCalled();
  });

  it("transición inválida → 409; cambio concurrente → 409 con su código; sin aviso", async () => {
    m.cambiar.mockResolvedValueOnce({ ok: false, error: "transicion_invalida" });
    const r1 = await PATCH(patch({ estado: "in_review" }), params);
    expect(r1.status).toBe(409);
    expect((await r1.json()).codigo).toBe("transicion_invalida");
    m.cambiar.mockResolvedValueOnce({ ok: false, error: "cambio_concurrente" });
    const r2 = await PATCH(patch({ estado: "in_review" }), params);
    expect(r2.status).toBe(409);
    expect((await r2.json()).codigo).toBe("cambio_concurrente");
    await flush();
    expect(m.notif).not.toHaveBeenCalled();
  });

  it("reabrir con otra abierta para la misma guía → 409 ya_hay_una_abierta con su id; sin aviso ni registro", async () => {
    m.obtener.mockResolvedValue(ticket("rejected", "no corresponde"));
    m.cambiar.mockResolvedValueOnce({ ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: "s-nueva" });
    const res = await PATCH(patch({ estado: "in_review" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, codigo: "ya_hay_una_abierta", solicitudAbiertaId: "s-nueva" });
    await flush();
    expect(m.notif).not.toHaveBeenCalled();
    expect(m.activity).not.toHaveBeenCalled();
  });

  it("la respuesta al superadmin trae quién la resolvió (la del negocio no: ver el DTO)", async () => {
    m.obtener.mockResolvedValue(ticket("in_review"));
    m.cambiar.mockResolvedValue({ ok: true, ticket: { ...ticket("closed", "hecho"), resolvedBy: "brandon" } });
    const res = await PATCH(patch({ estado: "closed", resolucion: "hecho" }), params);
    expect((await res.json()).solicitud.resolvedBy).toBe("brandon");
  });

  it("un ticket general (no corrección) → 404; mismo estado → 200 sin aviso", async () => {
    m.obtener.mockResolvedValueOnce({ ...ticket("open"), kind: "general" });
    expect((await PATCH(patch({ estado: "in_review" }), params)).status).toBe(404);
    m.obtener.mockResolvedValueOnce(ticket("in_review"));
    m.cambiar.mockResolvedValueOnce({ ok: true, ticket: ticket("in_review") });
    expect((await PATCH(patch({ estado: "in_review" }), params)).status).toBe(200);
    await flush();
    expect(m.notif).not.toHaveBeenCalled();
  });
});

describe("GET /api/superadmin/support (filtros, aditivo)", () => {
  const fila = (kind: string) => ({
    id: kind,
    kind,
    subject: "s",
    message: "m",
    reply: null,
    repliedAt: null,
    status: "open",
    priority: "medium",
    createdBy: "qa",
    tenantId: "t-A",
    tenant: { id: "t-A", name: "Tienda A", slug: "a", ownerEmail: "a@x.pe" },
    createdAt: new Date("2026-10-23T10:00:00Z"),
    updatedAt: new Date("2026-10-23T10:00:00Z"),
    entityType: kind === "general" ? null : "loth_gtf",
    entityId: kind === "general" ? null : "gtf1",
  });

  it("?kind=correccion_guia llega a la base; la fila de corrección trae su `correccion`; filtro malo 400", async () => {
    m.platformAPI.mockResolvedValue({ ok: true, username: "brandon" });
    m.plataforma.mockResolvedValue([fila("correccion_guia"), fila("general")]);
    m.evidencia.mockResolvedValueOnce(new Map([["correccion_guia", [{ docId: "d1", nombre: "placa.jpg", mime: "image/jpeg" }]]]));
    const res = await bandeja(new NextRequest("http://localhost:3000/api/superadmin/support?kind=correccion_guia"));
    expect(m.plataforma).toHaveBeenCalledWith({ limite: 200, kind: "correccion_guia" });
    // La evidencia se pide sólo para las filas de corrección, en una llamada.
    expect(m.evidencia).toHaveBeenCalledTimes(1);
    expect(m.evidencia.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ id: "correccion_guia" })]);
    const rows = await res.json();
    expect(rows[0].correccion).toEqual({
      id: "correccion_guia",
      guiaNumero: "001-123",
      evidencia: [{ docId: "d1", nombre: "placa.jpg", mime: "image/jpeg" }],
    });
    expect(rows[1].correccion).toBeNull();
    // Si la evidencia no se puede leer, la bandeja igual sale (lista vacía).
    m.evidencia.mockRejectedValueOnce(new Error("db caída"));
    const sinEvidencia = await (await bandeja(new NextRequest("http://localhost:3000/api/superadmin/support?kind=correccion_guia"))).json();
    expect(sinEvidencia[0].correccion.evidencia).toEqual([]);
    expect((await bandeja(new NextRequest("http://localhost:3000/api/superadmin/support?kind=otro"))).status).toBe(400);
  });
});

describe("GET /api/superadmin/support/[id]/evidencia/[docId]", () => {
  const ticket = (over: Record<string, unknown> = {}) => ({
    id: "s1",
    kind: "correccion_guia",
    tenantId: "t-B",
    detalle: { v: 1, guiaNumero: "001-123", guiaFecha: null, cambios: [], documentoIds: ["d1", "d2"] },
    ...over,
  });
  const pedir = (docId: string, headers: Record<string, string> = {}) =>
    evidencia(new NextRequest(`http://localhost:3000/api/superadmin/support/s1/evidencia/${docId}`, { headers }), {
      params: Promise.resolve({ id: "s1", docId }),
    });
  const archivo = (name: string, mimeType: string) => ({ id: "d1", name, mimeType, storagePath: `t-B/${name}` });

  beforeEach(() => {
    m.platformAPI.mockResolvedValue({ ok: true, username: "brandon" });
    m.obtener.mockResolvedValue(ticket());
    m.descargar.mockResolvedValue(Buffer.from("bytes"));
  });

  it("sin sesión 401; un sitio ajeno (Sec-Fetch-Site cross-site) 403 sin leer nada", async () => {
    m.platformAPI.mockResolvedValueOnce(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    expect((await pedir("d1")).status).toBe(401);
    expect((await pedir("d1", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(m.obtener).not.toHaveBeenCalled();
  });

  it("sólo los documentos de ESA solicitud: otro del negocio → 404 sin buscarlo; un ticket general → 404", async () => {
    m.doc.mockResolvedValue(archivo("otro.pdf", "application/pdf"));
    expect((await pedir("d9")).status).toBe(404);
    expect(m.doc).not.toHaveBeenCalled();
    m.obtener.mockResolvedValueOnce(ticket({ kind: "general" }));
    expect((await pedir("d1")).status).toBe(404);
    m.obtener.mockResolvedValueOnce(null);
    expect((await pedir("d1")).status).toBe(404);
    m.doc.mockResolvedValueOnce(null); // borrado del Archivo
    expect((await pedir("d1")).status).toBe(404);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("imagen inline y privada, con el tenant de la solicitud; la vista queda registrada en los dos lados", async () => {
    m.doc.mockResolvedValue(archivo("placa del camión.jpg", "image/jpeg"));
    const res = await pedir("d1");
    expect(res.status).toBe(200);
    expect(m.doc).toHaveBeenCalledWith("t-B", "d1");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="placa_del_cami_n.jpg"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await flush();
    expect(m.audit).toHaveBeenCalledWith("support_evidencia_ver", expect.stringContaining("001-123"), { ticketId: "s1", tenantId: "t-B", docId: "d1" }, "brandon");
    expect(m.activity).toHaveBeenCalledWith(
      "soporte_correccion_evidencia_vista",
      "Document",
      expect.stringContaining("Equipo Buleje"),
      "d1",
      "Equipo Buleje",
      undefined,
      "t-B",
    );
    expect(JSON.stringify(m.activity.mock.calls)).not.toContain("brandon");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; img-src 'self'; media-src 'self'");
  });

  it("SVG/HTML se bajan (attachment), nunca se abren en nuestro dominio; almacenamiento caído → 502", async () => {
    m.doc.mockResolvedValue(archivo("dibujo.svg", "image/svg+xml"));
    expect((await pedir("d1")).headers.get("content-disposition")).toMatch(/^attachment;/);
    m.doc.mockResolvedValue(archivo("hoja.html", "text/html"));
    expect((await pedir("d1")).headers.get("content-disposition")).toMatch(/^attachment;/);
    m.doc.mockResolvedValue(archivo("guia.pdf", "application/pdf"));
    const pdf = await pedir("d1");
    expect(pdf.headers.get("content-disposition")).toMatch(/^inline;/);
    // El visor de PDF del navegador no abre con `default-src 'none'`.
    expect(pdf.headers.get("content-security-policy")).toBeNull();
    m.descargar.mockResolvedValueOnce(null);
    expect((await pedir("d1")).status).toBe(502);
  });
});
