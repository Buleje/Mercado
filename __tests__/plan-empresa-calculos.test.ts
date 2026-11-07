/**
 * __tests__/plan-empresa-calculos.test.ts — las cuentas puras del plan de la
 * empresa (ADR-497): lectura tolerante de cada sección y las fórmulas que
 * dibuja la pantalla y se imprimen (participación, inversión, licencias,
 * objetivos, cuánto está escrito).
 */
import { describe, expect, it } from "vitest";
import {
  SCHEMAS_SECCION,
  SECCIONES_PLAN,
  leerSeccion,
  vacia,
  type DatosSeccion,
} from "@/lib/planificacion/secciones";
import {
  avanceObjetivo,
  estadoLicencia,
  llenado,
  llenadoGeneral,
  objetivoAtrasado,
  participacion,
  totalesInversion,
} from "@/lib/planificacion/calculos";

const HOY = "2026-10-16";

/** Socios / licencias / objetivos con sus defaults, armados por la misma lectura que usa el servidor. */
const socios = (items: Record<string, unknown>[]) => leerSeccion("socios", { items }).items;
const licencia = (l: Record<string, unknown>) => leerSeccion("licencias", { items: [{ id: "l1", nombre: "Licencia", ...l }] }).items[0];
const objetivo = (o: Record<string, unknown>) => leerSeccion("objetivos", { items: [{ id: "o1", titulo: "Objetivo", ...o }] }).items[0];

describe("vacia / leerSeccion", () => {
  it("las 12 secciones tienen su vacía y la vacía es válida", () => {
    expect(SECCIONES_PLAN).toHaveLength(12);
    for (const s of SECCIONES_PLAN) {
      expect(SCHEMAS_SECCION[s].safeParse(vacia(s)).success).toBe(true);
    }
    expect(vacia("ficha").razonSocial).toBe("");
    expect(vacia("foda").fortalezas).toEqual([]);
    expect(vacia("inversion").gananciaMensualEsperada).toBeNull();
  });

  it("basura, null o un tipo equivocado se leen como la sección vacía (nunca tira)", () => {
    expect(leerSeccion("objetivos", "basura")).toEqual(vacia("objetivos"));
    expect(leerSeccion("ficha", null)).toEqual(vacia("ficha"));
    expect(leerSeccion("ficha", undefined)).toEqual(vacia("ficha"));
    expect(leerSeccion("socios", { items: "no es lista" })).toEqual(vacia("socios"));
    expect(leerSeccion("ficha", { razonSocial: 5 })).toEqual(vacia("ficha"));
  });

  it("un campo que no existía cuando se guardó toma su default; uno que ya no existe se descarta", () => {
    const f = leerSeccion("ficha", { razonSocial: "Bodega San Martín SAC", campoViejo: 1 });
    expect(f.razonSocial).toBe("Bodega San Martín SAC");
    expect(f.horario).toBe("");
    expect(f).not.toHaveProperty("campoViejo");

    const l = leerSeccion("licencias", { items: [{ id: "a", nombre: "RUC" }] }).items[0];
    expect(l).toMatchObject({ tramitada: true, vence: "", archivoUrl: "" });

    const s = socios([{ id: "s1", nombre: "Ana" }])[0];
    expect(s).toMatchObject({ aporte: 0, porcentaje: null, tipoAporte: "efectivo" });
  });
});

