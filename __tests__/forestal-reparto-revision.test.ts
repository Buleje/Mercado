import { describe, expect, it } from "vitest";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { PT_POR_M3, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { contarRevision, revisarDistribucion } from "@/lib/forestal/reparto-revision";

/** Mismo criterio que el test del reparto: piezas de verdad, no un tablón indivisible. */
const PIEZAS = 1000;
function pieza(id: string, especie: string | undefined, m3: number): PiezaCubicada {
  return {
    id, cantidad: PIEZAS, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie, m3, pieTablar: Math.round(m3 * PT_POR_M3 * 100) / 100,
  };
}
const bloque = (id: string, especie: string, m3: number, extra: Partial<BloqueRolliza> = {}): BloqueRolliza =>
  ({ id, etiqueta: `GTF-${id}`, especie, m3, origen: "manual", permiso: "19-SEC/REG-001", fecha: "2026-08-28", ...extra });

/** Revisa un caso completo: bloques + aserrada, ya distribuidos. */
const revisar = (bloques: BloqueRolliza[], piezas: PiezaCubicada[]) =>
  revisarDistribucion(bloques, distribuirPorCapacidad(bloques, piezas, "tipo"));

const ids = (hs: { id: string }[]) => hs.map((h) => h.id);

describe("revisarDistribucion · datos que el papel necesita", () => {
  it("marca como ERROR el bloque sin guía ni lote", () => {
    const b = [bloque("a", "Tornillo", 10, { etiqueta: "  " })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const sinEtiqueta = h.find((x) => x.id === "a:sin-etiqueta");
    expect(sinEtiqueta?.severidad).toBe("error");
  });

  it("marca como ERROR el bloque sin especie", () => {
    const h = revisar([bloque("a", "", 10)], [pieza("p", "Tornillo", 1)]);
    expect(h.find((x) => x.id === "a:sin-especie")?.severidad).toBe("error");
  });

  it("marca como ERROR el bloque sin volumen", () => {
    const h = revisar([bloque("a", "Tornillo", 0)], [pieza("p", "Tornillo", 1)]);
    expect(h.find((x) => x.id === "a:sin-volumen")?.severidad).toBe("error");
  });

  it("permiso y fecha faltantes son AVISO, no error: se puede declarar igual", () => {
    const b = [bloque("a", "Tornillo", 10, { permiso: null, fecha: null })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(h.find((x) => x.id === "a:sin-permiso")?.severidad).toBe("aviso");
    expect(h.find((x) => x.id === "a:sin-fecha")?.severidad).toBe("aviso");
  });

  it("un bloque completo y con toda su capacidad usada no genera nada", () => {
    // 10 m³ de rolliza al 50 % amparan 5; hay exactamente 5 m³ de aserrada.
    const b = [bloque("a", "Tornillo", 10, { aprovechablePct: 50 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(h).toEqual([]);
  });
});

describe("revisarDistribucion · la misma guía dos veces", () => {
  it("detecta dos bloques con la MISMA etiqueta — es amparar la misma madera dos veces", () => {
    const b = [bloque("a", "Tornillo", 5, { etiqueta: "GTF-0231" }), bloque("b", "Tornillo", 5, { etiqueta: " gtf-0231 " })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const dup = h.find((x) => x.id.startsWith("dup:"));
    expect(dup?.severidad).toBe("error");
    expect(dup?.que).toContain("2 bloques");
  });

  it("etiquetas distintas no se confunden", () => {
    const b = [bloque("a", "Tornillo", 5), bloque("b", "Tornillo", 5)];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(ids(h).some((x) => x.startsWith("dup:"))).toBe(false);
  });
});

describe("revisarDistribucion · lo que salió del reparto", () => {
  it("avisa del bloque que no amparó nada: su Anexo 04 saldría vacío", () => {
    // El primero se lleva toda la aserrada; al segundo no le queda nada.
    const b = [bloque("a", "Tornillo", 100, { aprovechablePct: 100 }), bloque("b", "Tornillo", 10)];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const vacio = h.find((x) => x.id === "b:sin-amparar");
    expect(vacio?.severidad).toBe("aviso");
    expect(vacio?.que).toContain("Anexo 04");
  });

  it("avisa cuando se pidió un tope de piezas que el reparto no alcanzó", () => {
    const b = [bloque("a", "Tornillo", 100, { aprovechablePct: 100, piezasManual: 5000 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const cortas = h.find((x) => x.id === "a:piezas-cortas");
    expect(cortas?.severidad).toBe("aviso");
    expect(cortas?.que).toContain(`${PIEZAS}`);
  });

  it("sin tope de piezas NO avisa: «todas» significa las que entren", () => {
    const b = [bloque("a", "Tornillo", 100, { aprovechablePct: 100 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(ids(h).some((x) => x.endsWith(":piezas-cortas"))).toBe(false);
  });

  it("ERROR cuando queda aserrada sin respaldo de rolliza", () => {
    const b = [bloque("a", "Tornillo", 2, { aprovechablePct: 50 })]; // ampara 1 m³
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const falta = h.find((x) => x.id === "esp:Tornillo:faltante");
    expect(falta?.severidad).toBe("error");
    expect(falta?.que).toContain("sin respaldo");
  });
});

describe("revisarDistribucion · lo que es del conjunto se dice UNA vez", () => {
  it("capacidad sobrante en cinco bloques es UN aviso por especie, no cinco", () => {
    const b = [1, 2, 3, 4, 5].map((n) => bloque(`b${n}`, "Tornillo", 20, { aprovechablePct: 100, etiqueta: `GTF-${n}` }));
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(h.filter((x) => x.id.endsWith(":libre"))).toHaveLength(1);
  });

  it("avisa una sola vez cuando la especie combina permisos distintos", () => {
    const b = [
      bloque("a", "Tornillo", 5, { permiso: "P-1" }),
      bloque("b", "Tornillo", 5, { permiso: "P-2" }),
    ];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    const permisos = h.filter((x) => x.id === "esp:Tornillo:permisos");
    expect(permisos).toHaveLength(1);
    expect(permisos[0].severidad).toBe("aviso");
  });
});

describe("revisarDistribucion · orden y conteo", () => {
  it("los errores van primero: es el orden en que hay que resolverlos", () => {
    const b = [bloque("a", "", 10, { permiso: null })];
    const h = revisar(b, [pieza("p", "Tornillo", 1)]);
    const primerAviso = h.findIndex((x) => x.severidad === "aviso");
    const ultimoError = h.map((x) => x.severidad).lastIndexOf("error");
    expect(ultimoError).toBeLessThan(primerAviso);
  });

  it("contarRevision separa errores de avisos", () => {
    const b = [bloque("a", "", 10, { permiso: null })];
    const c = contarRevision(revisar(b, [pieza("p", "Tornillo", 1)]));
    expect(c.errores).toBeGreaterThan(0);
    expect(c.avisos).toBeGreaterThan(0);
  });

  it("sin bloques y sin aserrada no hay nada que revisar", () => {
    expect(revisar([], [])).toEqual([]);
  });
});

describe("revisarDistribucion · el rendimiento no inventa rojos", () => {
  it("una especie SIN aserrada cubicada no se juzga: 0 % no es «bajo», es que no hay nada", () => {
    const b = [bloque("a", "Tornillo", 10)];
    // Sólo hay aserrada de Cedro: el Tornillo no tiene con qué compararse.
    const h = revisar(b, [pieza("p", "Cedro", 1)]);
    expect(ids(h).some((x) => x.endsWith(":rendimiento"))).toBe(false);
  });

  it("un rendimiento bajo es AVISO: se puede declarar igual", () => {
    const b = [bloque("a", "Tornillo", 100, { aprovechablePct: 100 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]); // 5 %
    expect(h.find((x) => x.id === "esp:Tornillo:rendimiento")?.severidad).toBe("aviso");
  });

  it("salió MÁS de lo que entró sí es ERROR: es físicamente imposible", () => {
    // 1 m³ de rolliza «amparando» 10 m³ a mano, con 10 m³ de aserrada.
    const b = [bloque("a", "Tornillo", 1, { amparaManualM3: 10 })];
    const h = revisar(b, [pieza("p", "Tornillo", 10)]);
    const r = h.find((x) => x.id === "esp:Tornillo:rendimiento");
    expect(r?.severidad).toBe("error");
    expect(r?.que).toContain("imposible");
  });
});

describe("revisarDistribucion · la tolerancia es del negocio, no del float", () => {
  it("un sobrante de milésimas NO se avisa: es el redondeo de repartir piezas enteras", () => {
    // 1000 piezas de 0.005 m³ contra una capacidad de 5.003: sobran 3 litros,
    // que no son madera esperando la sierra sino el arrastre del reparto.
    const b = [bloque("a", "Tornillo", 5.003, { aprovechablePct: 100 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(ids(h).some((x) => x.endsWith(":libre"))).toBe(false);
  });

  it("pero un sobrante de verdad sí: medio metro cúbico es media troza", () => {
    const b = [bloque("a", "Tornillo", 5.5, { aprovechablePct: 100 })];
    const h = revisar(b, [pieza("p", "Tornillo", 5)]);
    expect(h.find((x) => x.id === "esp:Tornillo:libre")?.severidad).toBe("aviso");
  });
});
