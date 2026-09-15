/**
 * Quién puede anotar por WhatsApp, y quién no.
 *
 * Las dos propiedades que, mal hechas, no se ven hasta que es tarde:
 *
 *  1. **La lista blanca es POR NEGOCIO.** Un teléfono habilitado en el negocio
 *     A que le escribe al WhatsApp del negocio B tiene que caer como CLIENTE de
 *     B. Sin esa comparación la lista sería global y cruzaría tenants.
 *  2. **Pedir el código de WhatsApp NO puede matar el de Telegram.** Son dos
 *     pantallas distintas; si compartieran store, el dueño tipearía un código
 *     recién invalidado sin que nada se lo diga.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindMany, mockFindUnique, mockUpsert } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { settings: { findMany: mockFindMany, findUnique: mockFindUnique, upsert: mockUpsert } },
}));

const { WhatsAppDuenosDB, normalizarTelefono } = await import("@/lib/db/whatsapp-duenos.db");
const { crearCodigo, canjearCodigo, codigoVivoDe } = await import("@/lib/asistente/vinculacion");

/**
 * La fila de Settings de UN negocio con estos teléfonos habilitados.
 *
 * `puedeAnotar` lee por PK (`findUnique` del tenant que recibió el mensaje), no
 * busca el teléfono por todo Settings: la pregunta es «¿está en la lista de
 * ESTE negocio?».
 */
const settingsCon = (telefonos: string[]) => ({
  featureFlagsJson: JSON.stringify({
    whatsappDuenos: telefonos.map((t) => ({ telefono: t, nombre: "x", vinculadoEn: "2026-09-05" })),
  }),
});

beforeEach(() => vi.clearAllMocks());

describe("normalizar el teléfono", () => {
  it("deja sólo dígitos: «+51 987 000 111» y «51987000111» son el mismo", () => {
    expect(normalizarTelefono("+51 987 000 111")).toBe("51987000111");
    expect(normalizarTelefono("51987000111")).toBe("51987000111");
    expect(normalizarTelefono("(51) 987-000-111")).toBe("51987000111");
  });
});

describe("la lista blanca no cruza negocios", () => {
  it("el dueño del negocio A puede anotar en el negocio A", async () => {
    mockFindUnique.mockResolvedValue(settingsCon(["51987000111"]));
    expect(await WhatsAppDuenosDB.puedeAnotar("A", "+51 987 000 111")).toBe(true);
  });

  it("ese mismo teléfono, escribiéndole al WhatsApp del negocio B, es un CLIENTE", async () => {
    // B no lo tiene en SU lista — y la caché está indexada por (negocio,
    // teléfono), así que la respuesta de A no puede contestar por B.
    mockFindUnique.mockResolvedValue(settingsCon([]));
    expect(await WhatsAppDuenosDB.puedeAnotar("B", "51987000111")).toBe(false);
  });

  it("un negocio sin fila de Settings no habilita a nadie", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WhatsAppDuenosDB.puedeAnotar("C", "51999999999")).toBe(false);
  });

  it("un teléfono vacío nunca anota (y no consulta la base)", async () => {
    expect(await WhatsAppDuenosDB.puedeAnotar("D", "")).toBe(false);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("compara el teléfono ENTERO: un número que lo contiene no habilita", async () => {
    mockFindUnique.mockResolvedValue(settingsCon(["519870001119"]));
    expect(await WhatsAppDuenosDB.puedeAnotar("E", "51987000111")).toBe(false);
  });

  it("un featureFlagsJson roto no habilita a nadie (falla cerrado)", async () => {
    mockFindUnique.mockResolvedValue({ featureFlagsJson: "{no es json" });
    expect(await WhatsAppDuenosDB.puedeAnotar("F", "51987000111")).toBe(false);
  });
});

describe("el código de vinculación es por canal", () => {
  it("pedir el de WhatsApp NO invalida el de Telegram", () => {
    const tg = crearCodigo("t1", "brandon", "telegram");
    crearCodigo("t1", "brandon", "whatsapp");

    // El de Telegram sigue vivo y sigue canjeándose por Telegram.
    expect(codigoVivoDe("t1", "telegram")?.codigo).toBe(tg.codigo);
    expect(canjearCodigo(tg.codigo, "telegram")).toEqual({ tenantId: "t1", pedidoPor: "brandon" });
  });

  it("un código de WhatsApp no sirve para Telegram ni al revés", () => {
    const wa = crearCodigo("t2", "brandon", "whatsapp");
    expect(canjearCodigo(wa.codigo, "telegram")).toBeNull();
    expect(canjearCodigo(wa.codigo, "whatsapp")).toEqual({ tenantId: "t2", pedidoPor: "brandon" });
  });

  it("se quema al canjearlo: sirve UNA vez", () => {
    const wa = crearCodigo("t3", "brandon", "whatsapp");
    expect(canjearCodigo(wa.codigo, "whatsapp")).not.toBeNull();
    expect(canjearCodigo(wa.codigo, "whatsapp")).toBeNull();
  });

  it("un negocio tiene UN código de WhatsApp vivo: el nuevo pisa al viejo", () => {
    const primero = crearCodigo("t4", "brandon", "whatsapp");
    const segundo = crearCodigo("t4", "brandon", "whatsapp");
    expect(canjearCodigo(primero.codigo, "whatsapp")).toBeNull();
    expect(canjearCodigo(segundo.codigo, "whatsapp")).not.toBeNull();
  });
});
