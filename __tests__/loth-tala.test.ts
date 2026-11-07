/**
 * Sección 1 · Tala del LO-TH.
 *
 * Los casos numéricos no son inventados: son los ejemplos que la propia
 * RDE 264-2019 escribe en sus instrucciones (items 6, 7 y 8). Si alguno de
 * estos falla, el libro dejó de coincidir con el formato oficial.
 */

import { describe, it, expect } from "vitest";
import {
  obligatoriedadTala,
  promedioCruzado,
  fusteIrregular,
  calcularLongitud,
  volumenDeMedidas,
  componerObservaciones,
  motivoPideCientifico,
  estadoMarcado,
  MOTIVOS_TALA,
} from "@/lib/forestal/loth-tala";
import { smalianVolume } from "@/lib/forestal/loth-constants";

describe("obligatoriedadTala — qué exige la norma según el modo (Art. 4 + notas items 6/7/9)", () => {
  it("despachando trozas sólo pide la longitud", () => {
    const o = obligatoriedadTala("despacho_trozas");
    expect(o.diametros).toBe(false);
    expect(o.volumen).toBe(false);
    expect(o.longitud).toBe(true);
  });

  it("aserrando dentro del área pide también diámetros y volumen", () => {
    const o = obligatoriedadTala("aserrio_en_area");
    expect(o.diametros).toBe(true);
    expect(o.volumen).toBe(true);
  });

  it("sin modo declarado pide todo — un campo de más se corrige, uno de menos se fiscaliza", () => {
    expect(obligatoriedadTala(null).diametros).toBe(true);
    expect(obligatoriedadTala(undefined).volumen).toBe(true);
  });

  it("sin modo NO afirma que el titular asierra: pide elegir", () => {
    const sinModo = obligatoriedadTala(null).razon;
    expect(sinModo).not.toContain("Asierras dentro del área");
    expect(sinModo).toContain("Elige");
    // y con el modo elegido sí lo afirma
    expect(obligatoriedadTala("aserrio_en_area").razon).toContain("Asierras dentro del área");
  });
});

describe("promedioCruzado — el ejemplo textual del item 6 y del item 7", () => {
  it("item 6: 1.30 m y 1.10 m ⇒ 1.20 m", () => {
    expect(promedioCruzado([1.3, 1.1])).toBe(1.2);
  });

  it("item 7: 0.80 m y 0.90 m ⇒ 0.85 m", () => {
    expect(promedioCruzado([0.8, 0.9])).toBe(0.85);
  });

  it("acepta una tercera medida para un fuste ovalado", () => {
    expect(promedioCruzado([1.2, 1.0, 1.1])).toBe(1.1);
  });

  it("ignora las vacías en vez de contarlas como cero", () => {
    expect(promedioCruzado([1.2, null, undefined])).toBe(1.2);
  });

  it("sin ninguna medida devuelve null, nunca 0 (un 0 se lee como «midió y dio cero»)", () => {
    expect(promedioCruzado([])).toBeNull();
    expect(promedioCruzado([null, 0, -1])).toBeNull();
  });
});

describe("fusteIrregular — cuándo conviene una tercera medida", () => {
  it("1.30 vs 1.10 es normal, no avisa", () => {
    expect(fusteIrregular([1.3, 1.1])).toBe(false);
  });

  it("1.60 vs 1.00 (60%) sí avisa", () => {
    expect(fusteIrregular([1.6, 1.0])).toBe(true);
  });

  it("con una sola medida no puede opinar", () => {
    expect(fusteIrregular([1.3])).toBe(false);
  });
});

describe("calcularLongitud — el ejemplo textual del item 8", () => {
  it("15 m totales − 1 m de aletas = 14 m aprovechables", () => {
    const r = calcularLongitud(15, [{ tipo: "aletas", metros: 1 }]);
    expect(r.aprovechableM).toBe(14);
    expect(r.descontadoM).toBe(1);
    expect(r.excede).toBe(false);
  });

  it("suma varios descuentos", () => {
    const r = calcularLongitud(18, [
      { tipo: "aletas", metros: 1.2 },
      { tipo: "pudricion", metros: 0.8 },
      { tipo: "despunte", metros: 2 },
    ]);
    expect(r.descontadoM).toBe(4);
    expect(r.aprovechableM).toBe(14);
  });

  it("sin descuentos, la aprovechable es la total", () => {
    expect(calcularLongitud(12, []).aprovechableM).toBe(12);
  });

  it("si los descuentos se comen el fuste marca `excede` y NO devuelve 0", () => {
    const r = calcularLongitud(10, [{ tipo: "pudricion", metros: 10 }]);
    expect(r.excede).toBe(true);
    expect(r.aprovechableM).toBeNull();
  });

  it("sin longitud total no inventa nada", () => {
    expect(calcularLongitud(null, [{ tipo: "aletas", metros: 1 }]).aprovechableM).toBeNull();
  });
});

