/**
 * El candado y el repetido de una GTF del Libro TH, del lado que ESCRIBE
 * (hallazgos #6 y #7, 29-09-2026).
 *
 *   · El candado va por el N° NORMALIZADO: «19-001-65» y «019-001-0000065» a la
 *     vez esperan el mismo turno (antes era el texto: entraban los dos).
 *   · El repetido se mira tramo a tramo y POR TITULAR: el mismo N° de otro
 *     titular es otro talonario; del mismo titular, o sin titular de un lado,
 *     frena con `GtfDuplicateError`.
 *
 * Base simulada: una tx falsa que registra el candado y devuelve las guías.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { GtfNumeroDB } from "@/lib/db/gtf-numero.db";
import { ForestGtfDB, GtfDuplicateError } from "@/lib/db/forest-gtf.db";

type Guia = { gtfNumber: string; titularName: string | null; tituloHabilitante: string | null; planId: string | null };

function txFalsa(guias: Guia[] = []) {
  const candados: unknown[][] = [];
  const consultas: unknown[] = [];
  const tx = {
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, ...valores: unknown[]) => {
      candados.push(valores);
      return 0;
    }),
    forestGtf: {
      findMany: vi.fn(async (q: { where: { gtfNumber: { endsWith: string } } }) => {
        consultas.push(q.where);
        return guias.filter((g) => g.gtfNumber.endsWith(q.where.gtfNumber.endsWith));
      }),
    },
  };
  return { tx: tx as never, candados, consultas };
}

const CHIVIS = "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS";

describe("GtfNumeroDB.bloquear — el candado por N° normalizado", () => {
  it("«19-001-65» y «019-001-0000065» toman el MISMO candado", async () => {
    const a = txFalsa();
    const b = txFalsa();
    await GtfNumeroDB.bloquear(a.tx, "t1", "19-001-65");
    await GtfNumeroDB.bloquear(b.tx, "t1", "019-001-0000065");
    expect(a.candados[0]).toEqual(b.candados[0]);
    expect(a.candados[0]).toEqual(["t1", "gtf-numero:19-1-65"]);
  });

  it("otro N° u otro tenant, otro candado", async () => {
    const a = txFalsa();
    const b = txFalsa();
    await GtfNumeroDB.bloquear(a.tx, "t1", "019-001-0000065");
    await GtfNumeroDB.bloquear(b.tx, "t2", "019-001-0000065");
    expect(a.candados[0]).not.toEqual(b.candados[0]);
  });
});

describe("ForestGtfDB.exigirSinRepetir — el repetido por titular", () => {
  const guias: Guia[] = [{ gtfNumber: "019-001-0000065", titularName: CHIVIS, tituloHabilitante: null, planId: "plan-chivis" }];

  it("el mismo N° escrito distinto y del MISMO titular frena", async () => {
    const { tx, consultas } = txFalsa(guias);
    await expect(
      ForestGtfDB.exigirSinRepetir(tx, "t1", "19-001-65", { titular: "C.N. Santa Rosa de Chivis", permiso: null, planId: null }),
    ).rejects.toBeInstanceOf(GtfDuplicateError);
    // Se trae por la cola sin ceros y se compara tramo a tramo.
    expect(consultas[0]).toMatchObject({ tenantId: "t1", deletedAt: null, gtfNumber: { endsWith: "65" } });
  });

  it("el mismo N° de OTRO titular no frena", async () => {
    const { tx } = txFalsa(guias);
    await expect(
      ForestGtfDB.exigirSinRepetir(tx, "t1", "019-001-0000065", { titular: "QUINCHUNLLA PEREZ, NELLY", permiso: null, planId: null }),
    ).resolves.toBeUndefined();
  });

  it("sin titular de un lado: frena por las dudas", async () => {
    const { tx } = txFalsa(guias);
    await expect(ForestGtfDB.exigirSinRepetir(tx, "t1", "019-001-0000065", { titular: null, permiso: null, planId: null })).rejects.toThrow(
      /Ya existe una GTF registrada con el número 019-001-0000065 de COMUNIDAD NATIVA SANTA ROSA DE CHIVIS/,
    );
  });

  it("otra serie con la misma cola no es el mismo N°", async () => {
    const { tx } = txFalsa(guias);
    await expect(
      ForestGtfDB.exigirSinRepetir(tx, "t1", "019-002-0000065", { titular: CHIVIS, permiso: null, planId: null }),
    ).resolves.toBeUndefined();
  });
});
