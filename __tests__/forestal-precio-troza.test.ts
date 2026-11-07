/**
 * Precio máximo por troza y rendimiento por origen (noche 04-11, carril B1).
 * Las dos cuentas son puras; la ruta se prueba con la lectura mockeada
 * (sin sesión → 401, consulta rota → 400 en palabras, parámetros pasan).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  leerPrecioTroza: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/precio-troza-lectura", () => ({ leerPrecioTroza: H.leerPrecioTroza }));

import { MIN_CORRIDAS_MEDIDO, precioMaximoTroza, rendimientoParaPrecio } from "@/lib/forestal/precio-maximo-troza";
import { CLAVE_SIN_ORIGEN, origenDeIngreso, rendimientoPorOrigen, type CorridaParaOrigen } from "@/lib/forestal/rendimiento-por-origen";
import { GET } from "@/app/api/admin/forestal/precio-troza/route";

const sinPrecio = () => null;
const prov = (clave: string, nombre = clave) => ({ clave, nombre, detalle: null });

describe("precio máximo por m³ de rollo", () => {
  it("ejemplo de control: 56 % → 237,44 PT; a S/ 5,90 = S/ 1.400,90 brutos", () => {
    const d = precioMaximoTroza({ rendimientoPct: 56, precioVentaPt: 5.9, aserrioM3: null, fleteM3: null, margenPct: null });
    expect(d.ptPorM3).toBe(237.44);
    expect(d.ventaBrutaM3).toBe(1400.9);
    expect(d.precioMaximoM3).toBe(1400.9);
    expect(d.costosNoIngresados).toEqual(["aserrio", "flete", "margen"]);
  });

  it("resta aserrío, flete y el margen sobre la venta bruta", () => {
    const d = precioMaximoTroza({ rendimientoPct: 56, precioVentaPt: 5.9, aserrioM3: 200, fleteM3: 100, margenPct: 10 });
    expect(d.margenM3).toBe(140.09);
    expect(d.precioMaximoM3).toBe(960.81); // 1400,896 − 200 − 100 − 140,0896
    expect(d.costosNoIngresados).toEqual([]);
  });

  it("sin precio de venta no inventa: máximo null, nunca 0", () => {
    const d = precioMaximoTroza({ rendimientoPct: 56, precioVentaPt: null, aserrioM3: 200, fleteM3: null, margenPct: 10 });
    expect(d.ventaBrutaM3).toBeNull();
    expect(d.precioMaximoM3).toBeNull();
    expect(d.ptPorM3).toBe(237.44);
  });
});

describe("rendimiento medido vs regla del 56 %", () => {
  it("con corridas suficientes y creíbles usa lo medido (ponderado por m³)", () => {
    const r = rendimientoParaPrecio([
      { m3Entrada: 10, m3Salida: 6 },
      { m3Entrada: 10, m3Salida: 6.4 },
      { m3Entrada: 20, m3Salida: 12 },
    ]);
    expect(r.fuente).toBe("medido");
    expect(r.pct).toBe(61); // 24,4 / 40
    expect(r.corridas).toBe(3);
    expect(precioMaximoTroza({ rendimientoPct: r.pct, precioVentaPt: 5.9, aserrioM3: 0, fleteM3: 0, margenPct: 0 }).ptPorM3).toBe(258.64);
  });

  it("con pocas corridas usa la regla y lo dice", () => {
    const r = rendimientoParaPrecio([{ m3Entrada: 10, m3Salida: 7 }]);
    expect(MIN_CORRIDAS_MEDIDO).toBeGreaterThan(1);
    expect(r).toMatchObject({ fuente: "regla_56", pct: 56, medidoPct: 70, corridas: 1 });
    expect(r.motivo).toMatch(/pocas/);
  });

  it("medido fuera de 40-75 % no se usa (es bug de datos hasta demostrar lo contrario)", () => {
    const r = rendimientoParaPrecio(Array.from({ length: 4 }, () => ({ m3Entrada: 10, m3Salida: 9 })));
    expect(r).toMatchObject({ fuente: "regla_56", pct: 56, medidoPct: 90 });
    expect(r.motivo).toMatch(/creíble/);
  });

  it("una corrida sin aserrado anotado no hunde el medido", () => {
    const tres = Array.from({ length: 3 }, () => ({ m3Entrada: 10, m3Salida: 5 }));
    expect(rendimientoParaPrecio([...tres, { m3Entrada: 30, m3Salida: 0 }])).toMatchObject({ fuente: "medido", pct: 50, corridas: 3 });
  });

  it("sin corridas: regla del 56 % y medido null", () => {
    expect(rendimientoParaPrecio([])).toMatchObject({ fuente: "regla_56", pct: 56, medidoPct: null, corridas: 0 });
  });
});

describe("rendimiento por origen", () => {
  it("lote mixto: reparte los PT por m³ consumido y marca prorrateado", () => {
    const corridas: CorridaParaOrigen[] = [
      {
        id: "c1",
        lote: "LA-1",
        especie: "Tornillo",
        m3Entrada: 10,
        m3Salida: 5,
        consumos: [
          { origen: prov("s:a", "Aserradero A"), m3: 6 },
          { origen: prov("s:b", "Proveedor B"), m3: 4 },
        ],
      },
    ];
    const { filas, total } = rendimientoPorOrigen(corridas, sinPrecio);
    const a = filas.find((f) => f.clave === "s:a");
    const b = filas.find((f) => f.clave === "s:b");
    expect(a).toMatchObject({ m3Rollo: 6, ptProducidos: 1272, rendimientoPct: 50, prorrateado: true, lotes: 1, corridas: 1 });
    expect(b).toMatchObject({ m3Rollo: 4, ptProducidos: 848, prorrateado: true });
    expect(total).toMatchObject({ m3Rollo: 10, ptProducidos: 2120, rendimientoPct: 50, m3SinOrigen: 0 });
  });

  it("lo declarado sin guía va a «Sin origen» con su volumen, al final, sin repartirlo inventado", () => {
    const corridas: CorridaParaOrigen[] = [
      { id: "c1", lote: null, especie: "Tornillo", m3Entrada: 10, m3Salida: 6, consumos: [{ origen: prov("s:a"), m3: 7 }] },
      { id: "c2", lote: null, especie: "Tornillo", m3Entrada: 5, m3Salida: 2.5, consumos: [] },
    ];
    const { filas, total } = rendimientoPorOrigen(corridas, sinPrecio);
    expect(filas.at(-1)).toMatchObject({ clave: CLAVE_SIN_ORIGEN, sinOrigen: true, m3Rollo: 8, corridas: 2 });
    expect(filas[0]).toMatchObject({ clave: "s:a", m3Rollo: 7, prorrateado: true });
    expect(total.m3SinOrigen).toBe(8);
    expect(total.m3Rollo).toBe(15);
  });

  it("conserva los PT de la corrida (resto ≤ tolerancia) y salta la que no tiene aserrado", () => {
    const corridas: CorridaParaOrigen[] = [
      { id: "c1", lote: null, especie: "Tornillo", m3Entrada: 10, m3Salida: 5, consumos: [{ origen: prov("s:a"), m3: 9.9995 }] },
      { id: "c2", lote: null, especie: "Tornillo", m3Entrada: 8, m3Salida: 0, consumos: [{ origen: prov("s:b"), m3: 8 }] },
    ];
    const { filas, total } = rendimientoPorOrigen(corridas, sinPrecio);
    expect(total).toMatchObject({ ptProducidos: 2120, corridas: 1, m3SinOrigen: 0 });
    expect(filas.map((f) => f.clave)).toEqual(["s:a"]);
  });

  it("la diferencia es contra el promedio de SU especie, en PT y en soles", () => {
    const corridas: CorridaParaOrigen[] = [
      { id: "c1", lote: null, especie: "Tornillo", m3Entrada: 10, m3Salida: 6, consumos: [{ origen: prov("s:a"), m3: 10 }] },
      { id: "c2", lote: null, especie: "Tornillo", m3Entrada: 10, m3Salida: 5, consumos: [{ origen: prov("s:b"), m3: 10 }] },
      { id: "c3", lote: null, especie: "Capirona", m3Entrada: 10, m3Salida: 4, consumos: [{ origen: prov("s:c"), m3: 10 }] },
    ];
    const { filas } = rendimientoPorOrigen(corridas, (esp) => (esp === "Tornillo" ? 5.9 : null));
    const a = filas.find((f) => f.clave === "s:a");
    const c = filas.find((f) => f.clave === "s:c");
    // Tornillo promedia 55 %: A rindió 60 % → +0,05 × 10 × 424 = +212 PT → S/ 1.250,80.
    expect(a).toMatchObject({ rendimientoPct: 60, difPtVsPromedio: 212, difSolesVsPromedio: 1250.8, prorrateado: false });
    // Capirona sola es su propio promedio: 0 de diferencia aunque rinda 40 %.
    expect(c).toMatchObject({ rendimientoPct: 40, difPtVsPromedio: 0, difSolesVsPromedio: 0 });
  });

  it("sin precio de la especie y con diferencia: soles null y dice por qué", () => {
    const corridas: CorridaParaOrigen[] = [
      { id: "c1", lote: null, especie: "Capirona", m3Entrada: 10, m3Salida: 6, consumos: [{ origen: prov("s:a"), m3: 10 }] },
      { id: "c2", lote: null, especie: "Capirona", m3Entrada: 10, m3Salida: 4, consumos: [{ origen: prov("s:b"), m3: 10 }] },
    ];
    const a = rendimientoPorOrigen(corridas, sinPrecio).filas.find((f) => f.clave === "s:a");
    expect(a?.difSolesVsPromedio).toBeNull();
    expect(a?.difSolesFalta).toMatch(/Capirona/);
  });

  it("origen de la guía según cómo se agrupa; sin el dato → null (Sin origen)", () => {
    const w = { gtfNumber: "001-123", providerName: " Juan  Pérez ", providerDocument: "10456", supplierId: null, originSourceNumber: null };
    expect(origenDeIngreso(w, "proveedor")).toEqual({ clave: "d:10456", nombre: "Juan Pérez", detalle: "10456" });
    expect(origenDeIngreso(w, "guia")).toMatchObject({ clave: "g:001-123", nombre: "GTF 001-123" });
    expect(origenDeIngreso(w, "permiso")).toBeNull();
    expect(origenDeIngreso({ ...w, supplierId: "sup1" }, "proveedor")?.clave).toBe("s:sup1");
  });
});

describe("GET /api/admin/forestal/precio-troza", () => {
  const req = (qs = "") => new NextRequest(`http://localhost/api/admin/forestal/precio-troza${qs}`);
  beforeEach(() => {
    H.requireAdmin.mockReset();
    H.leerPrecioTroza.mockReset();
  });

  it("sin sesión → 401 y no lee nada", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await GET(req(), { params: Promise.resolve({}) });
    expect(r.status).toBe(401);
    expect(H.leerPrecioTroza).not.toHaveBeenCalled();
  });

  it("pide roles explícitos de plata", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    await GET(req(), { params: Promise.resolve({}) });
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner"]);
  });

  it("consulta rota → 400 con frase en español", async () => {
    H.requireAdmin.mockResolvedValue({ tenantId: "t1", role: "admin", username: "qa" });
    const r = await GET(req("?margen=abc"), { params: Promise.resolve({}) });
    expect(r.status).toBe(400);
    expect((await r.json()).message).toMatch(/margen/);
    const r2 = await GET(req("?desde=2026-10-10&hasta=2026-10-01"), { params: Promise.resolve({}) });
    expect((await r2.json()).message).toMatch(/antes/);
  });

  it("pasa el tenant de la sesión y los parámetros (vacío = no escrito)", async () => {
    H.requireAdmin.mockResolvedValue({ tenantId: "t1", role: "admin", username: "qa" });
    H.leerPrecioTroza.mockResolvedValue({ porEspecie: [], porOrigen: [] });
    const r = await GET(req("?especie=Tornillo&aserrio=150&flete=&margen=10&agrupar=permiso"), { params: Promise.resolve({}) });
    expect(r.status).toBe(200);
    expect(H.leerPrecioTroza).toHaveBeenCalledWith("t1", expect.objectContaining({ especie: "Tornillo", aserrioM3: 150, fleteM3: undefined, margenPct: 10, agruparPor: "permiso" }));
  });
});
