import { describe, expect, it, vi } from "vitest";
import { hayNovedades, procesarCola, type PapelEnCola } from "@/lib/forestal/ctp-cola-archivado";

const papel = (nombre: string): PapelEnCola => ({ clave: `k:${nombre}`, nombre });

const cola = [papel("GTF 019-1"), papel("Lista de trozas L-1"), papel("GTF 019-2")];

describe("procesarCola — cada hoja se toca UNA vez", () => {
  it("guarda todas las que no estaban", async () => {
    const guardar = vi.fn(async () => {});
    const r = await procesarCola(cola, { existe: async () => false, guardar });
    expect(guardar).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ guardadas: 3, yaEstaban: 0, fallidas: 0 });
    expect(r.nombres).toEqual(["GTF 019-1", "Lista de trozas L-1", "GTF 019-2"]);
  });

  it("la que YA estaba no se sube de nuevo, y la de al lado NO se saltea", async () => {
    // Este es el bug que se comió la lista de trozas de cada guía: el camino
    // "ya estaba" avanzaba la cola por su cuenta y el `finally` la avanzaba
    // otra vez, así que la hoja siguiente nunca se procesaba.
    const guardadas: string[] = [];
    const r = await procesarCola(cola, {
      existe: async (p) => p.nombre === "GTF 019-1",
      guardar: async (p) => {
        guardadas.push(p.nombre);
      },
    });
    expect(guardadas).toEqual(["Lista de trozas L-1", "GTF 019-2"]);
    expect(r).toMatchObject({ guardadas: 2, yaEstaban: 1, fallidas: 0 });
  });

  it("una que falla se cuenta y NO corta la fila", async () => {
    const guardadas: string[] = [];
    const r = await procesarCola(cola, {
      existe: async () => false,
      guardar: async (p) => {
        if (p.nombre === "Lista de trozas L-1") throw new Error("500 del Drive");
        guardadas.push(p.nombre);
      },
    });
    expect(guardadas).toEqual(["GTF 019-1", "GTF 019-2"]);
    expect(r).toMatchObject({ guardadas: 2, fallidas: 1 });
    // La que falló no figura entre las guardadas: el aviso no puede mentir.
    expect(r.nombres).not.toContain("Lista de trozas L-1");
  });

  it("si la comprobación de duplicado explota, tampoco corta la fila", async () => {
    const r = await procesarCola(cola, {
      existe: async (p) => {
        if (p.nombre === "GTF 019-1") throw new Error("Drive caído");
        return false;
      },
      guardar: async () => {},
    });
    expect(r).toMatchObject({ guardadas: 2, fallidas: 1 });
  });

  it("procesa en ORDEN y de a una, nunca en paralelo", async () => {
    const eventos: string[] = [];
    let vivos = 0;
    await procesarCola(cola, {
      existe: async () => false,
      guardar: async (p) => {
        vivos += 1;
        expect(vivos).toBe(1); // dos a la vez congelarían el panel
        eventos.push(p.nombre);
        await new Promise((r) => setTimeout(r, 1));
        vivos -= 1;
      },
    });
    expect(eventos).toEqual(cola.map((p) => p.nombre));
  });

  it("una cola vacía devuelve el resumen en cero y no llama a nada", async () => {
    const guardar = vi.fn(async () => {});
    const r = await procesarCola([], { existe: async () => false, guardar });
    expect(guardar).not.toHaveBeenCalled();
    expect(r).toEqual({ guardadas: 0, yaEstaban: 0, fallidas: 0, nombres: [] });
  });
});

describe("hayNovedades", () => {
  it("un resumen en cero no merece aviso", () => {
    expect(hayNovedades({ guardadas: 0, yaEstaban: 0, fallidas: 0, nombres: [] })).toBe(false);
  });

  it("lo que ya estaba TAMBIÉN se avisa: si no, parece que no hizo nada", () => {
    expect(hayNovedades({ guardadas: 0, yaEstaban: 2, fallidas: 0, nombres: [] })).toBe(true);
  });

  it("y lo que falló, obviamente", () => {
    expect(hayNovedades({ guardadas: 0, yaEstaban: 0, fallidas: 1, nombres: [] })).toBe(true);
  });
});
