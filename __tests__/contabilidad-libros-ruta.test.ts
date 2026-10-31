/**
 * GET /api/admin/contabilidad/libros — sin sesión 401, consulta mala 400, el
 * tenant SIEMPRE el de la sesión (un `?tenantId=` ajeno se ignora), vista previa
 * recortada y archivos con su nombre «de trabajo».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  ventas: vi.fn(),
  compras: vi.fn(),
  kardex: vi.fn(),
  cabecera: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: H.logAudit }));
vi.mock("@/lib/db/libros-contador.db", () => ({
  LibrosContadorDB: { ventas: H.ventas, compras: H.compras, kardex: H.kardex, cabecera: H.cabecera },
}));

import { GET } from "@/app/api/admin/contabilidad/libros/route";

const pedir = (q: string) => GET(new NextRequest(`http://localhost/api/admin/contabilidad/libros?${q}`));

const ventaPos = (i: number) => ({
  id: `v${i}`,
  fecha: new Date(`2026-08-${String((i % 28) + 1).padStart(2, "0")}T15:00:00Z`),
  total: 10,
  comprobanteTipo: "ticket",
  comprobanteNumero: null,
  comprobanteDoc: null,
  clienteNombre: null,
  clienteDoc: null,
  clienteTipoDoc: null,
  lineas: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue({ tenantId: "tenant-a", username: "dueno", role: "owner" });
  H.ventas.mockResolvedValue({ periodo: "2026-08", comprobantes: [], ventasPos: Array.from({ length: 60 }, (_, i) => ventaPos(i)), pedidos: [], notasCredito: [], pedidosSinEntregar: 0, pedidosConComprobante: [], devoluciones: [] });
  H.compras.mockResolvedValue({ periodo: "2026-08", compras: [], gastos: [] });
  H.cabecera.mockResolvedValue({ ruc: "20123456789", razonSocial: "Bodega SAC" });
});

describe("GET /api/admin/contabilidad/libros", () => {
  it("sin sesión: 401 y no lee nada", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await pedir("libro=ventas&periodo=2026-08");
    expect(r.status).toBe(401);
    expect(H.ventas).not.toHaveBeenCalled();
  });

  it("pide los roles de los reportes de dinero", async () => {
    await pedir("libro=ventas&periodo=2026-08");
    expect(H.requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "owner"]);
  });

  it("consulta mala: 400 sin leer", async () => {
    for (const q of ["libro=caja&periodo=2026-08", "libro=ventas&periodo=2026-13", "libro=ventas&periodo=agosto", "libro=ventas&periodo=2026-08&formato=pdf"]) {
      const r = await pedir(q);
      expect(r.status, q).toBe(400);
    }
    expect(H.ventas).not.toHaveBeenCalled();
  });

  it("el tenant es el de la sesión aunque la URL traiga otro", async () => {
    await pedir("libro=ventas&periodo=2026-08&tenantId=tenant-b");
    expect(H.ventas).toHaveBeenCalledTimes(1);
    expect(H.ventas.mock.calls[0][0]).toBe("tenant-a");
    expect(H.ventas.mock.calls[0][1]).toMatchObject({ periodo: "2026-08" });
  });

  it("vista previa: 50 filas, el total de filas y los totales de TODO el mes", async () => {
    const r = await pedir("libro=ventas&periodo=2026-08");
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.filas).toHaveLength(50);
    expect(j.totalFilas).toBe(60);
    expect(j.totales.total).toBe(600);
    expect(H.logAudit).not.toHaveBeenCalled();
  });

  it("TXT y Excel: archivo «de trabajo» con su nombre y queda auditado", async () => {
    const txt = await pedir("libro=compras&periodo=2026-08&formato=txt");
    expect(txt.headers.get("Content-Disposition")).toContain("registro-compras-de-trabajo-2026-08.txt");
    expect(await txt.text()).toContain("Documento de trabajo");

    const xlsx = await pedir("libro=ventas&periodo=2026-08&formato=xlsx");
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("Content-Disposition")).toContain("registro-ventas-de-trabajo-2026-08.xlsx");
    const bytes = new Uint8Array(await xlsx.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // zip «PK»
    expect(H.cabecera).toHaveBeenCalledWith("tenant-a");
    expect(H.logAudit).toHaveBeenCalledTimes(2);
    expect(H.logAudit.mock.calls[0][0]).toMatchObject({ action: "EXPORT", tenantId: "tenant-a", entity: "Purchase" });
  });
});
