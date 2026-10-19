// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

/**
 * Subir productos con el piso de rebajas (Brandon 19-10, «Piso en lo que
 * falta»): una fila con su costo y un precio bajo costo + piso del negocio
 * responde 409 con las filas y NO crea ninguna; «Importar igual» reenvía con
 * `confirmarBajoPiso=true`, crea todo y queda en el registro. Hasta el 19-10
 * la ruta leía todo como .xlsx (un .csv caía en 503) y daba de alta con
 * upsert sobre max(id vivo) + 1, que pisaba productos borrados.
 */
const H = vi.hoisted(() => ({
  flags: { margenesRebajas: { pisoSobreCosto: 5, margenMinimoSugerido: 15 } } as Record<string, unknown>,
}));

const create = vi.fn(async (p: Record<string, unknown>) => ({ id: 99, ...p }));
const upsert = vi.fn(async (p: Record<string, unknown>) => p);
const listByBarcodes = vi.fn(async (_t: string, _c: string[]) => [] as Array<{ id: number; name: string; barcode: string }>);
const revalidateTag = vi.fn();
const logActivity = vi.fn(async (..._a: unknown[]) => undefined);
const getFeatureFlags = vi.fn(async (_t: string) => H.flags);

vi.mock("@/lib/db/products.db", () => ({
  ProductsDB: {
    create: (p: Record<string, unknown>) => create(p),
    upsert: (p: Record<string, unknown>) => upsert(p),
    listByBarcodes: (t: string, c: string[]) => listByBarcodes(t, c),
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { getFeatureFlags: (t: string) => getFeatureFlags(t) } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "qaadmin", role: "admin" })) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

const { POST } = await import("@/app/api/products/import/route");
const { requireAdmin } = await import("@/lib/require-admin");

/** Fila 2 = Arroz (bien), fila 3 = Leche Gloria (3,50 con costo 3,80: piso 3,99). */
const CSV_PUNTO_Y_COMA = "nombre;precio;precio_costo;stock\nArroz Costeño;6;4;10\nLeche Gloria;3,50;3,80;5\n";

function subir(contenido: BlobPart, nombre: string, confirmar?: string) {
  const fd = new FormData();
  fd.append("file", new File([contenido], nombre, { type: nombre.endsWith(".csv") ? "text/csv" : "application/octet-stream" }));
  if (confirmar !== undefined) fd.append("confirmarBajoPiso", confirmar);
  return POST(new NextRequest("http://localhost/api/products/import", { method: "POST", body: fd }));
}
const pisoLogs = () => logActivity.mock.calls.filter((c) => c[0] === "Precio bajo piso");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/products/import — piso de rebajas", () => {
  it("una fila bajo costo + 5 % = 409 con la fila y no crea ninguna", async () => {
    const res = await subir(CSV_PUNTO_Y_COMA, "productos.csv");
    expect(res.status).toBe(409);
    const d = await res.json();
    expect(d.codigo).toBe("bajo-piso");
    expect(d.error).toBe("Fila 3 · Leche Gloria: queda bajo costo + 5 % (S/ 3,99)");
    expect(d.avisos).toEqual([expect.objectContaining({ productId: null, fila: 3, precioActual: null, precioNuevo: 3.5, piso: 3.99 })]);
    expect(create).not.toHaveBeenCalled();
  });

  it("con confirmarBajoPiso=true crea las dos y anota quién confirmó", async () => {
    const res = await subir(CSV_PUNTO_Y_COMA, "productos.csv", "true");
    expect(res.status).toBe(201);
    expect((await res.json()).created).toBe(2);
    // Alta con id de la base (create), nunca upsert sobre un id calculado.
    expect(create.mock.calls.map((c) => [c[0].name, c[0].price, c[0].tenantId, "id" in c[0]])).toEqual([
      ["Arroz Costeño", 6, "t1", false],
      ["Leche Gloria", 3.5, "t1", false],
    ]);
    expect(upsert).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("tenant:t1:products", { expire: 0 });
    expect(pisoLogs()).toHaveLength(1);
    expect(pisoLogs()[0][2]).toBe("Bajo piso confirmado por qaadmin: Fila 3 · Leche Gloria: queda bajo costo + 5 % (S/ 3,99), puesto en S/ 3,50");
    expect(pisoLogs()[0][6]).toBe("t1");
  });

  it("otro valor de confirmación no vale", async () => {
    expect((await subir(CSV_PUNTO_Y_COMA, "productos.csv", "1")).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("en el piso o encima pasa; el piso sale del negocio de la sesión", async () => {
    const res = await subir("nombre;precio;precio_costo\nLeche Gloria;3,99;3,80\n", "p.csv");
    expect(res.status).toBe(201);
    expect(getFeatureFlags).toHaveBeenCalledWith("t1");
    expect(pisoLogs()).toHaveLength(0);
  });

  it("sin costo pasa sin leer Ajustes", async () => {
    const res = await subir("nombre,precio\nLeche Gloria,1\n", "p.csv");
    expect(res.status).toBe(201);
    expect(getFeatureFlags).not.toHaveBeenCalled();
  });

  it("CSV con comas, comillas y acentos de Excel en Windows (latin1)", async () => {
    const latin1 = Buffer.from('nombre,precio,precio_costo\n"Café, molido",5,2\n', "latin1");
    const res = await subir(new Uint8Array(latin1), "p.csv");
    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0]).toMatchObject({ name: "Café, molido", price: 5, costPrice: 2 });
  });

  it("un .xlsx sigue entrando y también se mide", async () => {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet("Productos");
    hoja.addRow(["nombre", "precio", "precio_costo"]);
    hoja.addRow(["Leche Gloria", 3.5, 3.8]);
    const buf = await wb.xlsx.writeBuffer();
    const res = await subir(new Uint8Array(buf as ArrayBuffer), "p.xlsx");
    expect(res.status).toBe(409);
    expect((await res.json()).avisos[0].fila).toBe(2);
  });

  it("el mismo código dos veces en el archivo: crea la primera y avisa la segunda", async () => {
    const csv = "nombre;precio;codigo_barras\nArroz Costeño;6;7751234560011\nArroz Costeño 5 kg;28;7751234560011\nSal Emsal;1,50;\n";
    const res = await subir(csv, "p.csv");
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d.created).toBe(2);
    expect(create.mock.calls.map((c) => c[0].name)).toEqual(["Arroz Costeño", "Sal Emsal"]);
    expect(d.errors).toEqual([{ row: 3, message: "Fila 3 · ese código ya está en la fila 2 del archivo (Arroz Costeño)" }]);
    // Una sola consulta, con los códigos sin repetir y el negocio de la sesión.
    expect(listByBarcodes).toHaveBeenCalledTimes(1);
    expect(listByBarcodes).toHaveBeenCalledWith("t1", ["7751234560011"]);
  });

  it("un código que ya tiene un producto del negocio no se crea (subir dos veces el mismo archivo)", async () => {
    listByBarcodes.mockResolvedValueOnce([{ id: 7, name: "Arroz Costeño 1 kg", barcode: "7751234560011" }]);
    const res = await subir("nombre,precio,codigo_barras\nArroz Costeño,6,7751234560011\n", "p.csv");
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d.created).toBe(0);
    expect(d.errors).toEqual([{ row: 2, message: "Fila 2 · ya existe un producto con ese código (Arroz Costeño 1 kg)" }]);
    expect(create).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("una fila saltada por código no dispara el piso", async () => {
    listByBarcodes.mockResolvedValueOnce([{ id: 7, name: "Leche Gloria", barcode: "775" }]);
    const res = await subir("nombre;precio;precio_costo;codigo_barras\nLeche Gloria;3,50;3,80;775\n", "p.csv");
    expect(res.status).toBe(201);
    expect(create).not.toHaveBeenCalled();
  });

  it("CSV con punto y coma, BOM de Excel y comillas", async () => {
    const csv = '\uFEFFnombre;precio;precio_costo;codigo_barras\n"Aceite; Primor ""1 L""";12,90;9,50;7750000000123\n';
    const res = await subir(csv, "p.csv");
    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0]).toMatchObject({ name: 'Aceite; Primor "1 L"', price: 12.9, costPrice: 9.5, barcode: "7750000000123" });
  });

  it("un archivo de más de 10 MB = 413 sin leerlo", async () => {
    const res = await subir(new Uint8Array(10_000_001), "grande.csv");
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("El archivo pesa 10,0 MB: el tope es 10 MB");
    expect(listByBarcodes).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("sin sesión = 401", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce(NextResponse.json({ error: "No autorizado" }, { status: 401 }) as never);
    expect((await subir(CSV_PUNTO_Y_COMA, "productos.csv")).status).toBe(401);
  });
});
