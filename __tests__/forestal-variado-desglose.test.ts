import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { agregarEspecie, CATALOGO_VACIO, editarEspecie } from "@/lib/forestal/especies-catalogo";
import {
  agruparPiezasIguales,
  desglosarPaquetes,
  desglosarVariado,
  ESPECIE_VARIADO,
  esVariado,
  leerConfigVariado,
  NIVEL_PESO,
  pesosPorEspecie,
  toleranciaCuadrePt,
  VARIADO_DEFAULT,
  type ConfigVariado,
} from "@/lib/forestal/variado-desglose";

const pieza = (id: string, cantidad: number, e: number, a: number, largo: number, especie: string): PiezaCubicada => ({
  id, cantidad, espesor: e, ancho: a, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie,
  ...cubicarPieza({ cantidad, espesor: e, ancho: a, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }),
});
const bloque = (id: string, especie: string, m3: number): BloqueRolliza => ({
  id, etiqueta: id, especie, m3, origen: "manual", tipo: "aserrada",
});
const seccion = (l: { espesor: number; ancho: number; piezas: number }[]) =>
  l.reduce((s, m) => s + m.espesor * m.ancho * m.piezas, 0);

describe("desglosarPaquetes", () => {
  it("la sección cierra exacta para n=1..50", () => {
    for (let n = 1; n <= 50; n++) {
      const r = desglosarPaquetes(n, VARIADO_DEFAULT.medidas);
      expect(r, `n=${n}`).not.toBeNull();
      expect(seccion(r!)).toBeCloseTo(36 * n, 9);
    }
  });

  it("ejemplo de referencia: 10 paquetes = 360 pulg² = 300 PT, cada medida a menos de 1 pieza de su parte ideal", () => {
    const r = desglosarPaquetes(10, VARIADO_DEFAULT.medidas)!;
    const de = (e: number, a: number) => r.find((m) => m.espesor === e && m.ancho === a)?.piezas;
    // Combinación que menos se aleja de los pesos (mínimos cuadrados sobre el residuo del piso).
    // La del pedido (11,11,11,11,12,14,4,4) también cierra, pero pone 14 de 1×2 contra 11,4 ideales.
    expect([de(2, 2), de(2, 3), de(2, 4), de(1, 4), de(1, 3), de(1, 2), de(1.5, 3), de(3, 3)]).toEqual([
      11, 12, 11, 11, 12, 11, 4, 4,
    ]);
    expect(seccion(r)).toBe(360);
    expect((seccion(r) * 10) / 12).toBeCloseTo(300, 9);
    const ideal = 720 / 189; // λ por peso×área, en piezas por unidad de peso
    for (const m of r) {
      const peso = VARIADO_DEFAULT.medidas.find((x) => x.espesor === m.espesor && x.ancho === m.ancho)!.peso;
      expect(Math.abs(m.piezas - peso * ideal)).toBeLessThan(1);
    }
  });

  it("peso 0 no entra; todas en 0 → null", () => {
    const sin33 = VARIADO_DEFAULT.medidas.map((m) => (m.espesor === 3 ? { ...m, peso: NIVEL_PESO.no } : m));
    const r = desglosarPaquetes(7, sin33)!;
    expect(r.some((m) => m.espesor === 3 && m.ancho === 3)).toBe(false);
    expect(seccion(r)).toBeCloseTo(36 * 7, 9);
    expect(desglosarPaquetes(3, VARIADO_DEFAULT.medidas.map((m) => ({ ...m, peso: 0 })))).toBeNull();
  });

  it("las medidas con peso «poco» salen menos que las normales", () => {
    const r = desglosarPaquetes(40, VARIADO_DEFAULT.medidas)!;
    const poco = r.filter((m) => (m.espesor === 3 && m.ancho === 3) || (m.espesor === 1.5 && m.ancho === 3));
    const normal = r.find((m) => m.espesor === 2 && m.ancho === 2)!;
    for (const m of poco) expect(m.piezas).toBeLessThan(normal.piezas);
  });
});

