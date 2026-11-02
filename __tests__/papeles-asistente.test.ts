/**
 * Los papeles que devuelve el asistente (ADR-528, dominio `papeles`).
 *
 *  - cotización: mismos totales que el módulo (precio del catálogo si no se
 *    dictó, IGV por línea), ensayo sin escribir, `data.papel` con la ruta que
 *    abre la hoja; solo dueño/admin (la ruta de la hoja es admin/owner);
 *  - liquidación: solo dueño/admin; persona ajena = error;
 *  - comprobante: sin Modo SUNAT Oficial NO se arma un papel con cara de boleta;
 *  - la hoja (`GET /api/admin/ia/papeles/cotizacion/[id]`): una cotización de
 *    otro negocio = 404, sin sesión = lo que diga requireAdmin (401).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  productos: vi.fn(),
  siguiente: vi.fn(),
  crear: vi.fn(),
  getById: vi.fn(),
  oficial: vi.fn(),
  porPedido: vi.fn(),
  archivar: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn(async () => undefined) } }));
vi.mock("@/lib/db/cotizaciones.db", () => ({
  CotizacionesDB: { productosParaCotizar: h.productos, siguienteNumero: h.siguiente, create: h.crear, getById: h.getById },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(async () => ({ taxRate: 18 })) } }));
vi.mock("@/lib/db/sunat.db", () => ({ SunatDB: { findByOrderId: h.porPedido, getConfig: vi.fn(async () => null) } }));
vi.mock("@/lib/db/membrete.db", () => ({ MembreteDB: { del: vi.fn(async () => null) } }));
vi.mock("@/lib/sunat/modo-oficial", () => ({ isSunatOficial: h.oficial }));
vi.mock("@/lib/adelantos/estado-cuenta-archivar.server", () => ({ archivarEstadoDeCuenta: h.archivar }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

const { papelesAgent } = await import("@/lib/agents/domains/papeles.agent");
const { GET } = await import("@/app/api/admin/ia/papeles/cotizacion/[id]/route");

const ctx = (actorRole = "owner") => ({ tenantId: "tenant-a", traceId: "t", actorRole, actorUsuario: "brandon" });
const tarea = (action: string, payload: Record<string, unknown>) => ({
  id: "t1", priority: "normal" as const, status: "pending" as const, createdAt: "2026-11-01T00:00:00.000Z", traceId: "t", domain: "papeles" as const, action, payload, tenantId: "tenant-a",
});

const pedidoDeTablas = {
  clienteNombre: "Maderas del Oriente",
  items: [
    { descripcion: "Tabla tornillo 1×8×10", cantidad: 20, precioUnit: 35 },
    { descripcion: "Listón", cantidad: 10, productoId: "7" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.productos.mockResolvedValue([{ id: 7, nombre: "Listón", precio: 12.5, taxType: "gravado" }]);
  h.siguiente.mockResolvedValue("COT-0042");
  h.crear.mockImplementation(async (_t: string, d: Record<string, unknown>) => ({ id: "cot-1", ...d }));
  h.oficial.mockResolvedValue(false);
});

describe("cotización", () => {
  it("el ensayo calcula el total en el servidor (precio del catálogo si no se dictó) y no crea nada", async () => {
    const r = await papelesAgent.execute(tarea("cotizacion", { ...pedidoDeTablas, __validar: true }), ctx());
    expect(r.success).toBe(true);
    // 20 × 35 + 10 × 12,50 = 825 (precios con IGV).
    expect((r.data as { total: number }).total).toBe(825);
    expect((r.data as { resumen: string }).resumen).toContain("Maderas del Oriente");
    expect(h.crear).not.toHaveBeenCalled();
  });

  it("al confirmar crea con el n.º correlativo y devuelve el papel con la ruta de la hoja", async () => {
    const r = await papelesAgent.execute(tarea("cotizacion", pedidoDeTablas), ctx());
    expect(r.success).toBe(true);
    const [tenant, datos] = h.crear.mock.calls[0];
    expect(tenant).toBe("tenant-a");
    expect(datos.numero).toBe("COT-0042");
    expect(datos.total).toBe(825);
    expect(datos.items[1]).toMatchObject({ precioUnit: 12.5, productoId: "7", subtotal: 125 });
    expect((r.data as { papel: unknown }).papel).toMatchObject({
      tipo: "cotizacion",
      url: "/api/admin/ia/papeles/cotizacion/cot-1",
    });
  });

  it("sin precio dictado ni producto del catálogo, pregunta en vez de inventar", async () => {
    const r = await papelesAgent.execute(
      tarea("cotizacion", { clienteNombre: "X", items: [{ descripcion: "Algo", cantidad: 1 }] }),
      ctx(),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Falta el precio/);
  });

  it("el encargado no la saca desde el chat (la hoja es solo admin/owner)", async () => {
    const r = await papelesAgent.execute(tarea("cotizacion", pedidoDeTablas), ctx("manager"));
    expect(r.success).toBe(false);
    expect(h.crear).not.toHaveBeenCalled();
  });
});

describe("liquidación", () => {
  it("devuelve el estado de cuenta archivado como papel con su documento", async () => {
    h.archivar.mockResolvedValue({ documentId: "doc-9", nombre: "Don Lucho", nombreArchivo: "x.pdf", lineas: 4, totales: { neto: 350 } });
    const r = await papelesAgent.execute(tarea("liquidacion", { personaId: "per-1" }), ctx("admin"));
    expect(r.success).toBe(true);
    expect(h.archivar).toHaveBeenCalledWith("tenant-a", "per-1", expect.objectContaining({ rol: "admin" }));
    expect((r.data as { papel: unknown }).papel).toMatchObject({
      tipo: "liquidacion",
      url: "/api/admin/documents/doc-9/raw",
      documentoId: "doc-9",
    });
  });

  it("persona de otro negocio (null) es error; el cajero no la saca", async () => {
    h.archivar.mockResolvedValue(null);
    expect((await papelesAgent.execute(tarea("liquidacion", { personaId: "ajena" }), ctx())).success).toBe(false);
    h.archivar.mockClear();
    expect((await papelesAgent.execute(tarea("liquidacion", { personaId: "per-1" }), ctx("cajero"))).success).toBe(false);
    expect(h.archivar).not.toHaveBeenCalled();
  });
});

describe("comprobante", () => {
  it("sin Modo SUNAT Oficial lo dice claro y NO devuelve papel", async () => {
    const r = await papelesAgent.execute(tarea("comprobante", {}), ctx());
    expect(r.success).toBe(true);
    const d = r.data as { emiteDeVerdad: boolean; resumen: string; papel?: unknown };
    expect(d.emiteDeVerdad).toBe(false);
    expect(d.papel).toBeUndefined();
    expect(d.resumen).toMatch(/NO emite/);
    expect(h.porPedido).not.toHaveBeenCalled();
  });

  it("con modo oficial y un pedido ya emitido, devuelve ese comprobante", async () => {
    h.oficial.mockResolvedValue(true);
    h.porPedido.mockResolvedValue({ series: "B001", number: 15, total: 50, sunatStatus: "accepted", pdfUrl: "https://x/b.pdf" });
    const r = await papelesAgent.execute(tarea("comprobante", { pedidoId: "ord-1" }), ctx());
    expect(h.porPedido).toHaveBeenCalledWith("tenant-a", "ord-1");
    expect((r.data as { papel: { titulo: string } }).papel.titulo).toBe("Comprobante B001-00000015");
  });
});

describe("GET /api/admin/ia/papeles/cotizacion/[id]", () => {
  const req = () => new NextRequest("http://localhost/api/admin/ia/papeles/cotizacion/cot-1");
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("sin sesión responde lo de requireAdmin (401), con roles admin/owner", async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await GET(req(), params("cot-1"));
    expect(r.status).toBe(401);
    expect(h.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner"]);
  });

  it("una cotización de otro negocio = 404 (se busca con el tenant de la sesión)", async () => {
    h.requireAdmin.mockResolvedValue({ tenantId: "tenant-b", role: "owner", username: "otro" });
    h.getById.mockResolvedValue(null);
    const r = await GET(req(), params("cot-1"));
    expect(r.status).toBe(404);
    expect(h.getById).toHaveBeenCalledWith("cot-1", "tenant-b");
  });

  it("la propia devuelve la hoja en HTML", async () => {
    h.requireAdmin.mockResolvedValue({ tenantId: "tenant-a", role: "owner", username: "brandon" });
    h.getById.mockResolvedValue({
      id: "cot-1", numero: "COT-0042", clienteNombre: "Maderas del Oriente", subtotal: 699.15, igv: 125.85, total: 825,
      validoHasta: "2026-11-08T04:59:59.000Z", createdAt: "2026-11-01T15:00:00.000Z",
      items: [{ descripcion: "Tabla tornillo", cantidad: 20, precioUnit: 35, descuento: 0, subtotal: 700 }],
    });
    const r = await GET(req(), params("cot-1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain("COT-0042");
    expect(html).toContain("Maderas del Oriente");
  });
});
