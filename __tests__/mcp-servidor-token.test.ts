/**
 * Buleje IA (ADR-528), carril 4 — la clave de una conexión MCP.
 * Formato, hash (la base nunca ve la clave), comparación en tiempo constante y
 * que una conexión pausada o revocada no autentique.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { asistenteConexion: db } }));

import * as crypto from "node:crypto";
import {
  formatoTokenValido,
  generarTokenMcp,
  hashesIguales,
  hashTokenMcp,
  prefijoVisible,
} from "@/lib/mcp-servidor/token";
import { AsistenteConexionesDB } from "@/lib/db/asistente-conexiones.db";

const fila = (token: string, extra: Record<string, unknown> = {}) => ({
  id: "cx1",
  tenantId: "t-a",
  nombre: "ChatGPT",
  tokenPrefijo: prefijoVisible(token),
  tokenHash: hashTokenMcp(token),
  usuario: "dueno",
  rol: "owner",
  permiteEscribir: false,
  activo: true,
  ultimoUso: null,
  usos: 0,
  creadoPor: "dueno",
  createdAt: new Date("2026-11-01T12:00:00Z"),
  revocadoAt: null,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("token MCP", () => {
  it("bul_mcp_ + 43 letras base64url (32 bytes), distinto cada vez", () => {
    const a = generarTokenMcp();
    const b = generarTokenMcp();
    expect(a).toMatch(/^bul_mcp_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(formatoTokenValido(a)).toBe(true);
    expect(formatoTokenValido("bul_mcp_corto")).toBe(false);
    expect(formatoTokenValido(`${a}x`)).toBe(false);
    expect(formatoTokenValido(a.replace("bul_mcp_", "sk_live_"))).toBe(false);
  });

  it("se guarda el SHA-256 hex y 12 letras visibles, nunca la clave", () => {
    const t = generarTokenMcp();
    expect(hashTokenMcp(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTokenMcp(t)).toBe(crypto.createHash("sha256").update(t).digest("hex"));
    expect(prefijoVisible(t)).toHaveLength(12);
    expect(prefijoVisible(t).startsWith("bul_mcp_")).toBe(true);
  });

  it("hashesIguales: igual/distinto, y no tira con largos distintos (timingSafeEqual sí tiraría)", () => {
    const h = hashTokenMcp(generarTokenMcp());
    expect(hashesIguales(h, h)).toBe(true);
    expect(hashesIguales(h, "0".repeat(64))).toBe(false);
    expect(hashesIguales(h, "abc")).toBe(false);
  });
});

describe("AsistenteConexionesDB", () => {
  it("crear devuelve la clave entera UNA vez y guarda solo hash + prefijo", async () => {
    db.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => fila("x", { ...data, tokenHash: undefined }));
    const { token, conexion } = await AsistenteConexionesDB.crear("t-a", {
      nombre: "ChatGPT",
      usuario: "dueno",
      rol: "owner",
      permiteEscribir: false,
      creadoPor: "dueno",
    });
    const data = db.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(formatoTokenValido(token)).toBe(true);
    expect(data.tokenHash).toBe(hashTokenMcp(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.tenantId).toBe("t-a");
    expect(JSON.stringify(conexion)).not.toContain("tokenHash");
  });

  it("autenticar: clave buena → conexión con su tenant; basura no va a la base", async () => {
    const t = generarTokenMcp();
    db.findUnique.mockResolvedValue(fila(t));
    const c = await AsistenteConexionesDB.autenticar(t);
    expect(c).toMatchObject({ id: "cx1", tenantId: "t-a", usuario: "dueno", permiteEscribir: false });
    expect(db.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashTokenMcp(t) } });

    db.findUnique.mockClear();
    expect(await AsistenteConexionesDB.autenticar("bul_mcp_../../admin")).toBeNull();
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("autenticar: inexistente, pausada o revocada → null", async () => {
    const t = generarTokenMcp();
    db.findUnique.mockResolvedValue(null);
    expect(await AsistenteConexionesDB.autenticar(t)).toBeNull();
    db.findUnique.mockResolvedValue(fila(t, { activo: false }));
    expect(await AsistenteConexionesDB.autenticar(t)).toBeNull();
    db.findUnique.mockResolvedValue(fila(t, { activo: false, revocadoAt: new Date() }));
    expect(await AsistenteConexionesDB.autenticar(t)).toBeNull();
    db.findUnique.mockResolvedValue(fila(t, { revocadoAt: new Date() }));
    expect(await AsistenteConexionesDB.autenticar(t)).toBeNull();
  });

  it("actualizar/revocar llevan el tenantId en el WHERE (otro negocio = null/false)", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await AsistenteConexionesDB.actualizar("t-b", "cx1", { permiteEscribir: true })).toBeNull();
    expect(db.updateMany.mock.calls[0][0].where).toEqual({ id: "cx1", tenantId: "t-b", revocadoAt: null });
    expect(await AsistenteConexionesDB.revocar("t-b", "cx1")).toBe(false);
    expect(db.updateMany.mock.calls[1][0].where).toEqual({ id: "cx1", tenantId: "t-b", revocadoAt: null });
    expect(db.updateMany.mock.calls[1][0].data).toMatchObject({ activo: false });
  });
});
