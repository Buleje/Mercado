/**
 * Los filtros encadenados de la Capacidad de la planta y lo que hay detrás de
 * cada fuente.
 *
 * Lo que se protege acá no es la aritmética —es fácil— sino las decisiones que
 * un refactor puede deshacer sin que nada falle:
 *  · una fuente que no puede honrar el filtro queda en CERO y lo DICE;
 *  · el `pendienteM3` del libro no se reparte entre permisos (no los tiene);
 *  · las opciones de un filtro salen de lo que queda tras los anteriores;
 *  · lo por recepcionar cuenta para elegir permiso, aunque no esté en el patio.
 */

import { describe, expect, it } from "vitest";
import {
  armarBalance,
  esLibre,
  esPorRecepcionar,
  filaDeTroza,
  lotesDeFuente,
  alternarEnRecorte,
  opcionesDeCapacidad,
  sanearFiltros,
  trozasDeFuente,
  type CorridaDisponible,
  type EntradaCapacidad,
  type LoteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import { tablaDeFuente } from "@/lib/forestal/capacidad-detalle-filas";
import { escribirParams, leerParams } from "@/hooks/use-params-de-saldos";
import { admiteDelLote } from "@/lib/forestal/capacidad-de-planta";
import { celdaCsv } from "@/lib/forestal/ctp-ingresos-csv";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (o: Partial<TrozaConsumible> & { id: string }): TrozaConsumible =>
  ({
    woodEntryId: "w1",
    codificacion: o.id,
    especieComun: "TORNILLO",
    volumenM3: 1,
    guiaRecepcionada: true,
    ...o,
  }) as TrozaConsumible;

const lote = (o: Partial<LoteDeCapacidad> & { code: string }): LoteDeCapacidad => ({
  id: o.code,
  trozas: [],
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: 0,
  restaM3: 0,
  apartadoM3: 0,
  piezas: 0,
  ...o,
});

const corrida = (o: Partial<CorridaDisponible> & { id: string }): CorridaDisponible => ({
  fecha: "2026-08-01",
  lote: "L-1",
  producto: "ASERRADA",
  especie: "TORNILLO",
  unidad: "m3",
  disponible: 0,
  titularOrigen: [],
  gtfOrigen: [],
  paquetes: [],
  ...o,
});

const PATIO: TrozaConsumible[] = [
  troza({ id: "A", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-1", volumenM3: 10 }),
  troza({ id: "B", permiso: "P-1", especieComun: "CAPIRONA", gtfNumber: "G-2", volumenM3: 4 }),
  troza({ id: "C", permiso: "P-2", especieComun: "TORNILLO", gtfNumber: "G-3", volumenM3: 6 }),
  // Anotada, todavía no bajó del camión.
  troza({ id: "D", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-4", volumenM3: 5, guiaRecepcionada: false }),
  // Ya está en un lote: no es patio libre.
  troza({ id: "E", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-1", volumenM3: 3, loteAserrioId: "L1" }),
];

const ENTRADA: EntradaCapacidad = {
  patio: PATIO,
  lotes: [
    lote({ code: "L-1", permisos: ["P-1"], especie: "TORNILLO", restaM3: 2 }),
    lote({ code: "L-2", permisos: ["P-2"], especie: "CAPIRONA", restaM3: 1 }),
  ],
  /* Tres corridas con saldo: una de un solo permiso, una con dos adentro y una
     sin origen. El libro del período firma más de lo que hay (usados). */
  corridas: [
    corrida({ id: "c1", disponible: 10, titularOrigen: ["P-1"], gtfOrigen: ["G-1"], especie: "TORNILLO" }),
    corrida({ id: "c2", disponible: 3, titularOrigen: ["P-1", "P-2"], gtfOrigen: ["G-1", "G-3"] }),
    corrida({ id: "c3", disponible: 2, titularOrigen: [], gtfOrigen: [] }),
  ],
  stockLibroM3: 62,
  pendienteSinPiezasM3: 7,
  periodoLabel: "julio de 2026",
};

describe("qué troza entra en cada fuente", () => {
  it("libre = sin lote, sin corrida y de guía recibida", () => {
    expect(PATIO.filter(esLibre).map((t) => t.id)).toEqual(["A", "B", "C"]);
  });

  it("por recepcionar = la guía todavía no se recibió", () => {
    expect(PATIO.filter(esPorRecepcionar).map((t) => t.id)).toEqual(["D"]);
  });
});

describe("filtros encadenados", () => {
  it("las especies salen de lo que tiene el permiso elegido", () => {
    const { especies } = opcionesDeCapacidad(PATIO, { permiso: ["P-2"] });
    expect(especies.map((e) => e.valor)).toEqual(["TORNILLO"]);
  });

  it("las guías salen de lo que queda tras permiso Y especie", () => {
    const { guias } = opcionesDeCapacidad(PATIO, { permiso: ["P-1"], especie: ["TORNILLO"] });
    // G-1 (la pieza libre A) y G-4 (la que no llegó). G-2 es CAPIRONA.
    expect(guias.map((g) => g.valor).sort()).toEqual(["G-1", "G-4"]);
  });

  it("cada opción dice cuánta madera tiene detrás", () => {
    const { permisos } = opcionesDeCapacidad(PATIO, {});
    const p1 = permisos.find((p) => p.valor === "P-1");
    // A(10) + B(4) + D(5). La E ya está en un lote: no cuenta.
    expect(p1).toMatchObject({ piezas: 3, m3: 19 });
  });

  it("un permiso cuya madera entera está sin recibir se puede elegir igual", () => {
    const soloSinRecibir = [troza({ id: "X", permiso: "P-9", guiaRecepcionada: false, volumenM3: 2 })];
    expect(opcionesDeCapacidad(soloSinRecibir, {}).permisos.map((p) => p.valor)).toEqual(["P-9"]);
  });
});

describe("el balance bajo filtros", () => {
  it("sin filtros suma las cuatro fuentes", () => {
    const b = armarBalance(ENTRADA, {});
    const f = Object.fromEntries(b.fuentes.map((x) => [x.clave, x]));
    expect(f.patio.m3).toBe(20); // A+B+C
    expect(f.porRecepcionar.m3).toBe(12); // D(5) + pendiente del libro(7)
    expect(f.lotes.m3).toBe(3);
    // Lo DISPONIBLE hoy (10+3+2), no los 62 que firma el libro.
    expect(f.productos.m3).toBe(15);
    expect(f.productos.detalle).toMatch(/libro firma 62/);
  });

  it("el pendiente del libro NO se reparte entre permisos", () => {
    const b = armarBalance(ENTRADA, { permiso: ["P-1"] });
    const rec = b.fuentes.find((x) => x.clave === "porRecepcionar")!;
    expect(rec.m3).toBe(5); // sólo la troza D; el pendiente de 7 se cae
  });

  it("los productos se atribuyen SÓLO por corrida entera de ese permiso", () => {
    const b = armarBalance(ENTRADA, { permiso: ["P-1"] });
    const prod = b.fuentes.find((x) => x.clave === "productos")!;
    expect(prod.m3).toBe(10); // c1 sí; c2 (mezcla) y c3 (sin origen) no
    expect(prod.filas).toBe(1);
    expect(prod.detalle).toMatch(/3 m³ en 1 corrida con origen mezclado/);
    expect(prod.detalle).toMatch(/2 m³ sin origen/);
  });

  it("con un permiso que ninguna corrida trae entera, cero y el porqué", () => {
    const b = armarBalance(ENTRADA, { permiso: ["P-2"] });
    const prod = b.fuentes.find((x) => x.clave === "productos")!;
    expect(prod.m3).toBe(0);
    expect(prod.noAtribuible).toMatch(/mezclado/);
  });

  it("sin corridas cargadas usa el stock del libro y lo dice", () => {
    const b = armarBalance({ ...ENTRADA, corridas: undefined }, {});
    const prod = b.fuentes.find((x) => x.clave === "productos")!;
    expect(prod.m3).toBe(62);
    expect(prod.detalle).toMatch(/libro/);
  });

  it("una corrida en otra unidad no se suma y se avisa", () => {
    const b = armarBalance({ ...ENTRADA, corridas: [corrida({ id: "x", unidad: "pt", disponible: 400 })] }, {});
    const prod = b.fuentes.find((x) => x.clave === "productos")!;
    expect(prod.m3).toBe(0);
    expect(prod.detalle).toMatch(/1 corrida en pt no se suman/);
  });

  it("el permiso que sólo existe ya aserrado se puede elegir igual", () => {
    const { permisos } = opcionesDeCapacidad([], {}, [corrida({ id: "y", disponible: 4, titularOrigen: ["P-9"] })]);
    expect(permisos).toEqual([{ valor: "P-9", piezas: 1, m3: 4 }]);
  });

  it("con una guía elegida los lotes se caen y lo dicen", () => {
    const b = armarBalance(ENTRADA, { guia: ["G-1"] });
    const lotesF = b.fuentes.find((x) => x.clave === "lotes")!;
    expect(lotesF.m3).toBe(0);
    expect(lotesF.noAtribuible).toMatch(/varias guías/i);
  });

  it("los lotes SÍ honran permiso y especie", () => {
    expect(lotesDeFuente(ENTRADA.lotes, { permiso: ["P-2"] }).map((l) => l.code)).toEqual(["L-2"]);
    expect(lotesDeFuente(ENTRADA.lotes, { especie: ["tornillo"] }).map((l) => l.code)).toEqual(["L-1"]);
  });

  it("el total es la suma de lo convertido, no de los m³ crudos", () => {
    const b = armarBalance(ENTRADA, { permiso: ["P-2"] });
    // patio C(6)·0.56 = 3.36 · por recepcionar 0 · lote L-2 = 1 · productos 0
    expect(b.totalProducto).toBeCloseTo(4.36, 4);
  });
});

describe("las filas del detalle", () => {
  it("el patio filtrado trae sólo lo libre que cumple", () => {
    const filas = trozasDeFuente("patio", PATIO, { permiso: ["P-1"] });
    expect(filas.map((t) => t.id)).toEqual(["A", "B"]);
  });

  it("ordena de mayor a menor volumen", () => {
    expect(trozasDeFuente("patio", PATIO, {}).map((t) => t.id)).toEqual(["A", "C", "B"]);
  });

  it("la fila arma dimensiones y pie tablar", () => {
    const f = filaDeTroza(troza({ id: "Z", d1Cm: 40, d2Cm: 38, largoM: 6, volumenM3: 2 }));
    expect(f.dimensiones).toBe("Ø 40/38 cm · 6 m");
    expect(f.pt).toBe(Math.round(2 * 424));
  });

  it("sin diámetros cae al texto de dimensiones que traiga la pieza", () => {
    expect(filaDeTroza(troza({ id: "Y", dimensiones: "2x8x10" })).dimensiones).toBe("2x8x10");
  });

  it("la especie del filtro no distingue mayúsculas", () => {
    expect(trozasDeFuente("patio", PATIO, { especie: ["tornillo"] }).map((t) => t.id)).toEqual(["A", "C"]);
  });
});

describe("la fecha de la pieza", () => {
  it("el asiento date-only NO se corre un día (timeZone UTC)", async () => {
    const { fechaDeTroza } = await import("@/lib/forestal/capacidad-de-planta");
    expect(fechaDeTroza(troza({ id: "F1", fechaIngreso: "2026-09-01" }))).toMatch(/01/);
  });

  it("la recepción es un instante y se lee en hora de Lima", async () => {
    const { fechaDeTroza } = await import("@/lib/forestal/capacidad-de-planta");
    // 2026-09-01T13:00Z = 08:00 en Lima, el mismo día.
    expect(fechaDeTroza(troza({ id: "F2", fechaRecepcion: "2026-09-01T13:00:50.312Z" }))).toMatch(/01/);
    // 2026-09-02T02:00Z = 21:00 del 1 en Lima: la fecha del negocio es el 1.
    expect(fechaDeTroza(troza({ id: "F3", fechaRecepcion: "2026-09-02T02:00:00.000Z" }))).toMatch(/01/);
  });

  it("sin ninguna fecha no inventa una", () => {
    expect(filaDeTroza(troza({ id: "F4" })).fecha).toBe("—");
  });
});


describe("las filas del detalle (tabla)", () => {
  it("un lote trae sus piezas como filas hijas, con la guía", () => {
    const entrada: EntradaCapacidad = {
      ...ENTRADA,
      lotes: [
        lote({
          code: "L-9",
          permisos: ["P-1"],
          trozas: [{ id: "t1", codigo: "T-1", especie: "TORNILLO", m3: 1.5, permiso: "P-1", guia: "G-1", consumida: false }],
        }),
      ],
    };
    const fuente = armarBalance(entrada, {}).fuentes.find((f) => f.clave === "lotes")!;
    const t = tablaDeFuente(fuente, entrada, {});
    expect(t.filas[0].celdas.Lote).toBe("L-9");
    expect(t.filas[0].hijas?.filas[0]).toMatchObject({ Código: "T-1", Guía: "G-1", Estado: "sin aserrar" });
  });

  it("productos = una fila por corrida, con su permiso o «mezclados»", () => {
    const fuente = armarBalance(ENTRADA, {}).fuentes.find((f) => f.clave === "productos")!;
    const t = tablaDeFuente(fuente, ENTRADA, {});
    expect(t.filas.map((f) => f.celdas.Permiso)).toEqual(["P-1", "2 mezclados", "sin origen"]);
  });
});

describe("la URL de Saldos", () => {
  const SECC = ["estado", "capacidad"] as const;

  it("lee pestaña y filtros, ignorando una pestaña que no existe", () => {
    expect(leerParams("?seccion=capacidad&permiso=P-1&guia=G-1", SECC)).toEqual({
      seccion: "capacidad",
      filtros: { permiso: ["P-1"], guia: ["G-1"] },
    });
    expect(leerParams("?seccion=otra", SECC).seccion).toBeNull();
  });

  it("varios valores en un parámetro viajan separados por coma", () => {
    const { filtros } = leerParams("?seccion=capacidad&permiso=P-1,P-2&especie=TORNILLO", SECC);
    expect(filtros.permiso).toEqual(["P-1", "P-2"]);
    expect(filtros.especie).toEqual(["TORNILLO"]);
  });

  it("un link tipeado a mano con vacíos y repetidos da el mismo recorte", () => {
    expect(leerParams("?seccion=capacidad&permiso=P-1,,P-1, P-2 ", SECC).filtros.permiso).toEqual([
      "P-1",
      "P-2",
    ]);
  });

  it("escribe lo que hay y borra lo vacío", () => {
    const url = escribirParams(new URL("http://x/admin?tab=ctp&vista=saldos&especie=VIEJA"), "capacidad", { permiso: ["P-1", "P-2"] });
    expect(url.searchParams.get("seccion")).toBe("capacidad");
    expect(url.searchParams.get("permiso")).toBe("P-1,P-2");
    expect(url.searchParams.has("especie")).toBe(false);
    expect(url.searchParams.get("vista")).toBe("saldos");
  });

  it("una lista vacía se borra igual que un filtro sin poner", () => {
    const url = escribirParams(new URL("http://x/admin?permiso=P-9"), "capacidad", { permiso: [] });
    expect(url.searchParams.has("permiso")).toBe(false);
  });
});

describe("la conciliación con el libro", () => {
  it("separa lo que queda del período de lo anterior, número por número", () => {
    const entrada: EntradaCapacidad = {
      ...ENTRADA,
      stockLibroM3: 62,
      periodo: { from: "2026-07-01", to: "2026-09-30" },
      corridas: [
        corrida({ id: "p1", fecha: "2026-08-01", disponible: 7.5 }),
        corrida({ id: "v1", fecha: "2025-12-10", disponible: 12.5 }),
      ],
    };
    const prod = armarBalance(entrada, {}).fuentes.find((f) => f.clave === "productos")!;
    expect(prod.m3).toBe(20);
    expect(prod.detalle).toMatch(/libro firma 62/);
    expect(prod.detalle).toMatch(/quedan 7\.5 disponibles/);
    expect(prod.detalle).toMatch(/12\.5 más de períodos anteriores/);
    expect(prod.detalle).toMatch(/→ 20 hoy/);
  });

  it("si el libro y el depósito coinciden, no inventa una conciliación", () => {
    const entrada: EntradaCapacidad = { ...ENTRADA, stockLibroM3: 15 };
    const prod = armarBalance(entrada, {}).fuentes.find((f) => f.clave === "productos")!;
    expect(prod.detalle).not.toMatch(/libro/);
  });
});


describe("las reglas del patio mandan sobre qué es «libre»", () => {
  it("una pieza despachada en rollo, un descarte o una madre retrozada no son patio libre", () => {
    const patio = [
      troza({ id: "d", despachadaEnId: "desp-1", volumenM3: 4 }),
      troza({ id: "x", descarte: true, volumenM3: 4 }),
      troza({ id: "m", retrozos: 2, volumenM3: 4 }),
      troza({ id: "ok", volumenM3: 4 }),
    ];
    expect(patio.filter(esLibre).map((t) => t.id)).toEqual(["ok"]);
  });

  it("una pieza sin volumen no cuenta", () => {
    expect(esLibre(troza({ id: "z", volumenM3: 0 }))).toBe(false);
  });
});

describe("cuánto admite un lote (cota máxima)", () => {
  it("consumió y no declaró: el techo entero por delante, no cero", () => {
    expect(admiteDelLote(lote({ code: "a", consumidoM3: 10, esperado56M3: 5.6, producidoM3: null, restaM3: null }))).toBe(5.6);
  });

  it("ya pasó el techo: aporta cero, no un negativo que reste", () => {
    expect(admiteDelLote(lote({ code: "b", consumidoM3: 10, esperado56M3: 5.6, producidoM3: 7, restaM3: -1.4 }))).toBe(0);
  });

  it("sin consumo ni producción: nada que admitir", () => {
    expect(admiteDelLote(lote({ code: "c", producidoM3: null, restaM3: null }))).toBe(0);
  });
});

describe("las cinco fuentes", () => {
  it("la madera apartada en lotes sin aserrar es una fuente, convertida al 56 %", () => {
    const entrada: EntradaCapacidad = {
      ...ENTRADA,
      lotes: [lote({ code: "L-9", apartadoM3: 10, trozas: [{ id: "t", codigo: "T", especie: "TORNILLO", m3: 10, permiso: "", guia: "", consumida: false }] })],
    };
    const f = armarBalance(entrada, {}).fuentes.find((x) => x.clave === "apartado")!;
    expect(f).toMatchObject({ m3: 10, enProducto: 5.6, convertido: true, filas: 1 });
  });

  it("un lote con permisos mezclados no entra al permiso filtrado y se cuenta aparte", () => {
    const entrada: EntradaCapacidad = {
      ...ENTRADA,
      lotes: [
        lote({ code: "M", permisos: ["P-1", "P-2"], consumidoM3: 10, esperado56M3: 5.6, producidoM3: 0, restaM3: 5.6 }),
        lote({ code: "U", permisos: ["P-1"], consumidoM3: 10, esperado56M3: 5.6, producidoM3: 0, restaM3: 5.6 }),
      ],
    };
    const f = armarBalance(entrada, { permiso: ["P-1"] }).fuentes.find((x) => x.clave === "lotes")!;
    expect(f.m3).toBe(5.6);
    expect(f.detalle).toMatch(/5\.6 m³ en 1 lote con permisos mezclados/);
  });

  it("una guía sin recibir ya no se cuenta también por el total del libro", () => {
    // D (5 m³, sin recibir) entra troza por troza; el pendiente sin piezas (7) es OTRA madera.
    const f = armarBalance(ENTRADA, {}).fuentes.find((x) => x.clave === "porRecepcionar")!;
    expect(f.m3).toBe(12);
    expect(f.detalle).toMatch(/1 pieza de guías sin recibir/);
    expect(f.detalle).toMatch(/7 m³ de ingresos sin validar y sin piezas/);
  });
});

describe("cuando una fuente no llegó", () => {
  it("el patio cargando o fallado no vale cero: lo dice y no suma", () => {
    const cargando = armarBalance({ ...ENTRADA, estado: { patio: "cargando" } }, {});
    expect(cargando.fuentes.find((f) => f.clave === "patio")).toMatchObject({ m3: 0, noAtribuible: "Cargando el patio…" });
    const fallo = armarBalance({ ...ENTRADA, estado: { patio: "error" } }, {});
    expect(fallo.fuentes.find((f) => f.clave === "patio")?.noAtribuible).toMatch(/No se pudo leer el patio/);
    expect(fallo.fuentes.find((f) => f.clave === "porRecepcionar")?.m3).toBe(0);
  });

  it("un fallo al leer el depósito NO se declara como stock marcado usado", () => {
    const b = armarBalance({ ...ENTRADA, corridas: [], estado: { corridas: "error" } }, {});
    const prod = b.fuentes.find((f) => f.clave === "productos")!;
    expect(prod.m3).toBe(62); // cae al libro
    expect(prod.detalle).toMatch(/No se pudo leer el depósito/);
    expect(prod.detalle).not.toMatch(/ya usado» o ya salió/);
  });

  it("un patio recortado por el endpoint avisa que el techo es parcial", () => {
    const b = armarBalance({ ...ENTRADA, patioTruncado: { devueltas: 5000, total: 6120 } }, {});
    expect(b.fuentes.find((f) => f.clave === "patio")?.detalle).toMatch(/sólo llegaron 5,?000|sólo llegaron 5\.000/);
  });
});

describe("el CSV no ejecuta fórmulas", () => {
  it("una celda que empieza con = + @ se vuelve texto", () => {
    expect(celdaCsv("=cmd|' /C calc'!A0")).toMatch(/^"?'=cmd/);
    expect(celdaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celdaCsv("+1+1")).toBe("'+1+1");
  });

  it("un número negativo sigue siendo número", () => {
    expect(celdaCsv("-81,807")).toBe("-81,807");
    expect(celdaCsv("-3")).toBe("-3");
    expect(celdaCsv(-2.5)).toBe("-2.5");
  });
});

describe("los filtros se cruzan en las dos direcciones (Brandon, 2026-09-08)", () => {
  it("elegida la especie, los permisos son los que TIENEN esa especie", () => {
    // CAPIRONA sólo está en P-1 (troza B). Antes se ofrecían P-1 y P-2.
    const { permisos } = opcionesDeCapacidad(PATIO, { especie: ["CAPIRONA"] });
    expect(permisos.map((p) => p.valor)).toEqual(["P-1"]);
    expect(permisos[0]).toMatchObject({ piezas: 1, m3: 4 });
  });

  it("con TORNILLO quedan los dos permisos, cada uno con lo suyo", () => {
    const { permisos } = opcionesDeCapacidad(PATIO, { especie: ["TORNILLO"] });
    expect(permisos.map((p) => p.valor).sort()).toEqual(["P-1", "P-2"]);
    // P-1: A(10) + D(5) sin recibir. La E ya está en un lote.
    expect(permisos.find((p) => p.valor === "P-1")).toMatchObject({ piezas: 2, m3: 15 });
  });

  it("elegida la guía, el permiso y la especie se acotan a ella", () => {
    const o = opcionesDeCapacidad(PATIO, { guia: ["G-3"] });
    expect(o.permisos.map((p) => p.valor)).toEqual(["P-2"]);
    expect(o.especies.map((e) => e.valor)).toEqual(["TORNILLO"]);
  });

  it("un filtro no se saca a sí mismo de su propia lista", () => {
    const { especies } = opcionesDeCapacidad(PATIO, { especie: ["CAPIRONA"], permiso: ["P-1"] });
    expect(especies.map((e) => e.valor).sort()).toEqual(["CAPIRONA", "TORNILLO"]);
  });

  it("las corridas con DOS permisos adentro no se reparten entre ellos", () => {
    const mezcla = corrida({ id: "m", disponible: 3, titularOrigen: ["P-1", "P-2"], especie: "TORNILLO" });
    const { permisos } = opcionesDeCapacidad([], { especie: ["TORNILLO"] }, [mezcla]);
    expect(permisos).toEqual([]);
  });
});

describe("sanearFiltros suelta lo que quedó sin madera", () => {
  it("una combinación imposible pierde el filtro que no se cumple", () => {
    // G-3 es TORNILLO de P-2: con CAPIRONA no hay nada.
    const r = sanearFiltros(PATIO, [], { especie: ["CAPIRONA"], guia: ["G-3"] });
    expect(r.guia).toBeUndefined();
    expect(r.especie).toEqual(["CAPIRONA"]);
  });

  it("una combinación que existe se deja intacta", () => {
    const f = { permiso: ["P-1"], especie: ["TORNILLO"], guia: ["G-1"] };
    expect(sanearFiltros(PATIO, [], f)).toBe(f);
  });

  it("el filtro recién tocado no se suelta: se suelta el que ya no lo acompaña", () => {
    // El operador acaba de elegir la guía G-3 (TORNILLO de P-2) teniendo CAPIRONA.
    const r = sanearFiltros(PATIO, [], { especie: ["CAPIRONA"], guia: ["G-3"] }, "guia");
    expect(r.guia).toEqual(["G-3"]);
    expect(r.especie).toBeUndefined();
  });

  it("sin datos cargados no toca nada: un [] puede ser «todavía no llegó»", () => {
    const f = { permiso: ["P-9"] };
    expect(sanearFiltros([], [], f)).toBe(f);
  });
});

describe("varios valores por filtro (Brandon, 2026-09-08)", () => {
  it("dos permisos tildados suman su madera, no la de uno solo", () => {
    const soloP1 = armarBalance(ENTRADA, { permiso: ["P-1"] });
    const losDos = armarBalance(ENTRADA, { permiso: ["P-1", "P-2"] });
    const patioDe = (b: ReturnType<typeof armarBalance>) =>
      b.fuentes.find((f) => f.clave === "patio")!.m3;
    expect(patioDe(soloP1)).toBe(14); // A(10) + B(4)
    expect(patioDe(losDos)).toBe(20); // + C(6)
  });

  it("las opciones cruzadas también se abren: dos especies traen sus dos permisos", () => {
    const { permisos } = opcionesDeCapacidad(PATIO, { especie: ["CAPIRONA"] });
    expect(permisos.map((p) => p.valor)).toEqual(["P-1"]);
    const dos = opcionesDeCapacidad(PATIO, { especie: ["CAPIRONA", "TORNILLO"] });
    expect(dos.permisos.map((p) => p.valor).sort()).toEqual(["P-1", "P-2"]);
  });

  it("una corrida con dos títulos adentro no entra ni tildando los dos", () => {
    // La mezcla no se deshace porque el filtro sea más ancho: sigue sin repartirse.
    const b = armarBalance(ENTRADA, { permiso: ["P-1", "P-2"] });
    const productos = b.fuentes.find((f) => f.clave === "productos")!;
    expect(productos.m3).toBe(10); // sólo c1 (P-1); c2 mezcla y c3 sin origen quedan afuera
    expect(productos.noAtribuible ?? productos.detalle).toMatch(/mezclado/);
  });

  it("sanearFiltros cae valor por valor, no suelta el recorte entero", () => {
    // De los tres, P-9 no existe: quedan los dos que sí.
    const r = sanearFiltros(PATIO, [], { permiso: ["P-1", "P-9", "P-2"] });
    expect(r.permiso).toEqual(["P-1", "P-2"]);
  });

  it("si NINGUNO de los valores sobrevive, el recorte se suelta entero", () => {
    const r = sanearFiltros(PATIO, [], { especie: ["TORNILLO"], guia: ["G-2"] }, "especie");
    expect(r.especie).toEqual(["TORNILLO"]);
    expect(r.guia).toBeUndefined();
  });

  it("alternar suma, saca, y devuelve undefined cuando queda vacío", () => {
    expect(alternarEnRecorte(undefined, "A")).toEqual(["A"]);
    expect(alternarEnRecorte(["A"], "B")).toEqual(["A", "B"]);
    expect(alternarEnRecorte(["A", "B"], "A")).toEqual(["B"]);
    expect(alternarEnRecorte(["A"], "A")).toBeUndefined();
  });
});
