/**
 * Qué del libro está construido y sin estrenar.
 *
 * Nace de un hecho medido: en una sesión se buscaron cinco cosas para construir
 * y CUATRO ya existían —rentabilidad, panel de costos, cierre mensual y hasta el
 * aviso de «ingresos sin costo»— sin que nadie las usara. Con 1.2M líneas, el
 * riesgo dejó de ser que falte una capacidad: es que esté ahí y nadie lo sepa.
 *
 * Las dos reglas que hacen que esta lista se lea en vez de ignorarse:
 *
 *  1. **Lo que todavía no aplica NO es una deuda.** Despachar sin producto
 *     terminado, o cerrar un mes sin nada registrado, no son cosas pendientes:
 *     son cosas que no tienen sobre qué aplicarse. Marcarlas en rojo llena la
 *     lista de tareas imposibles y esa lista se deja de leer.
 *  2. **Cada capacidad se juzga por el DATO, no por si la pantalla existe.**
 *     «Tenés la pestaña de rentabilidad» no le sirve a nadie.
 */
import { describe, expect, it } from "vitest";

import {
  capacidadesDelLibro,
  resumirPuestaEnMarcha,
  type DatosPuestaEnMarcha,
} from "@/lib/forestal/ctp-puesta-en-marcha";

const vacio: DatosPuestaEnMarcha = {
  ingresos: { total: 0, sinCosto: 0, sinConstancia: 0, conPiezas: 0 },
  produccion: { corridas: 0, sinDeclarar: 0, conPaquetes: 0 },
  despachos: { total: 0, sinGtf: 0, conVenta: 0, conAnexo: 0 },
  cierres: 0,
  stockDisponibleM3: 0,
  ficha: { tieneIdentidad: false, tieneSerieGtf: false },
};

/** El tenant forestal de Brandon, tal como se midió el 2026-09-05. */
const brandon: DatosPuestaEnMarcha = {
  ingresos: { total: 3, sinCosto: 3, sinConstancia: 3, conPiezas: 1 },
  produccion: { corridas: 5, sinDeclarar: 1, conPaquetes: 4 },
  despachos: { total: 0, sinGtf: 0, conVenta: 0, conAnexo: 0 },
  cierres: 0,
  stockDisponibleM3: 59.85,
  ficha: { tieneIdentidad: true, tieneSerieGtf: true },
};

const de = (d: DatosPuestaEnMarcha, clave: string) =>
  capacidadesDelLibro(d).find((c) => c.clave === clave);

describe("lo que todavía no aplica no se muestra como deuda", () => {
  it("un libro vacío no reclama despachar ni cerrar el mes", () => {
    const claves = capacidadesDelLibro(vacio).map((c) => c.clave);
    expect(claves).not.toContain("despachos");
    expect(claves).not.toContain("cierre");
  });

  it("…pero sí reclama lo primero: la ficha y la primera guía", () => {
    const claves = capacidadesDelLibro(vacio).map((c) => c.clave);
    expect(claves).toContain("ficha");
    expect(claves).toContain("ingresos");
    expect(de(vacio, "ingresos")?.estado).toBe("sin_estrenar");
  });

  it("con producto terminado, despachar SÍ pasa a ser una deuda", () => {
    expect(de(brandon, "despachos")?.estado).toBe("sin_estrenar");
    expect(de(brandon, "despachos")?.medida).toContain("59.85 m³ listos");
  });
});

describe("el caso real: 4 capacidades construidas y sin estrenar", () => {
  it("los costos están en cero de tres, y se dice el porcentaje", () => {
    const c = de(brandon, "costos");
    expect(c?.estado).toBe("sin_estrenar");
    expect(c?.medida).toBe("0 de 3 guías valorizadas (0 %)");
    expect(c?.desbloquea).toContain("Margen por despacho");
  });

  it("el SNIFFS también", () => {
    expect(de(brandon, "sniffs")?.medida).toBe("0 de 3 guías con constancia");
  });

  it("las trozas están a medias: una de tres guías", () => {
    const c = de(brandon, "piezas");
    expect(c?.estado).toBe("a_medias");
    expect(c?.medida).toBe("1 de 3 guías con sus piezas");
  });

  it("la producción arrancó pero hay una corrida sin declarar", () => {
    const c = de(brandon, "produccion");
    expect(c?.estado).toBe("a_medias");
    expect(c?.medida).toBe("1 corrida sin declarar de 5");
  });

  it("el cierre nunca se usó, y avisa qué queda bloqueado", () => {
    const c = de(brandon, "cierre");
    expect(c?.estado).toBe("sin_estrenar");
    expect(c?.desbloquea).toContain("Existencia de apertura heredada");
  });
});