describe("desglosarVariado", () => {
  const bloques = [bloque("b1", "Tornillo", 6), bloque("b2", "Cedro", 3), bloque("b3", "Capirona", 1.5)];
  const base = [pieza("t1", 40, 2, 8, 10, "Tornillo"), pieza("c1", 10, 2, 6, 8, "Cedro")];

  it("sección exacta para L de 1.5′ a 10′, PT por fila dentro de 0,005 y nada queda Variado", () => {
    for (let L = 1.5; L <= 10; L += 0.5) {
      for (const n of [1, 3, 10, 27, 50]) {
        const r = desglosarVariado([pieza("v", n, 6, 6, L, ESPECIE_VARIADO)], bloques, VARIADO_DEFAULT);
        expect(r.sinDesglosar).toEqual([]);
        expect(r.piezas.some((p) => esVariado(p.especie))).toBe(false);
        const todas = r.grupos[0].porEspecie.flatMap((e) => e.medidas);
        expect(seccion(todas)).toBeCloseTo(36 * n, 9);
        for (const p of r.piezas) {
          const exacto = (p.espesor * p.ancho * p.largo * p.cantidad) / 12;
          expect(Math.abs(p.pieTablar - exacto)).toBeLessThanOrEqual(0.005 + 1e-9);
        }
        expect(Math.abs(r.cuadre.ptDesglose - r.cuadre.ptOrigen)).toBeLessThanOrEqual(0.005 * r.piezas.length + 1e-9);
      }
    }
  });

  it("tipo = el de cada MEDIDA abierta, ya no «Paquetería» (Brandon 03-10); mismo largo, ids estables", () => {
    const largo = desglosarVariado([pieza("v", 4, 6, 6, 8, ESPECIE_VARIADO)], bloques, VARIADO_DEFAULT);
    expect(largo.piezas.every((p) => p.largo === 8)).toBe(true);
    expect(largo.piezas.some((p) => String(p.tipo).startsWith("Paquetería"))).toBe(false);
    for (const p of largo.piezas) {
      // 1×3 y 1×4 largas son Tabla; el resto largo (2×2, 2×4, 1×2, 3×3…) es Larga angosta.
      expect(p.tipo, `${p.espesor}×${p.ancho}`).toBe(p.espesor === 1 && p.ancho >= 3 ? "Tabla" : "Larga angosta");
    }
    expect(largo.piezas.map((p) => p.id)).toEqual(largo.piezas.map((_, i) => `v-v-${i + 1}`));
    // El detalle de la tarjeta dice el mismo tipo que la pieza.
    const delGrupo = largo.grupos[0].porEspecie.flatMap((e) => e.medidas);
    expect(delGrupo.every((m) => m.tipo === (m.espesor === 1 && m.ancho >= 3 ? "Tabla" : "Larga angosta"))).toBe(true);
    const corto = desglosarVariado([pieza("v", 4, 6, 6, 4, ESPECIE_VARIADO)], bloques, VARIADO_DEFAULT);
    expect(corto.piezas.every((p) => p.tipo === "Corta")).toBe(true);
  });

  it("cada medida va sólo a las especies cuyo bloque admite su tipo («Lleva sólo»)", () => {
    const bl: BloqueRolliza[] = [
      bloque("a", "Tornillo", 5),
      { ...bloque("b", "Cedro", 5), gruposFiltro: ["tipo|Larga angosta"] },
    ];
    const r = desglosarVariado([pieza("v", 20, 6, 6, 8, ESPECIE_VARIADO)], bl, VARIADO_DEFAULT);
    expect(r.sinDesglosar).toEqual([]);
    const cedro = r.piezas.filter((p) => p.especie === "Cedro");
    expect(cedro.length).toBeGreaterThan(0);
    expect(cedro.every((p) => p.tipo === "Larga angosta")).toBe(true);
    expect(r.piezas.filter((p) => p.tipo === "Tabla").every((p) => p.especie === "Tornillo")).toBe(true);
    // Un tipo que ningún bloque admite deja la fila sin abrir.
    const soloAngosta: BloqueRolliza[] = [{ ...bloque("b", "Cedro", 5), gruposFiltro: ["tipo|Larga angosta"] }];
    expect(desglosarVariado([pieza("v", 20, 6, 6, 8, ESPECIE_VARIADO)], soloAngosta, VARIADO_DEFAULT).sinDesglosar[0]?.motivo).toBe("sin-especies");
  });

  it("peso 0 por medida y especie exceptuada no aparecen", () => {
    const cfg: ConfigVariado = {
      medidas: VARIADO_DEFAULT.medidas.map((m) => (m.ancho === 2 ? { ...m, peso: 0 } : m)),
      excluidas: ["CEDRO"],
    };
    const r = desglosarVariado([...base, pieza("v", 20, 6, 6, 10, ESPECIE_VARIADO)], bloques, cfg);
    const nuevas = r.piezas.filter((p) => p.id.startsWith("v-v-"));
    expect(nuevas.some((p) => p.ancho === 2)).toBe(false);
    expect(nuevas.some((p) => p.especie === "Cedro")).toBe(false);
    expect(r.pesos.map((p) => p.clave).sort()).toEqual(["capirona", "tornillo"]);
  });

  it("desvío por especie < 1 pieza (la más grande del grupo) respecto de su parte", () => {
    for (const n of [1, 2, 5, 10, 33, 50]) {
      const r = desglosarVariado([pieza("v", n, 6, 6, 10, ESPECIE_VARIADO)], bloques, VARIADO_DEFAULT);
      const total = 72 * n;
      const mayor = Math.max(...r.grupos[0].porEspecie.flatMap((e) => e.medidas).map((m) => m.espesor * m.ancho * 2));
      for (const p of r.pesos) {
        const e = r.grupos[0].porEspecie.find((x) => x.especie === p.especie);
        const real = (e?.medidas ?? []).reduce((s, m) => s + m.espesor * m.ancho * 2 * m.piezas, 0);
        expect(Math.abs(real - (p.pct / 100) * total), `n=${n} ${p.especie}`).toBeLessThan(mayor);
      }
    }
  });

  it("pesos: lo libre de cada especie; sin libre, la capacidad", () => {
    // Tornillo 6 − 1,5 libres = 4,5; Cedro 3 − 0,5 = 2,5
    const noV = [{ ...base[0], m3: 1.5 }, { ...base[1], m3: 0.5 }];
    const p = pesosPorEspecie([bloque("b1", "Tornillo", 6), bloque("b2", "Cedro", 3)], noV, VARIADO_DEFAULT);
    expect(p.map((x) => x.peso)).toEqual([4.5, 2.5]);
    expect(p.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 9);
    const lleno = [{ ...base[0], m3: 9 }, { ...base[1], m3: 9 }];
    expect(pesosPorEspecie([bloque("b1", "Tornillo", 6), bloque("b2", "Cedro", 3)], lleno, VARIADO_DEFAULT).map((x) => x.peso)).toEqual([6, 3]);
  });

  it("sin bloques → sin-especies, intacto", () => {
    const v = pieza("v", 5, 6, 6, 10, ESPECIE_VARIADO);
    const r = desglosarVariado([...base, v], [], VARIADO_DEFAULT);
    expect(r.sinDesglosar).toEqual([{ id: "v", motivo: "sin-especies" }]);
    expect(r.piezas).toEqual([...base, v]);
  });

  it("un Variado que no es 6×6 queda intacto", () => {
    const v = pieza("v", 5, 2, 6, 10, "variado");
    const r = desglosarVariado([v], bloques, VARIADO_DEFAULT);
    expect(r.sinDesglosar).toEqual([{ id: "v", motivo: "no-6x6" }]);
    expect(r.piezas).toEqual([v]);
  });

  it("no cierra → intacto con motivo", () => {
    const cfg: ConfigVariado = { medidas: VARIADO_DEFAULT.medidas.map((m) => ({ ...m, peso: 0 })), excluidas: [] };
    const v = pieza("v", 5, 6, 6, 10, ESPECIE_VARIADO);
    expect(desglosarVariado([v], bloques, cfg).sinDesglosar).toEqual([{ id: "v", motivo: "no-cierra" }]);
  });

  it("determinista", () => {
    const entrada = [...base, pieza("v", 17, 6, 6, 9, ESPECIE_VARIADO)];
    expect(desglosarVariado(entrada, bloques, VARIADO_DEFAULT)).toEqual(desglosarVariado(entrada, bloques, VARIADO_DEFAULT));
  });

  it("rendimiento: 47 filas / 1 596 paquetes y 15 especies, en proporción al trabajo", () => {
    const nombres = Array.from({ length: 15 }, (_, i) => `Especie${i}`);
    const bl = nombres.map((n, i) => bloque(`b${i}`, n, 3 + i));
    const piezas = Array.from({ length: 47 }, (_, i) =>
      pieza(`v${i}`, i < 46 ? 34 : 1596 - 34 * 46, 6, 6, 4 + (i % 7), ESPECIE_VARIADO),
    );
    expect(piezas.reduce((s, p) => s + p.cantidad, 0)).toBe(1596);
    // Referencia: una pasada trivial sobre la misma lista, para medir razón y no ms fijos.
    const t0 = performance.now();
    let acc = 0;
    for (let k = 0; k < 200; k++) for (const p of piezas) acc += cubicarPieza({ ...p, cantidad: p.cantidad }).pieTablar;
    const ref = Math.max(performance.now() - t0, 0.5) / 200;
    const t1 = performance.now();
    const r = desglosarVariado(piezas, bl, VARIADO_DEFAULT);
    const ms = performance.now() - t1;
    expect(acc).toBeGreaterThan(0);
    expect(r.sinDesglosar).toEqual([]);
    expect(ms).toBeLessThan(200);
    expect(ms / ref).toBeLessThan(5000);
  });
});

