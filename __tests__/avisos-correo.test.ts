/**
 * Avisos por correo de cada tienda (21-10): el interruptor del superadmin.
 *   - sin fila = todo encendido; pausado apaga todo; apagar un tipo apaga sólo ése
 *   - Json corrupto = por defecto (y se avisa); lectura que falla = el correo sale (fail-open)
 *   - resumen activos/total con y sin correo; «forestal» sólo cuenta en tiendas forestales
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  get: vi.fn(),
  actualizar: vi.fn(),
  logAdd: vi.fn(),
  warn: vi.fn(),
  filas: vi.fn(),
  googleActivas: vi.fn(),
  googleDe: vi.fn(),
  conForestal: vi.fn(),
  smtpPropio: vi.fn(),
  ultimosEnvios: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: m.warn, error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: { getCacheandoAusencia: m.get, actualizar: m.actualizar },
}));
vi.mock("@/lib/db/notifications.db", () => ({ NotificationLogsDB: { add: m.logAdd } }));
vi.mock("@/lib/db/avisos-correo.db", () => ({
  AvisosCorreoDB: {
    filas: m.filas,
    googleActivasPorTienda: m.googleActivas,
    googleDe: m.googleDe,
    conForestal: m.conForestal,
    smtpPropio: m.smtpPropio,
    ultimosEnvios: m.ultimosEnvios,
    tienda: vi.fn(),
  },
}));

import {
  avisoCorreoActivo,
  claveAvisosCorreo,
  detalleDeTienda,
  guardarAvisosCorreo,
  leerAvisosGuardados,
  registrarEnvioCorreo,
  resumenAvisosCorreo,
} from "@/lib/avisos-correo";

const MUSA = { id: "c-musa", slug: "musa", name: "Musa", ownerEmail: "duena@gmail.com" };
const BLAS = { id: "c-blas", slug: "blas", name: "Blas", ownerEmail: "blas@empresa.pe" };
const SIN_CORREO = { id: "main", slug: "main", name: "Main", ownerEmail: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.filas.mockResolvedValue([]);
  m.googleActivas.mockResolvedValue(new Map());
  m.googleDe.mockResolvedValue([]);
  m.conForestal.mockResolvedValue(new Set());
  m.smtpPropio.mockResolvedValue(null);
  m.ultimosEnvios.mockResolvedValue(new Map());
});

describe("avisoCorreoActivo", () => {
  it("sin fila guardada todo está encendido", async () => {
    m.get.mockResolvedValue(null);
    for (const tipo of ["pedidos", "stock", "reportes", "forestal", "cuenta"] as const) {
      expect(await avisoCorreoActivo("c-musa", tipo)).toBe(true);
    }
    expect(m.get).toHaveBeenCalledWith("avisos-correo:c-musa");
  });

  it("pausado apaga todos los tipos", async () => {
    m.get.mockResolvedValue({ pausado: true, apagados: [] });
    expect(await avisoCorreoActivo("c-musa", "pedidos")).toBe(false);
    expect(await avisoCorreoActivo("c-musa", "cuenta")).toBe(false);
  });

  it("apagar un tipo apaga sólo ése", async () => {
    m.get.mockResolvedValue({ pausado: false, apagados: ["stock"] });
    expect(await avisoCorreoActivo("c-musa", "stock")).toBe(false);
    expect(await avisoCorreoActivo("c-musa", "pedidos")).toBe(true);
  });

  it("Json corrupto = por defecto (todo encendido) y lo avisa en el log", async () => {
    m.get.mockResolvedValue({ pausado: "sí", apagados: "stock" });
    expect(await avisoCorreoActivo("c-musa", "stock")).toBe(true);
    expect(m.warn).toHaveBeenCalledWith(expect.stringContaining("inválido"), expect.objectContaining({ tenantId: "c-musa" }));
  });

  it("si la lectura falla el correo sale igual (fail-open) y queda en el log", async () => {
    m.get.mockRejectedValue(new Error("pooler caído"));
    expect(await avisoCorreoActivo("c-musa", "pedidos")).toBe(true);
    expect(m.warn).toHaveBeenCalled();
  });

  it("un tipo desconocido guardado no resetea los demás", () => {
    expect(leerAvisosGuardados({ pausado: false, apagados: ["viejo", "reportes"] })).toEqual({ pausado: false, apagados: ["reportes"] });
  });
});

describe("resumenAvisosCorreo (lista del superadmin)", () => {
  it("activos/total por tienda, con y sin correo, y forestal sólo donde aplica", async () => {
    m.filas.mockResolvedValue([{ key: claveAvisosCorreo("c-blas"), value: { pausado: false, apagados: ["reportes"] }, updatedBy: "sa", updatedAt: new Date() }]);
    m.conForestal.mockResolvedValue(new Set(["blas"])); // el libro forestal guarda el slug
    m.googleActivas.mockResolvedValue(new Map([["c-musa", 1], ["musa", 1]]));

    const r = await resumenAvisosCorreo([MUSA, BLAS, SIN_CORREO]);

    expect(r.get("c-musa")).toEqual({ correo: "duena@gmail.com", esGmail: true, pausado: false, activos: 4, total: 4, googleConectado: 2 });
    // Blas: forestal aplica (5 tipos), uno apagado → 4 activos
    expect(r.get("c-blas")).toMatchObject({ esGmail: false, activos: 4, total: 5 });
    // Sin correo no sale nada aunque esté todo encendido
    expect(r.get("main")).toMatchObject({ correo: null, activos: 0, total: 4 });
    // Una sola consulta de claves para las 3 tiendas
    expect(m.filas).toHaveBeenCalledTimes(1);
    expect(m.filas).toHaveBeenCalledWith(["avisos-correo:c-musa", "avisos-correo:c-blas", "avisos-correo:main"]);
  });

  it("pausada = 0 activos", async () => {
    m.filas.mockResolvedValue([{ key: claveAvisosCorreo("c-musa"), value: { pausado: true, apagados: [] }, updatedBy: null, updatedAt: new Date() }]);
    const r = await resumenAvisosCorreo([MUSA]);
    expect(r.get("c-musa")).toMatchObject({ pausado: true, activos: 0, total: 4 });
  });
});

describe("detalleDeTienda", () => {
  it("forestal no aplica en una bodega; último envío y quién cambió", async () => {
    const cuando = new Date("2026-10-21T15:00:00Z");
    m.filas.mockResolvedValue([{ key: claveAvisosCorreo("c-musa"), value: { pausado: false, apagados: ["cuenta"] }, updatedBy: "brandon", updatedAt: cuando }]);
    m.ultimosEnvios.mockResolvedValue(new Map([["correo_pedidos", cuando]]));
    m.googleDe.mockResolvedValue([{ email: "duena@gmail.com", estado: "activa", ultimaSync: null }]);

    const d = await detalleDeTienda(MUSA);

    const forestal = d.tipos.find((t) => t.tipo === "forestal");
    expect(forestal).toMatchObject({ aplica: false, activo: true });
    expect(d.tipos.find((t) => t.tipo === "cuenta")?.activo).toBe(false);
    expect(d.tipos.find((t) => t.tipo === "pedidos")?.ultimoEnvio).toBe(cuando.toISOString());
    expect(d).toMatchObject({ activos: 3, total: 4, googleConectado: 1, cambiadoPor: "brandon", cambiadoEn: cuando.toISOString() });
  });
});

describe("guardarAvisosCorreo", () => {
  /** El mock de `actualizar` corre el cambio contra un valor guardado y devuelve el resultado. */
  const conGuardado = (actual: unknown) =>
    m.actualizar.mockImplementation(async (_k: string, cambio: (a: unknown) => { resultado: unknown }) => cambio(actual).resultado);

  it("pausar y reanudar no toca los tipos apagados", async () => {
    conGuardado({ pausado: false, apagados: ["stock"] });
    expect(await guardarAvisosCorreo("c-musa", { pausado: true }, "sa")).toEqual({ pausado: true, apagados: ["stock"] });
    expect(m.actualizar).toHaveBeenCalledWith("avisos-correo:c-musa", expect.any(Function), "sa");
  });

  it("apagar y volver a encender un tipo", async () => {
    conGuardado(null);
    expect(await guardarAvisosCorreo("c-musa", { tipo: "reportes", activo: false }, "sa")).toEqual({ pausado: false, apagados: ["reportes"] });
    conGuardado({ pausado: false, apagados: ["stock", "reportes"] });
    expect(await guardarAvisosCorreo("c-musa", { tipo: "stock", activo: true }, "sa")).toEqual({ pausado: false, apagados: ["reportes"] });
  });
});

describe("registrarEnvioCorreo", () => {
  it("no tira si el registro falla", async () => {
    m.logAdd.mockRejectedValue(new Error("x"));
    await expect(registrarEnvioCorreo("c-musa", "stock", "a@b.pe", true, "ok")).resolves.toBeUndefined();
  });
});