describe("una capacidad en uso no pide nada", () => {
  const todo: DatosPuestaEnMarcha = {
    ingresos: { total: 3, sinCosto: 0, sinConstancia: 0, conPiezas: 3 },
    produccion: { corridas: 5, sinDeclarar: 0, conPaquetes: 5 },
    despachos: { total: 2, sinGtf: 0, conVenta: 2, conAnexo: 2 },
    cierres: 3,
    stockDisponibleM3: 10,
    ficha: { tieneIdentidad: true, tieneSerieGtf: true },
  };

  it("el paso queda en null: no hay nada que hacer", () => {
    for (const c of capacidadesDelLibro(todo)) {
      expect(c.estado).toBe("en_uso");
      expect(c.paso).toBeNull();
    }
  });

  it("y el resumen lo dice sin rodeos", () => {
    const r = resumirPuestaEnMarcha(capacidadesDelLibro(todo));
    expect(r.pct).toBe(100);
    expect(r.frase).toBe("El libro está funcionando entero.");
  });
});

describe("el porcentaje no miente para ningún lado", () => {
  it("«a medias» vale medio, no uno ni cero", () => {
    const caps = capacidadesDelLibro(brandon);
    const r = resumirPuestaEnMarcha(caps);
    expect(r.enUso + r.aMedias + r.sinEstrenar).toBe(r.total);
    // Con 1 vale-uno el pct exageraría; con 0 castigaría a quien ya arrancó.
    const optimista = Math.round(((r.enUso + r.aMedias) / r.total) * 100);
    const pesimista = Math.round((r.enUso / r.total) * 100);
    expect(r.pct).toBeGreaterThan(pesimista);
    expect(r.pct).toBeLessThan(optimista);
  });

  it("un libro sin nada arrancado no muestra 100 %", () => {
    expect(resumirPuestaEnMarcha(capacidadesDelLibro(vacio)).pct).toBe(0);
  });
});

/**
 * La Ficha dice QUÉ falta, no sólo que falta.
 *
 * «Sin identidad cargada» manda a un formulario de dieciocho casilleros sin
 * decir cuáles importan para qué papel. La cuenta ya existía hecha
 * (`requisitosFaltantes` en `ctp-ficha-types`), pero sólo se veía entrando a la
 * Ficha — justo donde no llega el que todavía no sabe que le falta algo.
 */
describe("el detalle de la Ficha", () => {
  const conPapeles = (papeles: { documento: string; faltan: string[] }[]) =>
    capacidadesDelLibro({
      ...vacio,
      ficha: { tieneIdentidad: false, tieneSerieGtf: false, papelesIncompletos: papeles },
    }).find((c) => c.clave === "ficha");

  it("lista cada papel con los campos que le faltan", () => {
    const c = conPapeles([
      { documento: "GTF de salida", faltan: ["Razón social", "Serie GTF autorizada"] },
      { documento: "Certificado de trazabilidad", faltan: ["RUC"] },
    ]);
    expect(c?.detalle).toEqual([
      "GTF de salida: falta Razón social, Serie GTF autorizada",
      "Certificado de trazabilidad: falta RUC",
    ]);
  });

  it("sin papeles rotos no inventa una lista", () => {
    expect(conPapeles([])?.detalle).toEqual([]);
  });

  it("el dato es opcional: una ficha sin el desglose no rompe el panel", () => {
    const c = capacidadesDelLibro(vacio).find((x) => x.clave === "ficha");
    expect(c?.detalle).toEqual([]);
    expect(c?.medida).toBe("sin identidad cargada");
  });
});