describe("correcciones del revisor", () => {
  it("«Lleva sólo»: un bloque sólo Comercial no recibe paquetería", () => {
    const bl: BloqueRolliza[] = [
      { ...bloque("a", "Cedro", 5), gruposFiltro: ["tipo|Comercial"] },
      bloque("b", "Tornillo", 5),
    ];
    const r = desglosarVariado([pieza("v", 10, 6, 6, 8, ESPECIE_VARIADO)], bl, VARIADO_DEFAULT);
    expect(r.piezas.every((p) => p.especie === "Tornillo")).toBe(true);
    const solo: BloqueRolliza[] = [{ ...bloque("a", "Cedro", 5), gruposFiltro: ["tipo|Comercial"] }];
    expect(desglosarVariado([pieza("v", 10, 6, 6, 8, ESPECIE_VARIADO)], solo, VARIADO_DEFAULT).sinDesglosar[0]?.motivo).toBe("sin-especies");
  });

  it("especie con la clave del motor: «Cedro» y «Cédro» son dos", () => {
    const ps = pesosPorEspecie([bloque("a", "Cedro", 3), bloque("b", "Cédro", 3)], [], VARIADO_DEFAULT);
    expect(ps).toHaveLength(2);
  });

  it("fallback acotado: 1 597 paquetes con {2×2, 1.5×3} cierra exacto y escala casi lineal", () => {
    const cfg: ConfigVariado = {
      medidas: [{ espesor: 2, ancho: 2, peso: 3 }, { espesor: 1.5, ancho: 3, peso: 1 }],
      excluidas: [],
    };
    const medir = (n: number) => {
      const t = performance.now();
      const r = desglosarPaquetes(n, cfg.medidas);
      return { r, ms: Math.max(performance.now() - t, 0.05) };
    };
    const a = medir(1597);
    expect(a.r).not.toBeNull();
    expect(seccion(a.r!)).toBe(36 * 1597);
    const b = medir(3194);
    expect(seccion(b.r!)).toBe(36 * 3194);
    expect(a.ms).toBeLessThan(50);
    expect(b.ms / a.ms).toBeLessThan(8);
  });

  it("toleranciaCuadrePt = 0,005 por fila y el cuadre la trae", () => {
    expect(toleranciaCuadrePt(47)).toBeCloseTo(0.235, 6);
    const r = desglosarVariado([pieza("v", 7, 6, 6, 8, ESPECIE_VARIADO)], [bloque("a", "Cedro", 5)], VARIADO_DEFAULT);
    expect(r.cuadre.toleranciaPt).toBeCloseTo(0.005 * r.piezas.length, 6);
    expect(Math.abs(r.cuadre.ptDesglose - r.cuadre.ptOrigen)).toBeLessThanOrEqual(r.cuadre.toleranciaPt + 1e-9);
  });

  it("agruparPiezasIguales: no cambia Σ piezas ni Σ PT más allá de la tolerancia", () => {
    const nombres = Array.from({ length: 5 }, (_, i) => `E${i}`);
    const bl = nombres.map((n, i) => bloque(`b${i}`, n, 4 + i));
    const r = desglosarVariado(
      Array.from({ length: 12 }, (_, i) => pieza(`v${i}`, 20, 6, 6, 8, ESPECIE_VARIADO)), bl, VARIADO_DEFAULT,
    );
    const g = agruparPiezasIguales(r.piezas);
    expect(g.length).toBeLessThan(r.piezas.length);
    expect(g.reduce((s, p) => s + p.cantidad, 0)).toBe(r.piezas.reduce((s, p) => s + p.cantidad, 0));
    const dif = Math.abs(g.reduce((s, p) => s + p.pieTablar, 0) - r.piezas.reduce((s, p) => s + p.pieTablar, 0));
    expect(dif).toBeLessThanOrEqual(toleranciaCuadrePt(r.piezas.length));
    expect(agruparPiezasIguales(r.piezas).map((p) => p.id)).toEqual(g.map((p) => p.id));
    const un = g.find((p) => p.cantidad > 20)!;
    expect(un.m3).toBeCloseTo(un.pieTablar / 424, 4);
  });
});

describe("config y catálogo", () => {
  it("leerConfigVariado: basura → default; válida pasa y normaliza excluidas", () => {
    expect(leerConfigVariado("x")).toEqual(VARIADO_DEFAULT);
    expect(leerConfigVariado({ medidas: [{ espesor: 2, ancho: 2, peso: -1 }], excluidas: [] })).toEqual(VARIADO_DEFAULT);
    const ok = leerConfigVariado({ medidas: [{ espesor: 2, ancho: 2, peso: 3 }], excluidas: ["  CEDRO ", "cedro"] });
    expect(ok).toEqual({ medidas: [{ espesor: 2, ancho: 2, peso: 3 }], excluidas: ["cedro"] });
  });

  it("el catálogo no deja crear «Variado»", () => {
    for (const nombre of ["Variado", " variado ", "VARIADO"]) {
      const r = agregarEspecie(CATALOGO_VACIO, { nombre });
      expect(r.ok).toBe(false);
    }
    const base = agregarEspecie(CATALOGO_VACIO, { nombre: "Panguana" });
    expect(base.ok && editarEspecie(base.catalogo, "panguana", { nombre: "Variado" }).ok).toBe(false);
  });
});
