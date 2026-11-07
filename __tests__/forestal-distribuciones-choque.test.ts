/**
 * `choqueConOtraDistribucion` (revisión del 27-10 de ADR-519): una
 * distribución NUEVA no puede traer en un bloque el lote ni una corrida que ya
 * anotó un bloque de OTRA distribución guardada — sería la misma producción
 * amparada dos veces en el Anexo 04.
 *
 * Decisión documentada: un lote ya ELIMINADO no ampara nada, así que no traba
 * (bloquea sólo si el lote sigue vivo). Sin saber qué lotes viven
 * (`lotesVivos` ausente) se bloquea: lo seguro es no amparar dos veces.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: {}, ClaveOcupadaError: class extends Error {} }));

import { choqueConOtraDistribucion, DistribucionYaTomadaError } from "@/lib/db/forest-distribuciones.db";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { DistribucionRegistro } from "@/lib/forestal/distribucion-registro";

const bloque = (x: Partial<BloqueRolliza> = {}): BloqueRolliza =>
  ({ id: "b1", etiqueta: "B1", especie: "Cachimbo", m3: 2, origen: "trozas", trozaIds: ["t1", "t2"], ...x }) as BloqueRolliza;
const jornada = (dia: number, corridaId: string, lineNo: number) => ({ dia, corridaId, lineNo, estado: "declarada" as const, fecha: "2026-10-20" });
const octubre = {
  id: "d1",
  nombre: "Octubre",
  bloques: [bloque({ loteId: "L1", jornadasLibro: [jornada(1, "c31", 31)] })],
} as unknown as DistribucionRegistro;
const VIVOS = new Set(["L1"]);

describe("choqueConOtraDistribucion", () => {
  it("copia con el mismo lote (vivo) → error que nombra el bloque y la distribución dueños", () => {
    const e = choqueConOtraDistribucion([octubre], "d2", [bloque({ id: "b9", etiqueta: "A", loteId: "L1" })], VIVOS);
    expect(e).toBeInstanceOf(DistribucionYaTomadaError);
    expect(e?.message).toBe("Este lote ya es del bloque B1 de la distribución Octubre: ábrela desde Guardadas.");
    expect(e?.detalle).toEqual({ bloque: "A", loteId: "L1" });
  });

  it("re-guardar la MISMA distribución con su lote y su jornada → pasa (no choca consigo misma)", () => {
    expect(choqueConOtraDistribucion([octubre], "d1", octubre.bloques, VIVOS)).toBeNull();
  });

  it("sin lote ni corridas anotadas (sólo trozas) → pasa", () => {
    expect(choqueConOtraDistribucion([octubre], "d2", [bloque({ id: "b9", etiqueta: "A" })], VIVOS)).toBeNull();
  });

  it("lote de otra pero ya eliminado → pasa; sin saber qué lotes viven → se bloquea", () => {
    const copia = [bloque({ id: "b9", etiqueta: "A", loteId: "L1" })];
    expect(choqueConOtraDistribucion([octubre], "d2", copia, new Set())).toBeNull();
    expect(choqueConOtraDistribucion([octubre], "d2", copia)).toBeInstanceOf(DistribucionYaTomadaError);
  });

  it("sin lote pero con la jornada del Libro de otra → error que nombra la corrida", () => {
    const e = choqueConOtraDistribucion([octubre], "d2", [bloque({ id: "b9", etiqueta: "A", jornadasLibro: [jornada(1, "c31", 31)] })], VIVOS);
    expect(e?.message).toBe("La corrida N° 31 del bloque A ya es del bloque B1 de la distribución Octubre: ábrela desde Guardadas.");
    expect(e?.detalle).toEqual({ bloque: "A", corridaId: "c31" });
  });
});
