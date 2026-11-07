/**
 * Enlace público de solo ver de una cotización (noche 04-11, tramo 1):
 * token firmado con propósito propio + lectura con el tenant del token +
 * endpoint que no firma cotizaciones de otro negocio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.FIADO_STATEMENT_SECRET = "secreto-de-prueba-cotizacion-enlace-0123456789";
  type Fila = { id: string; tenantId: string };
  const filas: Fila[] = [];
  const getById = vi.fn(async (id: string, tenantId: string) => {
    const f = filas.find((x) => x.id === id && x.tenantId === tenantId);
    if (!f) return null;
    return {
      id: f.id,
      tenantId: f.tenantId,
      numero: "COT-0007",
      customerId: "cliente-interno-99",
      clienteNombre: "Ferretería Rivers",
      clienteRuc: "20123456789",
      validoHasta: "2026-11-20T05:00:00.000Z",
      status: "ENVIADA",
      subtotal: 100,
      igv: 18,
      total: 118,
      notas: "Entrega en Pucallpa",
      createdBy: "usuario-interno-1",
      createdAt: "2026-11-01T15:00:00.000Z",
      updatedAt: "2026-11-01T15:00:00.000Z",
      items: [{ id: "item-1", productoId: "prod-77", descripcion: "Tornillo 2x4", cantidad: 10, precioUnit: 10, descuento: 0, subtotal: 100 }],
    };
  });
  const auth = { tenantId: "negocio-b", role: "admin", userId: "u-b" };
  return { filas, getById, auth };
});

vi.mock("@/lib/db/cotizaciones.db", () => ({ CotizacionesDB: { getById: h.getById } }));
vi.mock("@/lib/db/membrete.db", () => ({
  MembreteDB: {
    del: vi.fn(async () => ({ nombre: "Bodega San Martín", logoUrl: null, telefono: "961 000 111", direccion: "Jr. Ucayali 1", ruc: "10456789012", pie: null })),
  },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(async () => ({ taxRate: 18 })) } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => h.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
// Tramo 2: la lectura pública también busca quién la aceptó (registro de actividad).
vi.mock("@/lib/db/activity-log.db", () => ({ ActivityLogDB: { list: vi.fn(async () => []) } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { create: vi.fn(async () => ({})) } }));

import { NextRequest } from "next/server";
import { generarTokenCotizacion, verificarTokenCotizacion, vidaDelEnlace } from "@/lib/cotizaciones/enlace-token";
import { leerCotizacionPublica } from "@/lib/cotizaciones/enlace-publico";
import { generateStatementToken, verifyStatementToken } from "@/lib/fiado/statement-token";
import { POST } from "@/app/api/cotizaciones/[id]/enlace/route";
import { logAudit } from "@/lib/audit-logger";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.parse("2026-11-04T12:00:00.000Z");

beforeEach(() => {
  h.filas.length = 0;
  h.filas.push({ id: "cot-a", tenantId: "negocio-a" }, { id: "cot-b", tenantId: "negocio-b" });
});

describe("token del enlace de cotización", () => {
  it("válido: devuelve negocio, cotización y cuándo vence", () => {
    const t = generarTokenCotizacion("negocio-a", "cot-a", 3 * DIA, AHORA)!;
    const v = verificarTokenCotizacion(t, AHORA + DIA);
    expect(v).toMatchObject({ valido: true, tenantId: "negocio-a", cotizacionId: "cot-a" });
  });

  it("vencido: deja de abrir pasado su plazo", () => {
    const t = generarTokenCotizacion("negocio-a", "cot-a", DIA, AHORA)!;
    expect(verificarTokenCotizacion(t, AHORA + 2 * DIA)).toEqual({ valido: false, motivo: "vencido" });
  });

  it("firma cambiada o cuerpo cambiado: no abre", () => {
    const t = generarTokenCotizacion("negocio-a", "cot-a", DIA, AHORA)!;
    const [cuerpo, firma] = t.split(".");
    const otraFirma = `${cuerpo}.${firma!.slice(0, -2)}${firma!.endsWith("AA") ? "BB" : "AA"}`;
    expect(verificarTokenCotizacion(otraFirma, AHORA)).toMatchObject({ valido: false });
    // Mismo formato, otra cotización: la firma de la original no le sirve.
    const otroCuerpo = Buffer.from(`cot.negocio-a.cot-b.${AHORA + DIA}`).toString("base64url");
    expect(verificarTokenCotizacion(`${otroCuerpo}.${firma}`, AHORA)).toEqual({ valido: false, motivo: "firma" });
  });

  it("un token de estado de cuenta no sirve como cotización, ni al revés", () => {
    const deCuenta = generateStatementToken("negocio-a", "cot-a");
    expect(verificarTokenCotizacion(deCuenta)).toMatchObject({ valido: false });
    const deCotizacion = generarTokenCotizacion("negocio-a", "cot-a", DIA)!;
    expect(verifyStatementToken(deCotizacion)).toMatchObject({ valid: false });
  });

  it("sin secreto en el servidor no se genera nada", () => {
    const antes = process.env.FIADO_STATEMENT_SECRET;
    const authAntes = process.env.AUTH_SECRET;
    delete process.env.FIADO_STATEMENT_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      expect(generarTokenCotizacion("negocio-a", "cot-a", DIA)).toBeNull();
    } finally {
      process.env.FIADO_STATEMENT_SECRET = antes;
      if (authAntes !== undefined) process.env.AUTH_SECRET = authAntes;
    }
  });

  it("vida: vigencia + 7 días, 30 sin vigencia, nunca menos de 7", () => {
    expect(vidaDelEnlace(new Date(AHORA + 10 * DIA), AHORA)).toBe(17 * DIA);
    expect(vidaDelEnlace(null, AHORA)).toBe(30 * DIA);
    expect(vidaDelEnlace("no es fecha", AHORA)).toBe(30 * DIA);
    expect(vidaDelEnlace(new Date(AHORA - 60 * DIA), AHORA)).toBe(7 * DIA);
  });
});

describe("lo que ve el cliente", () => {
  it("muestra la cotización del negocio del token, sin datos internos", async () => {
    const t = generarTokenCotizacion("negocio-a", "cot-a", 30 * DIA, AHORA)!;
    const c = await leerCotizacionPublica(t, AHORA);
    expect(c).toMatchObject({ numero: "COT-0007", total: 118, igv: 18, vencida: false, estado: "ENVIADA" });
    expect(c?.negocio).toMatchObject({ nombre: "Bodega San Martín", ruc: "10456789012" });
    const texto = JSON.stringify(c);
    for (const interno of ["cot-a", "negocio-a", "cliente-interno-99", "usuario-interno-1", "prod-77", "item-1"]) {
      expect(texto).not.toContain(interno);
    }
  });

  it("pasada la vigencia sale «vencida» (pero sigue abriendo la semana de gracia)", async () => {
    const t = generarTokenCotizacion("negocio-a", "cot-a", 30 * DIA, AHORA)!;
    const c = await leerCotizacionPublica(t, Date.parse("2026-11-23T12:00:00.000Z"));
    expect(c?.vencida).toBe(true);
  });

  it("cotización de otro negocio: no se muestra", async () => {
    // Token firmado para el negocio A pero con el id de una cotización del B.
    const t = generarTokenCotizacion("negocio-a", "cot-b", 30 * DIA, AHORA)!;
    expect(await leerCotizacionPublica(t, AHORA)).toBeNull();
    expect(h.getById).toHaveBeenLastCalledWith("cot-b", "negocio-a");
  });

  it("token alterado: no se muestra", async () => {
    expect(await leerCotizacionPublica("basura.basura", AHORA)).toBeNull();
  });
});

describe("POST /api/cotizaciones/[id]/enlace", () => {
  const pedir = (id: string) =>
    POST(new NextRequest(`http://localhost:3000/api/cotizaciones/${id}/enlace`, { method: "POST" }), { params: Promise.resolve({ id }) });

  it("cotización de otro negocio → 404 y sin enlace", async () => {
    const res = await pedir("cot-a"); // la sesión es del negocio B
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("/cotizacion/");
  });

  it("la propia → enlace que abre la misma cotización", async () => {
    const res = await pedir("cot-b");
    expect(res.status).toBe(200);
    const { url, venceEl } = (await res.json()) as { url: string; venceEl: string };
    expect(url).toMatch(/\/cotizacion\/[\w-]+\.[\w-]+$/);
    expect(Number.isNaN(Date.parse(venceEl))).toBe(false);
    const v = verificarTokenCotizacion(url.split("/cotizacion/")[1]!);
    expect(v).toMatchObject({ valido: true, tenantId: "negocio-b", cotizacionId: "cot-b" });
    // La auditoría va al negocio del que pidió el enlace, no a «__unknown__».
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "negocio-b", entityId: "cot-b" }));
  });
});