describe("participacion", () => {
  it("sin nadie escrito a mano: se reparte según el aporte", () => {
    const p = participacion(socios([
      { id: "a", nombre: "Ana", aporte: 6000 },
      { id: "b", nombre: "Beto", aporte: 4000 },
    ]));
    expect(p.socios.map((s) => [s.porcentaje, s.origen])).toEqual([[60, "aporte"], [40, "aporte"]]);
    expect(p.total).toBe(100);
    expect(p.cuadra).toBe(true);
  });

  it("lo escrito a mano manda y el resto se reparte entre los automáticos por aporte", () => {
    const p = participacion(socios([
      { id: "a", nombre: "Ana", aporte: 1000, porcentaje: 50 },
      { id: "b", nombre: "Beto", aporte: 300 },
      { id: "c", nombre: "Caro", aporte: 100 },
    ]));
    expect(p.socios.map((s) => [s.porcentaje, s.origen])).toEqual([[50, "manual"], [37.5, "aporte"], [12.5, "aporte"]]);
    expect(p.cuadra).toBe(true);
  });

  it("aportes en 0: partes iguales (33,33 × 3 cuadra con la tolerancia)", () => {
    const p = participacion(socios([
      { id: "a", nombre: "Ana" },
      { id: "b", nombre: "Beto" },
      { id: "c", nombre: "Caro" },
    ]));
    expect(p.socios.every((s) => s.porcentaje === 33.33 && s.origen === "igual")).toBe(true);
    expect(p.total).toBe(99.99);
    expect(p.cuadra).toBe(true);
  });

  it("manuales que no suman 100 y nadie automático: no cuadra", () => {
    const p = participacion(socios([
      { id: "a", nombre: "Ana", porcentaje: 60 },
      { id: "b", nombre: "Beto", porcentaje: 30 },
    ]));
    expect(p.total).toBe(90);
    expect(p.cuadra).toBe(false);
  });

  it("sin socios: total 0 y cuadra", () => {
    expect(participacion([])).toEqual({ socios: [], total: 0, cuadra: true });
  });
});

describe("totalesInversion", () => {
  const s = socios([
    { id: "a", nombre: "Ana", aporte: 3000 },
    { id: "b", nombre: "Beto", aporte: 2000 },
  ]);
  const inversion = (extra: Partial<DatosSeccion<"inversion">> = {}) =>
    leerSeccion("inversion", {
      items: [
        { id: "1", concepto: "Vitrinas", categoria: "Equipos y muebles", monto: 2500, fuente: "socio:a" },
        { id: "2", concepto: "Mercadería", categoria: "Mercadería inicial", monto: 4000, fuente: "socio:b" },
        { id: "3", concepto: "Licencia", categoria: "Trámites y licencias", monto: 500, fuente: "prestamo" },
        { id: "4", concepto: "Pintura", categoria: "Local y adecuación", monto: 1000, fuente: "socio:zz" },
      ],
      gananciaMensualEsperada: 1500,
      ...extra,
    });

  it("total, por categoría (sólo las que tienen plata) y por fuente con el nombre del socio", () => {
    const t = totalesInversion(inversion(), s);
    expect(t.total).toBe(8000);
    expect(t.porCategoria.map((c) => c.categoria)).toEqual([
      "Local y adecuación",
      "Equipos y muebles",
      "Mercadería inicial",
      "Trámites y licencias",
    ]);
    expect(t.porFuente).toEqual([
      { fuente: "socio:b", etiqueta: "Aporte de Beto", monto: 4000 },
      { fuente: "socio:a", etiqueta: "Aporte de Ana", monto: 2500 },
      { fuente: "socio:zz", etiqueta: "Aporte de un socio", monto: 1000 },
      { fuente: "prestamo", etiqueta: "Préstamo", monto: 500 },
    ]);
    expect(t.aportesSocios).toBe(5000);
    expect(t.sinCubrirPorSocios).toBe(3000);
    expect(t.mesesRecupero).toBe(6); // 8000 / 1500 = 5,33 → 6 meses
  });

  it("sin ganancia esperada (o en 0) no hay meses de recupero", () => {
    expect(totalesInversion(inversion({ gananciaMensualEsperada: null }), s).mesesRecupero).toBeNull();
    expect(totalesInversion(inversion({ gananciaMensualEsperada: 0 }), s).mesesRecupero).toBeNull();
    expect(totalesInversion(vacia("inversion"), s).mesesRecupero).toBeNull();
  });
});

