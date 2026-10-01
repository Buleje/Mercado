/**
 * Un chat de Telegram pertenece a UN negocio.
 *
 * A diferencia de WhatsApp —donde el número que RECIBE el mensaje ya dice de qué
 * negocio se trata— acá el bot es uno solo para todos: lo único que decide en
 * qué libro se anota es a qué negocio está vinculado el chat.
 *
 * Si un chat quedara en dos, `tenantDeChat()` devolvía el primero que la base
 * entregara: la misma frase podía caer en un libro distinto entre dos mensajes,
 * sin que nada lo dijera. Se arregló por los dos lados —haciendo imposible el
 * estado (vincular muda, no copia) y volviendo determinística la lectura por si
 * quedaran datos viejos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findMany, findUnique, update, upsert } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { settings: { findMany, findUnique, update, upsert } },
}));

const { TelegramDB } = await import("@/lib/db/telegram.db");

const CHAT = 8611634453;

/** Una fila de Settings con este chat vinculado. */
const filaCon = (tenantId: string, vinculadoEn: string) => ({
  tenantId,
  featureFlagsJson: JSON.stringify({
    telegramChats: [{ chatId: CHAT, nombre: "Brandon", vinculadoEn }],
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
  update.mockResolvedValue({});
  upsert.mockResolvedValue({});
  // El caché de chat→tenant es de módulo; se usa un chatId distinto por test
  // donde importa, y acá se limpia lo que se puede.
});

describe("vincular MUDA, no copia", () => {
  it("saca el chat del negocio anterior antes de ponerlo en el nuevo", async () => {
    findMany.mockResolvedValue([filaCon("bodega", "2026-09-01T00:00:00.000Z")]);

    await TelegramDB.vincular("forestal", { chatId: CHAT, nombre: "Brandon", ultimoUso: null });

    // Se actualizó la fila del negocio VIEJO sacando el chat.
    expect(update).toHaveBeenCalledTimes(1);
    const llamada = update.mock.calls[0][0];
    expect(llamada.where.tenantId).toBe("bodega");
    expect(JSON.parse(llamada.data.featureFlagsJson).telegramChats).toEqual([]);
  });

  it("no se toca a sí mismo: revincular al MISMO negocio no dispara la mudanza", async () => {
    findMany.mockResolvedValue([filaCon("forestal", "2026-09-01T00:00:00.000Z")]);

    await TelegramDB.vincular("forestal", { chatId: CHAT, nombre: "Brandon", ultimoUso: null });

    expect(update).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("un chat nuevo no busca nada que sacar", async () => {
    findMany.mockResolvedValue([]);
    await TelegramDB.vincular("forestal", { chatId: CHAT, nombre: "Brandon", ultimoUso: null });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("leer es determinístico aunque queden datos viejos", () => {
  it("con el chat en dos negocios, elige SIEMPRE el vínculo más reciente", async () => {
    const chatViejo = 111;
    const dos = [
      {
        tenantId: "bodega",
        featureFlagsJson: JSON.stringify({
          telegramChats: [{ chatId: chatViejo, nombre: "B", vinculadoEn: "2026-01-01T00:00:00.000Z" }],
        }),
      },
      {
        tenantId: "forestal",
        featureFlagsJson: JSON.stringify({
          telegramChats: [{ chatId: chatViejo, nombre: "B", vinculadoEn: "2026-09-05T00:00:00.000Z" }],
        }),
      },
    ];

    findMany.mockResolvedValue(dos);
    expect(await TelegramDB.tenantDeChat(chatViejo)).toBe("forestal");
  });

  it("el orden en que la base devuelva las filas no cambia la respuesta", async () => {
    const chatA = 222;
    const chatB = 333;
    const armar = (id: number) => [
      {
        tenantId: "forestal",
        featureFlagsJson: JSON.stringify({
          telegramChats: [{ chatId: id, nombre: "B", vinculadoEn: "2026-09-05T00:00:00.000Z" }],
        }),
      },
      {
        tenantId: "bodega",
        featureFlagsJson: JSON.stringify({
          telegramChats: [{ chatId: id, nombre: "B", vinculadoEn: "2026-01-01T00:00:00.000Z" }],
        }),
      },
    ];

    findMany.mockResolvedValueOnce(armar(chatA));
    const primero = await TelegramDB.tenantDeChat(chatA);
    // Mismo contenido, orden invertido, otro chatId para esquivar el caché.
    findMany.mockResolvedValueOnce([...armar(chatB)].reverse());
    const segundo = await TelegramDB.tenantDeChat(chatB);

    expect(primero).toBe("forestal");
    expect(segundo).toBe("forestal");
  });

  it("el LIKE es un filtro, no la prueba: un chatId que sólo lo contiene no cuenta", async () => {
    findMany.mockResolvedValue([
      {
        tenantId: "otro",
        featureFlagsJson: JSON.stringify({
          telegramChats: [{ chatId: 4449999, nombre: "X", vinculadoEn: "2026-09-05T00:00:00.000Z" }],
        }),
      },
    ]);
    expect(await TelegramDB.tenantDeChat(444)).toBeNull();
  });
});
