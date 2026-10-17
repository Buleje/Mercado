import { describe, it, expect, vi } from "vitest";

// La cola lee la concurrencia al importarse: se fija ANTES de traerla.
process.env.DOC_ANALISIS_CONCURRENCIA = "2";
vi.mock("server-only", () => ({}));
const { enColaDeAnalisis, estadoDeLaCola } = await import("@/lib/documents/cola-analisis");

/** Una tarea que avisa cuándo arrancó y termina cuando se le dice. */
function tareaControlada() {
  let arrancada = false;
  let terminar: (v: string) => void = () => {};
  const fin = new Promise<string>((r) => { terminar = r; });
  const tarea = async () => { arrancada = true; return fin; };
  return { tarea, terminar, arrancada: () => arrancada };
}

describe("cola de análisis — de a pocos, no todos juntos", () => {
  it("deja pasar hasta el máximo y hace esperar al resto", async () => {
    const a = tareaControlada();
    const b = tareaControlada();
    const c = tareaControlada();

    const pa = enColaDeAnalisis("a", a.tarea);
    const pb = enColaDeAnalisis("b", b.tarea);
    const pc = enColaDeAnalisis("c", c.tarea);
    await Promise.resolve();
    await Promise.resolve();

    expect(a.arrancada()).toBe(true);
    expect(b.arrancada()).toBe(true);
    expect(c.arrancada()).toBe(false); // el tercero espera su turno
    expect(estadoDeLaCola().max).toBe(2);

    a.terminar("ok-a");
    await pa;
    await Promise.resolve();
    await Promise.resolve();
    expect(c.arrancada()).toBe(true); // liberado uno, entra el siguiente

    b.terminar("ok-b");
    c.terminar("ok-c");
    await expect(pb).resolves.toBe("ok-b");
    await expect(pc).resolves.toBe("ok-c");
    expect(estadoDeLaCola()).toEqual({ enCurso: 0, esperando: 0, max: 2 });
  });

  it("una tarea que falla no deja la cola trabada", async () => {
    await expect(enColaDeAnalisis("rota", async () => { throw new Error("documento ilegible"); }))
      .rejects.toThrow("documento ilegible");
    await expect(enColaDeAnalisis("siguiente", async () => "pasa")).resolves.toBe("pasa");
    expect(estadoDeLaCola().enCurso).toBe(0);
  });
});