describe("estadoLicencia", () => {
  it.each([
    [{ vence: "2026-10-01" }, "vencida", -15],
    [{ vence: "2026-11-10" }, "por-vencer", 25],
    [{ vence: "2026-11-15" }, "por-vencer", 30],
    [{ vence: "2026-11-16" }, "vigente", 31],
    [{ vence: "" }, "sin-vencimiento", null],
    [{ vence: "2026-10-01", tramitada: false }, "pendiente", null],
  ])("%o → %s", (l, estado, dias) => {
    expect(estadoLicencia(licencia(l), HOY)).toEqual({ estado, dias });
  });
});

describe("objetivos", () => {
  it("avance: lo escrito manda; si no, las acciones hechas; sin acciones, hecho = 100", () => {
    expect(avanceObjetivo(objetivo({ avance: 40, acciones: [{ id: "x", texto: "a", hecha: true }] }))).toBe(40);
    expect(
      avanceObjetivo(objetivo({
        acciones: [
          { id: "1", texto: "a", hecha: true },
          { id: "2", texto: "b" },
          { id: "3", texto: "c" },
          { id: "4", texto: "d" },
        ],
      })),
    ).toBe(25);
    expect(avanceObjetivo(objetivo({ estado: "hecho" }))).toBe(100);
    expect(avanceObjetivo(objetivo({ estado: "en-curso" }))).toBe(0);
  });

  it("atrasado: venció y no está hecho ni pausado", () => {
    expect(objetivoAtrasado(objetivo({ fin: "2026-10-15", estado: "en-curso" }), HOY)).toBe(true);
    expect(objetivoAtrasado(objetivo({ fin: "2026-10-15", estado: "hecho" }), HOY)).toBe(false);
    expect(objetivoAtrasado(objetivo({ fin: "2026-10-15", estado: "pausado" }), HOY)).toBe(false);
    expect(objetivoAtrasado(objetivo({ fin: HOY, estado: "en-curso" }), HOY)).toBe(false);
    expect(objetivoAtrasado(objetivo({ fin: "", estado: "en-curso" }), HOY)).toBe(false);
  });
});

describe("llenado", () => {
  it("cada sección explica su porcentaje", () => {
    expect(llenado("ficha", vacia("ficha"))).toBe(0);
    expect(llenado("ficha", leerSeccion("ficha", { razonSocial: "X", rubro: "bodega", horario: "8-20", descripcion: "y" }))).toBe(50);
    expect(llenado("lienzo", leerSeccion("lienzo", {
      canales: [{ id: "1", texto: "tienda" }],
      segmentos: [{ id: "2", texto: "vecinos" }],
      costos: [{ id: "3", texto: "alquiler" }],
    }))).toBe(33);
    const nota = (id: string) => [{ id, texto: "t" }];
    expect(llenado("foda", leerSeccion("foda", {
      fortalezas: nota("1"),
      oportunidades: nota("2"),
      debilidades: nota("3"),
      amenazas: nota("4"),
    }))).toBe(100);
    expect(llenado("socios", leerSeccion("socios", { items: [{ id: "a", nombre: "Ana" }] }))).toBe(100);
    expect(llenado("organizacion", leerSeccion("organizacion", { areas: [{ id: "a", nombre: "Ventas" }] }))).toBe(0);
    expect(llenado("organizacion", leerSeccion("organizacion", { cargos: [{ id: "c", nombre: "Cajero" }] }))).toBe(100);
    expect(llenado("espacios", leerSeccion("espacios", { croquis: [{ id: "c", titulo: "Local", url: "https://x/y.png" }] }))).toBe(50);
    expect(llenado("politicas", leerSeccion("politicas", { protocolo: [{ id: "p", paso: "Saludar" }] }))).toBe(33);
  });

  it("general = promedio de las secciones que se pasan", () => {
    const foda = leerSeccion("foda", {
      fortalezas: [{ id: "1", texto: "a" }],
      oportunidades: [{ id: "2", texto: "b" }],
      debilidades: [{ id: "3", texto: "c" }],
      amenazas: [{ id: "4", texto: "d" }],
    });
    expect(llenadoGeneral({ ficha: vacia("ficha"), foda })).toBe(50);
    expect(llenadoGeneral({})).toBe(0);
  });
});
