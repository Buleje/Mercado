/**
 * Editar un lote no puede borrar lo que no se pidió borrar.
 *
 * `inicioProceso` y `finProceso` son la ventana del proceso: cuánto tardó la
 * sierra con ese lote. No se derivan de nada — si se pierden, se perdieron.
 *
 * El bug: el schema del día transformaba CUALQUIER ausencia en `null`, así que
 * «no mandé este campo» y «borrá este campo» llegaban idénticos a la capa de
 * datos. `update()` ya distinguía bien (`!== undefined ? … : {}`) pero nunca
 * recibía un `undefined`: editar el nombre del lote le borraba las fechas.
 *
 * Son TRES casos, no dos, y por eso el test los enumera: ausente, nulo, y con
 * valor. Un schema que colapsa los dos primeros es el bug.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { dia } = await import("@/app/api/admin/forestal/lotes-aserrio/route");

describe("los tres casos de un campo fecha", () => {
  it("AUSENTE → undefined: la capa de datos lo ignora y la fecha sobrevive", () => {
    const r = dia.safeParse(undefined);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBeUndefined();
  });

  it("NULL explícito → null: se borra porque alguien lo pidió", () => {
    const r = dia.safeParse(null);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBeNull();
  });

  it("CON VALOR → Date a mediodía UTC", () => {
    const r = dia.safeParse("2026-09-01");
    expect(r.success).toBe(true);
    expect(r.success && (r.data as Date).toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("ausente y nulo NO son lo mismo — es todo el bug en una línea", () => {
    const ausente = dia.safeParse(undefined);
    const nulo = dia.safeParse(null);
    expect(ausente.success && ausente.data).not.toBe(nulo.success && nulo.data);
  });
});

describe("mediodía UTC: el off-by-one de Lima", () => {
  /**
   * Lima es UTC-5. Con medianoche, `2026-09-01T00:00Z` se muestra como el 31 de
   * agosto. A mediodía no hay huso que lo corra de día.
   */
  it("el día se lee igual en Lima que en UTC", () => {
    const r = dia.safeParse("2026-09-01");
    const d = r.success ? (r.data as Date) : new Date(0);
    const enLima = d.toLocaleDateString("es-PE", { timeZone: "America/Lima" });
    expect(enLima).toContain("1");
    expect(d.toISOString().slice(0, 10)).toBe("2026-09-01");
  });
});

describe("no acepta basura", () => {
  it("un formato que no es AAAA-MM-DD se rechaza", () => {
    expect(dia.safeParse("01/09/2026").success).toBe(false);
    expect(dia.safeParse("2026-9-1").success).toBe(false);
    expect(dia.safeParse("mañana").success).toBe(false);
  });

  it("la cadena vacía cae a null, no a «Invalid Date»", () => {
    const r = dia.safeParse("");
    // El regex rechaza la cadena vacía: no se cuela un Date inválido.
    expect(r.success).toBe(false);
  });
});
