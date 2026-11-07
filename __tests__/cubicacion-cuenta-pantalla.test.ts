/**
 * ADR-478 · lo que la pantalla le muestra al dueño antes de mover plata tiene
 * que ser lo que el servidor va a usar (verificación M4, 08-10):
 *   - «último: S/ X» sólo de la misma fórmula: un precio por PT sugerido para un
 *     lote en m³ Smalian es 424 veces otra cosa;
 *   - el volumen que se guarda sale de las MEDIDAS (como `cubicarEnServidor`),
 *     no del PT que quedó en cada fila del patio.
 */
import { describe, expect, it } from "vitest";
import { trozasParaGuardar, ultimosPrecios, type CubicacionTrozas } from "@/components/admin/forestal/hooks/use-cubicaciones-trozas";
import { cubicarEnServidor } from "@/lib/forestal/cubicacion-cuenta";

const cub = (codigo: string, formula: "smalian" | "oxapampina", fecha: string, precio: number): CubicacionTrozas =>
  ({
    id: codigo, codigo, formula, fecha, createdAt: `${fecha}T12:00:00.000Z`, estado: "aplicada",
    porEspecie: [{ clave: "tornillo", nombre: "Tornillo", n: 1, volumen: 1, precio, monto: precio }],
  }) as unknown as CubicacionTrozas;

describe("último precio por especie", () => {
  const aplicadas = [cub("CUB-1", "oxapampina", "2026-10-01", 1.1), cub("CUB-2", "oxapampina", "2026-10-05", 1.2), cub("CUB-3", "smalian", "2026-10-07", 480)];

  it("sugiere el más nuevo de la MISMA fórmula", () => {
    expect(ultimosPrecios(aplicadas, "oxapampina")).toEqual({ tornillo: 1.2 });
    expect(ultimosPrecios(aplicadas, "smalian")).toEqual({ tornillo: 480 });
  });

  it("sin cubicaciones aplicadas de esa fórmula, no sugiere nada", () => {
    expect(ultimosPrecios([cub("CUB-3", "smalian", "2026-10-07", 480)], "oxapampina")).toEqual({});
    expect(ultimosPrecios(null, "oxapampina")).toEqual({});
  });
});

describe("volumen que se guarda", () => {
  it("con 1 Ø sale de las medidas aunque la fila del patio traiga otro PT", () => {
    const filas = [
      { id: "a", d1: 20, d2: 20, largo: 10, especie: "Tornillo", m3: 0, pt: 0 },
      { id: "b", d1: 22, d2: 22, largo: 10, especie: "Tornillo", m3: 0, pt: 999 },
      { id: "c", d1: 18, d2: 18, largo: 12, especie: "Cumala", m3: 0, pt: 0 },
    ];
    /* El mismo caso de main (CUB-2026-0006): 360,82 + 158,69 = 519,51 PT. */
    expect(cubicarEnServidor("oxapampina", trozasParaGuardar(filas, 1, ""), 1).volumen).toBe(519.51);
  });
});
