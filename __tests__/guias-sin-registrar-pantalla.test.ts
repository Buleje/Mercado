/**
 * ADR-446 · lo que la pantalla «Guías sin registrar» decide sin React: qué guía
 * se puede registrar ahora, qué manda «Registrar las listas», cómo se leen un
 * bloqueo y un resultado, y cómo viajan las elecciones al POST.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BloqueoDeGuia, LineaPropuesta } from "@/lib/forestal/anexo-a-despacho";
import type { ResultadoGuia } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import {
  PROPUESTA,
  SIN_ORIGEN,
  eleccionesParaApi,
  esperaLegible,
  mensajeDeCodigo,
  fechaDeCorrida,
  listasEnFila,
  resumenDeBloqueo,
  siguienteEnFila,
  textoDeLinea,
  textoDeResultado,
  valorDelSelector,
} from "@/components/admin/forestal/guias-sin-registrar-pantalla";
import { pedir } from "@/hooks/guias-sin-registrar-pedidos";

const guias = [
  { anexoId: "a054", registrable: true },
  { anexoId: "a055", registrable: true },
  { anexoId: "a064", registrable: false },
  { anexoId: "a063", registrable: true },
];
const error = (anexoId: string): ResultadoGuia => ({ anexoId, numero: "", gtf: "", estado: "error", codigo: "X", mensaje: "falló" });

describe("siguienteEnFila / listasEnFila", () => {
  it("la más vieja lista va primero; la bloqueada no cuenta", () => {
    expect(siguienteEnFila(guias, {})).toBe("a054");
    expect(listasEnFila(guias, {})).toEqual(["a054", "a055", "a063"]);
  });

  it("una guía que falló no frena a las demás, y la próxima fila la reintenta", () => {
    expect(siguienteEnFila(guias, { a054: error("a054") })).toBe("a055");
    expect(listasEnFila(guias, { a054: error("a054") })).toEqual(["a054", "a055", "a063"]);
  });

  it("una registrada sale de la fila", () => {
    const hecha: ResultadoGuia = { anexoId: "a054", numero: "", gtf: "", estado: "ya_registrada", despachos: [] };
    expect(siguienteEnFila(guias, { a054: hecha })).toBe("a055");
    expect(listasEnFila(guias, { a054: hecha })).toEqual(["a055", "a063"]);
  });

  it("sin ninguna lista, no hay siguiente", () => {
    expect(siguienteEnFila([{ anexoId: "a064", registrable: false }], {})).toBeNull();
  });
});

describe("elecciones", () => {
  it("sin cambios viaja la propuesta (undefined), no un arreglo vacío que el servidor leería como «sin origen»", () => {
    expect(eleccionesParaApi(undefined)).toBeUndefined();
    expect(eleccionesParaApi({})).toBeUndefined();
    const e = { especie: "Tornillo", tipo: "Comercial" as const, corridas: [] };
    expect(eleccionesParaApi({ "tornillo|Comercial": e })).toEqual([e]);
  });

  it("el selector distingue propuesta, sin origen y una corrida", () => {
    expect(valorDelSelector(undefined)).toBe(PROPUESTA);
    expect(valorDelSelector({ especie: "Tornillo", tipo: "Comercial", corridas: [] })).toBe(SIN_ORIGEN);
    expect(valorDelSelector({ especie: "Tornillo", tipo: "Comercial", corridas: ["c19"] })).toBe("c19");
  });
});

describe("textos", () => {
  it("una corrida de otro año lleva el año (la N° 20 de Blas es de 2025)", () => {
    expect(fechaDeCorrida("2026-08-01", "2026-08-07")).toBe("01/08");
    expect(fechaDeCorrida("2025-10-19", "2026-08-07")).toBe("19/10/2025");
  });

  it("la falta de producción ofrece anotarla, en una línea", () => {
    const b: BloqueoDeGuia = { codigo: "SIN_STOCK_DE_LA_ESPECIE", mensaje: "largo", especie: "Azucar huayo", m3: 0.9199, piezas: 16, stockM3: 0 };
    const r = resumenDeBloqueo(b);
    expect(r.texto).toBe("Falta la producción de Azucar huayo: 0.920 m³ en 16 piezas.");
    expect(r.accion).toEqual({ tipo: "anotar", especie: "Azucar huayo", fechaTope: null });
  });

  it("una línea de montón que se parte dice cuánto queda", () => {
    const l: LineaPropuesta = {
      grupo: "tornillo|Paquetería larga", especie: "Tornillo", tipo: "Paquetería larga", producto: "MADERA ASERRADA (PAQUETERIA LARGA)",
      m3: 3.0017, origenM3: 3.0017, piezas: 58,
      origen: {
        corridaId: "c19", lineNo: 19, fecha: "2026-08-01", usado: true, sinOrigen: false, clase: "monton",
        paqueteId: "p72", codigo: "72", presentacion: "PIEZAS", restoM3: 0.2613, duenoMadera: null, titularNombre: null,
      },
    };
    expect(textoDeLinea(l, "2026-08-07")).toBe("N° 19 · 01/08 · montón 72 · 3.002 m³ · 58 pzas · se parte: quedan 0.261 m³");
    expect(textoDeLinea({ ...l, origen: null, origenM3: 0 }, "2026-08-07")).toBe("Sin origen · 3.002 m³ · 58 pzas");
  });

  it("el resultado registrado cuenta líneas, origen y montones partidos", () => {
    const r: ResultadoGuia = {
      anexoId: "a054", numero: "2-19-0464128", gtf: "19-001-0000054", estado: "registrada",
      despachos: [41, 42, 43].map((lineNo) => ({ id: `d${lineNo}`, lineNo, especie: "Tornillo", tipo: "Comercial", m3: 1, origenM3: 1, corridaLineNo: 19, codigo: null })),
      atribuidoM3: 18.3275, sinAtribuirM3: 0, reemplazados: [], usadasTocadas: [],
      partidos: [{ paqueteId: "p72", codigo: "72", corridaId: "c19", corridaLineNo: 19, antesM3: 3.263, salidaM3: 3.0017, resto: { id: "r", codigo: "72-R1", m3: 0.2613 } }],
    };
    expect(textoDeResultado(r)).toBe("3 líneas en Despacho (N° 41 a 43) · 18.328 m³ con origen · 1 montón partido");
  });
});

describe("fallos en su idioma", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("la 064: dice hasta qué fecha anotar la producción que falta", () => {
    const b: BloqueoDeGuia = { codigo: "SIN_STOCK_DE_LA_ESPECIE", mensaje: "largo", especie: "Azucar huayo", m3: 0.9199, piezas: 16, stockM3: 0, fechaTope: "2026-09-25" };
    const r = resumenDeBloqueo(b);
    expect(r.texto).toBe("Falta la producción de Azucar huayo: 0.920 m³ en 16 piezas. Anótala con fecha hasta el 25/09/2026.");
    expect(r.accion).toEqual({ tipo: "anotar", especie: "Azucar huayo", fechaTope: "25/09/2026" });
  });

  it("otra pestaña o el libro ocupado se dicen como algo pasajero; el anexo registrado, como definitivo", () => {
    expect(mensajeDeCodigo("TANDA_EN_CURSO", "x")).toBe("Otra guía se está registrando: intenta en unos segundos.");
    expect(mensajeDeCodigo("LIBRO_OCUPADO", "x")).toBe("El libro está ocupado con otra operación: intenta en unos segundos.");
    expect(mensajeDeCodigo("ANEXO_REGISTRADO", "x")).toBe("Ese anexo ya tiene su salida en el libro: no se edita ni se borra.");
    expect(mensajeDeCodigo("PERIODO_CERRADO", "El período agosto está cerrado.")).toBe("El período agosto está cerrado.");
  });

  it("la espera se lee en minutos y segundos", () => {
    expect(esperaLegible(45)).toBe("45 s");
    expect(esperaLegible(200)).toBe("3 min 20 s");
    expect(esperaLegible(300)).toBe("5 min");
  });

  it("un 429 dice cuánto esperar (del cuerpo o de Retry-After) y lo devuelve para la fila", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Too many requests", retryAfter: 200 }), { status: 429 })));
    const r = await pedir("POST", {});
    expect(r).toMatchObject({ ok: false, status: 429, esperarSeg: 200 });
    expect(!r.ok && r.mensaje).toBe("Llegaste al límite de registros de la tienda: espera 3 min 20 s y vuelve a intentar.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "45" } })));
    expect(await pedir("POST", {})).toMatchObject({ ok: false, esperarSeg: 45 });
  });

  it("un 409 del libro se traduce por su código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "TANDA_EN_CURSO", message: "Otra tanda…" }), { status: 409 })));
    expect(await pedir("POST", {})).toMatchObject({ ok: false, codigo: "TANDA_EN_CURSO", mensaje: "Otra guía se está registrando: intenta en unos segundos.", esperarSeg: null });
  });
});