describe("volumenDeMedidas — cubica con la MISMA fórmula del libro", () => {
  it("usa el promedio cruzado y coincide con smalianVolume del single source", () => {
    const v = volumenDeMedidas([1.3, 1.1], [0.8, 0.9], 14);
    expect(v).toBe(smalianVolume(1.2, 0.85, 14));
  });

  it("falta una medida ⇒ null, no un volumen a medias", () => {
    expect(volumenDeMedidas([1.3, 1.1], [], 14)).toBeNull();
    expect(volumenDeMedidas([1.3], [0.85], null)).toBeNull();
  });
});

describe("componerObservaciones — los términos que el fiscalizador busca (item 10)", () => {
  it("escribe el término exacto «Descartado», no una paráfrasis", () => {
    const t = componerObservaciones({ motivos: ["descartado"], detalle: "hueco de base a copa" });
    expect(t).toContain("Descartado");
    expect(t).toContain("hueco de base a copa");
  });

  it("«Consumo interno» del item 10-iv", () => {
    const t = componerObservaciones({ motivos: ["consumo_interno"], detalle: "puente del km 4" });
    expect(t.startsWith("Consumo interno")).toBe(true);
  });

  it("cuando la especie difiere, el científico va en observaciones (item 10-ii)", () => {
    const t = componerObservaciones({ motivos: ["especie_difiere"], nombreCientifico: "Cedrelinga catenaeformis" });
    expect(t).toBe("Nombre científico: Cedrelinga catenaeformis");
  });

  it("no duplica el término si dos motivos piden lo mismo", () => {
    const t = componerObservaciones({
      motivos: ["especie_difiere", "especie_ambigua"],
      nombreCientifico: "Dipteryx micrantha",
    });
    expect(t.match(/Nombre científico/g)?.length).toBe(1);
  });

  it("respeta el texto libre que ya había", () => {
    const t = componerObservaciones({ motivos: ["descartado"], textoLibre: "lo vio el regente" });
    expect(t).toBe("Descartado · lo vio el regente");
  });

  it("sin motivos ni texto devuelve cadena vacía, no basura", () => {
    expect(componerObservaciones({ motivos: [] })).toBe("");
  });
});

describe("las keys de los motivos son contrato con el formulario", () => {
  /**
   * `LothEntryForm` deriva los flags de la línea de estas dos keys exactas:
   *   payload.discarded      = motivos.includes("descartado")
   *   payload.consumoInterno = motivos.includes("consumo_interno")
   * Renombrarlas no rompe ningún tipo (son strings dentro de un union), pero
   * deja el flag en false con la observación diciendo «Descartado»: el texto y
   * el dato contándose cosas distintas. Ya pasó una vez, por otra vía —el
   * checkbox viejo pisaba la asignación—, y sólo se vio guardando de verdad.
   */
  it("existen las keys que el payload consulta", () => {
    const keys = MOTIVOS_TALA.map((m) => m.key);
    expect(keys).toContain("descartado");
    expect(keys).toContain("consumo_interno");
  });

  it("cada motivo que pide detalle tiene su término y su ayuda", () => {
    for (const m of MOTIVOS_TALA) {
      expect(m.termino.length).toBeGreaterThan(0);
      expect(m.ayuda.length).toBeGreaterThan(0);
    }
  });
});

describe("motivoPideCientifico", () => {
  it("los dos casos de especie lo piden", () => {
    expect(motivoPideCientifico(["especie_difiere"])).toBe(true);
    expect(motivoPideCientifico(["especie_ambigua"])).toBe(true);
  });
  it("descartado no", () => {
    expect(motivoPideCientifico(["descartado"])).toBe(false);
  });
});

describe("estadoMarcado — el código va en el fuste Y en el tocón (item 3)", () => {
  it("con las dos marcas está completo", () => {
    expect(estadoMarcado(["fuste", "tocon"]).completo).toBe(true);
  });

  it("con una sola dice cuál falta, por su nombre", () => {
    const e = estadoMarcado(["fuste"]);
    expect(e.completo).toBe(false);
    expect(e.faltan).toEqual(["Código marcado en el tocón"]);
  });

  it("sin ninguna, faltan las dos", () => {
    expect(estadoMarcado([]).faltan).toHaveLength(2);
  });
});
