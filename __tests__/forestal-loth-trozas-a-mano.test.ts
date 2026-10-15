import { describe, expect, it } from "vitest";
import {
  ID_A_MANO,
  medidasDelLibro,
  observacionAMano,
  piezasAMano,
  revisarTrozaAMano,
  trozaAManoSchema,
  trozasDeFilas,
  trozadosNacidosDeLaGuia,
  trozasDelLibroAMano,
  volumenDeFila,
  volumenPorTroza,
} from "@/lib/forestal/loth-trozas-a-mano";
import { smalianVolume } from "@/lib/forestal/loth-constants";
import { listaDeTrozas, totalM3 } from "@/lib/forestal/loth-guia-despacho";

describe("trozas a mano del despacho con guía", () => {
  it("el volumen es Smalian SERFOR por troza × la cantidad", () => {
    expect(volumenPorTroza({ d1Cm: 40, d2Cm: 30, largoM: 4 })).toBe(smalianVolume(0.4, 0.3, 4));
    expect(volumenPorTroza({ d1Cm: 40, d2Cm: 30, largoM: 4 })).toBe(0.3848);
    expect(volumenDeFila({ d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 2 })).toBe(0.7696);
    // D1 y D2 en cualquier orden: Smalian no cambia.
    expect(volumenPorTroza({ d1Cm: 30, d2Cm: 40, largoM: 4 })).toBe(0.3848);
  });

  it("guarda D1 como el mayor y redondea a lo que guarda el libro antes de cubicar", () => {
    expect(medidasDelLibro({ d1Cm: 45.5, d2Cm: 50, largoM: 3.2 })).toEqual({
      diamMayorM: 0.5,
      diamMenorM: 0.455,
      lengthM: 3.2,
      volumeM3: 0.573,
    });
    // 45,55 cm se guarda 0,456 m (Decimal 8,3): el volumen sale de eso, no del tipeo.
    const m = medidasDelLibro({ d1Cm: 45.55, d2Cm: 45.55, largoM: 2.005 });
    expect(m.diamMayorM).toBe(0.456);
    expect(m.lengthM).toBe(2.01);
    expect(m.volumeM3).toBe(smalianVolume(0.456, 0.456, 2.01));
  });

  it("revisa lo tipeado: coma decimal, cantidad vacía = 1 y los límites del Cubicador", () => {
    expect(revisarTrozaAMano({ d1: "45,5", d2: "50", largo: "3.2", cantidad: "" })).toEqual({
      ok: true,
      troza: { d1Cm: 45.5, d2Cm: 50, largoM: 3.2, cantidad: 1 },
    });
    const vacio = revisarTrozaAMano({ d1: "", d2: "x", largo: "", cantidad: "1" });
    expect(vacio.ok).toBe(false);
    if (!vacio.ok) expect(Object.keys(vacio.errores).sort()).toEqual(["d1", "d2", "largo"]);
    // Lo tipeado fuera de rango se dice aunque falte otro campo.
    const aMedias = revisarTrozaAMano({ d1: "300", d2: "", largo: "", cantidad: "1" });
    expect(aMedias.ok).toBe(false);
    if (!aMedias.ok) {
      expect(aMedias.errores.d1).toMatch(/10 a 200 cm/);
      expect(aMedias.errores.d2).toBe("Falta D2");
    }

    const fuera = revisarTrozaAMano({ d1: "5", d2: "250", largo: "16", cantidad: "1,5" });
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) {
      expect(fuera.errores.d1).toMatch(/10 a 200 cm/);
      expect(fuera.errores.d2).toMatch(/10 a 200 cm/);
      expect(fuera.errores.largo).toMatch(/15 m/);
      expect(fuera.errores.cantidad).toMatch(/entero/);
    }
    expect(trozaAManoSchema.safeParse({ d1Cm: 40, d2Cm: 30, largoM: 0, cantidad: 1 }).success).toBe(false);
    expect(trozaAManoSchema.safeParse({ d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 151 }).success).toBe(false);
  });

  it("una fila con cantidad N son N trozas numeradas, saltando los códigos que ya imprime la guía", () => {
    const filas = [
      { d1Cm: 40, d2Cm: 30, largoM: 4, cantidad: 2 },
      { d1Cm: 50, d2Cm: 45.5, largoM: 3.2, cantidad: 1 },
    ];
    expect(trozasDeFilas(filas)).toBe(3);
    const piezas = piezasAMano(filas, ["2", "85-TOR-B"]);
    expect(piezas.map((p) => p.codigo)).toEqual(["1", "3", "4"]);
    expect(piezas.map((p) => p.volumeM3)).toEqual([0.3848, 0.3848, 0.573]);

    // En la guía cada troza es una fila con cantidad 1, y el total cierra con las filas de alta.
    const comoLibro = trozasDelLibroAMano(piezas, null);
    expect(comoLibro[0].id).toBe(`${ID_A_MANO}1`);
    expect(comoLibro.every((t) => t.planId === null && t.arbol === null)).toBe(true);
    const lista = listaDeTrozas(comoLibro);
    expect(lista.map((f) => [f.codificacion, f.d1Cm, f.d2Cm, f.cantidad])).toEqual([
      ["1", 40, 30, 1],
      ["3", 40, 30, 1],
      ["4", 50, 45.5, 1],
    ]);
    const suma = filas.reduce((a, f) => a + volumenDeFila(f), 0);
    expect(totalM3(comoLibro)).toBeCloseTo(suma, 3);
  });

  it("el largo se valida YA redondeado: 0,001 m (que el libro guarda 0 m y 0 m³) no pasa", () => {
    expect(trozaAManoSchema.safeParse({ d1Cm: 45, d2Cm: 40, largoM: 0.001, cantidad: 1 }).success).toBe(false);
    expect(trozaAManoSchema.safeParse({ d1Cm: 45, d2Cm: 40, largoM: 0.004, cantidad: 1 }).success).toBe(false);
    // 0,005 se guarda 0,01 m: es la troza más corta que el libro sabe escribir, y da volumen.
    expect(trozaAManoSchema.safeParse({ d1Cm: 45, d2Cm: 40, largoM: 0.005, cantidad: 1 }).success).toBe(true);
    expect(volumenPorTroza({ d1Cm: 10, d2Cm: 10, largoM: 0.01 })).toBeGreaterThan(0);
    const corta = revisarTrozaAMano({ d1: "45", d2: "40", largo: "0,001", cantidad: "1" });
    expect(corta.ok).toBe(false);
    if (!corta.ok) expect(corta.errores.largo).toMatch(/0,01 a 15 m/);
  });

  it("anular la guía: se anulan las trozas que nacieron con ella y no queda ninguna viva con su código", () => {
    const N = "025-001-0000001";
    type Linea = { id: string; trozaCode: string; treeCode: string | null; observations: string | null; status: string };
    const trozado: Linea[] = [
      { id: "a1", trozaCode: "1-0001", treeCode: null, observations: observacionAMano(N, "1"), status: "registrado" },
      { id: "a2", trozaCode: "2-0001", treeCode: null, observations: observacionAMano(N, "2"), status: "registrado" },
      // Del libro, con árbol: va en la guía pero no nació con ella → sólo se libera.
      { id: "l1", trozaCode: "12A", treeCode: "12", observations: null, status: "registrado" },
      // Del libro, sin árbol y anotada antes: tampoco nació con la guía.
      { id: "l2", trozaCode: "7", treeCode: null, observations: "Troza de prueba", status: "registrado" },
      // A mano, de OTRA guía cuyo N° empieza igual («…00012»): no es de esta.
      { id: "x1", trozaCode: "1-0012", treeCode: null, observations: observacionAMano(`${N}2`, "1"), status: "registrado" },
    ];
    const gtf = {
      gtfNumber: N,
      items: [
        { code: "12A", trozadoId: "l1" },
        { code: "7", trozadoId: "l2" },
        { code: "1-0001", codigoGuia: "1", trozadoId: "a1" },
        { code: "2-0001", codigoGuia: "2", trozadoId: "a2" },
      ],
    };
    const nacidos = trozadosNacidosDeLaGuia(gtf, trozado);
    expect(nacidos.sort()).toEqual(["a1", "a2"]);
    // La de la otra guía no se toca aunque se la pase (no está en los items).
    expect(trozadosNacidosDeLaGuia(gtf, trozado.filter((l) => l.id === "x1"))).toEqual([]);

    // Lo que hace la tx de anular: esas líneas pasan a «anulado».
    const despues = trozado.map((l) => (nacidos.includes(l.id) ? { ...l, status: "anulado" } : l));
    const vivosCon = (code: string) => despues.filter((l) => l.trozaCode === code && l.status === "registrado");
    expect(vivosCon("1-0001")).toEqual([]);
    expect(vivosCon("2-0001")).toEqual([]);
    expect(vivosCon("12A")).toHaveLength(1);
    expect(vivosCon("7")).toHaveLength(1);
    // Sin items (guía vieja) o sin trozadoId: nada nace de ella.
    expect(trozadosNacidosDeLaGuia({ gtfNumber: N, items: null }, trozado)).toEqual([]);
  });
});
