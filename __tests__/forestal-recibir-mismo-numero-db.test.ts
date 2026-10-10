/**
 * El último control de duplicado al registrar una guía entera
 * (`WoodEntriesDB.crearDesdeGtfEnTx`, el de «Recibir» y el alta desde SERFOR)
 * mira la MISMA guía: N° tramo a tramo Y mismo titular o permiso (29-09-2026).
 * Antes miraba sólo el N°: recibir la guía de Chivis frenaba con «anula los
 * ingresos», que eran de Quinchunlla con el mismo N°.
 *
 * Tx simulada: el control se pasa o no; pasado, la tx falsa corta en el
 * primer paso de escritura con un marcador.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { WoodEntriesDB, type WoodEntryDesdeGtfInput } from "@/lib/db/wood-entries.db";

const QUIN = "QUINCHUNLLA PEREZ, NELLY";
const CHIVIS = "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS";
const PASO = "PASÓ_EL_CONTROL";

function tx(ingresos: Record<string, unknown>[]) {
  return {
    $executeRaw: vi.fn(async () => 0),
    woodEntry: {
      findMany: vi.fn(async () => ingresos),
      aggregate: vi.fn(async () => {
        throw new Error(PASO);
      }),
    },
  } as never;
}

const ingresoDeQuin = {
  id: "i1",
  libroNro: 7,
  gtfNumber: "019-001-0000013",
  serforNumeroRegistro: null,
  speciesCommonName: "Tornillo",
  providerName: QUIN,
  originCode: "19-SEC/REG-PLT-2018-020",
};

const alta = (providerName: string, originCode: string | null, gtfNumber = "19-001-13"): WoodEntryDesdeGtfInput => ({
  gtfNumber,
  providerName,
  originCode,
  createdBy: "prueba",
  lineas: [{ especieComun: "Tornillo", especieCientifica: null, trozas: [] } as unknown as WoodEntryDesdeGtfInput["lineas"][number]],
});

describe("crearDesdeGtfEnTx — «ya está registrada» es de ESTA guía", () => {
  it("la guía de Chivis con el mismo N° que un ingreso de Quinchunlla pasa el control", async () => {
    await expect(WoodEntriesDB.crearDesdeGtfEnTx(tx([ingresoDeQuin]), "t", alta(CHIVIS, "19-SEC/REG-PLT-2021-017"), null)).rejects.toThrow(PASO);
  });

  it("la misma guía de Quinchunlla (escrita distinto) frena con GTF_DUPLICADA", async () => {
    await expect(WoodEntriesDB.crearDesdeGtfEnTx(tx([ingresoDeQuin]), "t", alta("Nelly Quinchunlla Pérez", null), null)).rejects.toMatchObject({
      code: "GTF_DUPLICADA",
    });
  });

  it("el mismo N° de registro SERFOR es la misma guía, se llame como se llame", async () => {
    const conRegistro = { ...ingresoDeQuin, serforNumeroRegistro: "110-19-0472267" };
    const x = { ...alta(CHIVIS, "19-SEC/REG-PLT-2021-017"), serforNumeroRegistro: "110-19-0472267" };
    await expect(WoodEntriesDB.crearDesdeGtfEnTx(tx([conRegistro]), "t", x, null)).rejects.toMatchObject({ code: "GTF_DUPLICADA" });
  });
});
