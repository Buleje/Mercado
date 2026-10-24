/**
 * «Productos disponibles» (rediseño 2026-09-27): UN criterio en toda la página.
 * Disponible = libre + apartado; lo marcado como usado SIEMPRE aparte. Por
 * cada grupo, la suma de su detalle = la fila; los indicadores = las tablas.
 */
import { describe, expect, it } from "vitest";
import {
  FILTRO_PRODUCTOS_VACIO,
  SIN_PERMISO,
  claveProducto,
  cuentaDeAvisos,
  detalleDeGrupo,
  filasALaVista,
  filasDeProductos,
  filtrarProductos,
  mismoValorDeFiltro,
  motivoSinDisponible,
  paquetesComoSeVen,
  pilaProductoEspecie,
  porGrupo,
  ptDe,
  resumenProductos,
  totalDeGrupos,
  type CorridaDisponible,
  type DimensionProducto,
  type PaqueteDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import { csvDeProductos, filtrosEnTexto, hojasDeProductos } from "@/lib/forestal/productos-disponibles-excel";

const AHORA = new Date("2026-09-27T12:00:00-05:00");

let n = 0;
const paquete = (o: Partial<PaqueteDisponible> = {}): PaqueteDisponible => ({
  id: `p${++n}`,
  codigo: `PQ-${n}`,
  producto: null,
  presentacion: "PAQUETES",
  cantidad: 10,
  volumenM3: 1,
  espesorCm: 5,
  anchoCm: 20,
  largoM: 3,
  observations: null,
  apartado: null,
  ...o,
});
const corrida = (o: Partial<CorridaDisponible> = {}): CorridaDisponible => ({
  id: `c${++n}`,
  lineNo: n,
  fecha: "2026-09-01T00:00:00.000Z",
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: null,
  unidad: "m3",
  lote: null,
  cantidad: 1,
  volumenConsumidoM3: null,
  producido: 1,
  despachado: 0,
  reprocesado: 0,
  disponible: 1,
  paquetes: [],
  observations: null,
  titularOrigen: ["CON-25-UCA-0207"],
  gtfOrigen: [],
  usadoAt: null,
  usadoMotivo: null,
  apartado: null,
  ...o,
});
const apartado = { id: "a1", para: "Maderera Sur", hasta: "2026-09-20", nota: null, creadoAt: "2026-09-10" };

/** Un depósito con todos los casos: paquetes, sin paquete, apartado, usado, sin permiso, dos permisos. */
function deposito(): CorridaDisponible[] {
  return [
    corrida({
      disponible: 1.5,
      paquetes: [
        paquete({ volumenM3: 1, cantidad: 30 }),
        paquete({ volumenM3: 0.5, cantidad: 12, apartado, espesorCm: null }),
      ],
    }),
    corrida({ especie: "TORNILLO", producto: "Comercial", disponible: 0.637, fecha: "2026-05-01T00:00:00.000Z" }),
    corrida({ especie: "Cachimbo", producto: "Madera aserrada", disponible: 2.25, titularOrigen: [] }),
    corrida({ especie: "Capirona", producto: "MADERA ASERRADA (TABLILLAS)", disponible: 0.168, titularOrigen: ["QA-PUESTA-0925", "CON-25-PAS-0033"] }),
    /* Un permiso con TODO marcado como usado: sale con 0 disponible y su usado aparte. */
    corrida({ especie: "Shihuahuaco", disponible: 3.292, titularOrigen: ["CON-25-UCA-0142"], usadoAt: "2026-09-02", usadoMotivo: "venta sin guía" }),
  ];
}

const filas = () => filasDeProductos(deposito(), AHORA);
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

describe("filas: una por paquete, o la corrida sin paquete con su saldo", () => {
  it("arma las filas y su estado", () => {
    const f = filas();
    expect(f).toHaveLength(6);
    expect(f.filter((x) => x.paquete)).toHaveLength(2);
    expect(f.map((x) => x.estado)).toEqual(["libre", "apartado", "libre", "libre", "libre", "usado"]);
    expect(f[2]?.volumenM3).toBe(0.637);
    expect(f[2]?.tramo).toBe("viejo");
    expect(f[0]?.clave).toMatch(/^c\d+:p\d+$/);
  });

  it("sin reloj (antes de montar) la edad queda en blanco, no en cero", () => {
    expect(filasDeProductos(deposito(), null).every((x) => x.dias == null)).toBe(true);
  });
});

describe("UN criterio: disponible = libre + apartado; lo usado aparte", () => {
  it("el resumen no suma lo usado y el apartado sí cuenta", () => {
    const r = resumenProductos(filas(), AHORA);
    expect(r.disponible.m3).toBe(r4(1.5 + 0.637 + 2.25 + 0.168));
    expect(r.disponible.pt).toBe(ptDe(1.5 + 0.637 + 2.25 + 0.168));
    expect(r.libre.m3 + r.apartado.m3).toBeCloseTo(r.disponible.m3, 4);
    expect(r.usado).toMatchObject({ corridas: 1, m3: 3.292 });
    expect(r.apartado).toMatchObject({ filas: 1, vencidos: 1, clientes: 1 });
    expect(r.disponible.paquetes).toBe(2);
    expect(r.disponible.piezas).toBe(42);
    expect(r.sinPaquete).toBe(3);
    expect(r.sinEscuadria).toBe(1);
    expect(r.sinPermiso.m3).toBe(2.25);
    /* Mismo número que las filas CON nombre de «Por permiso» (una corrida con dos permisos = una fila). */
    expect(r.permisos).toBe(porGrupo(filas(), "permiso").filter((g) => g.clave && g.disponible.filas > 0).length);
  });

  it("pt es m³ × 424 (madera aserrada), no el 56 % de rolliza", () => {
    expect(ptDe(1)).toBe(424);
    const r = resumenProductos(filas(), AHORA);
    expect(r.disponible.pt).toBe(Math.round(r.disponible.m3 * 424));
  });

  it.each<DimensionProducto>(["permiso", "especie", "producto"])(
    "los indicadores = la fila Total de «Por %s»",
    (dim) => {
      const r = resumenProductos(filas(), AHORA);
      const t = totalDeGrupos(porGrupo(filas(), dim));
      expect(t.disponible.m3).toBeCloseTo(r.disponible.m3, 4);
      expect(t.disponible.paquetes).toBe(r.disponible.paquetes);
      expect(t.disponible.piezas).toBe(r.disponible.piezas);
      expect(t.disponible.filas).toBe(r.disponible.filas);
      expect(t.usado.m3).toBeCloseTo(r.usado.m3, 4);
    },
  );

  it("por cada permiso, la suma de sus especies = su fila (también el que tiene TODO usado)", () => {
    const f = filas();
    const permisos = porGrupo(f, "permiso");
    expect(permisos.map((g) => g.etiqueta)).toContain(SIN_PERMISO);
    const todoUsado = permisos.find((g) => g.clave === "CON-25-UCA-0142");
    expect(todoUsado?.disponible.m3).toBe(0);
    expect(todoUsado?.usado.m3).toBe(3.292);
    for (const g of permisos) {
      const especies = detalleDeGrupo(f, "permiso", g.clave, "especie");
      expect(r4(especies.reduce((a, e) => a + e.disponible.m3, 0))).toBeCloseTo(g.disponible.m3, 4);
      expect(especies.reduce((a, e) => a + e.disponible.filas, 0)).toBe(g.disponible.filas);
      expect(r4(especies.reduce((a, e) => a + e.usado.m3, 0))).toBeCloseTo(g.usado.m3, 4);
    }
  });

  it("una corrida con dos permisos es UNA fila (no se cuenta dos veces)", () => {
    const permisos = porGrupo(filas(), "permiso");
    expect(permisos.find((g) => g.clave === "CON-25-PAS-0033 · QA-PUESTA-0925")?.disponible.m3).toBe(0.168);
  });

  it("«Tornillo» y «TORNILLO» son la misma especie", () => {
    const tornillo = porGrupo(filas(), "especie").find((g) => g.clave === "tornillo");
    expect(tornillo?.disponible.m3).toBe(r4(1.5 + 0.637));
  });
});

describe("producto: el paréntesis cuenta", () => {
  it("Comercial = MADERA ASERRADA (COMERCIAL); tablillas ≠ madera aserrada", () => {
    expect(claveProducto("Comercial")).toBe(claveProducto("MADERA ASERRADA (COMERCIAL)"));
    expect(claveProducto("MADERA ASERRADA (TABLILLAS)")).not.toBe(claveProducto("Madera aserrada"));
    expect(claveProducto("MADERA ASERRADA")).toBe(claveProducto("Madera aserrada"));
    const productos = porGrupo(filas(), "producto");
    expect(productos.find((g) => g.clave === "madera aserrada (comercial)")?.disponible.m3).toBe(r4(1.5 + 0.637 + 0));
  });
});

describe("filtro cruzado", () => {
  it("el mismo valor escrito distinto es el mismo filtro (el segundo clic lo suelta)", () => {
    expect(mismoValorDeFiltro("producto", "MADERA ASERRADA (COMERCIAL)", "Madera aserrada (comercial)")).toBe(true);
    expect(mismoValorDeFiltro("producto", "Madera aserrada", "MADERA ASERRADA (TABLILLAS)")).toBe(false);
    expect(mismoValorDeFiltro("especie", "Tornillo", "TORNILLO")).toBe(true);
    expect(mismoValorDeFiltro("permiso", SIN_PERMISO, "")).toBe(false);
  });

  it("elegir un permiso acota; la tabla de permisos se cuenta sin su filtro", () => {
    const f = filas();
    const filtro = { ...FILTRO_PRODUCTOS_VACIO, permiso: ["CON-25-UCA-0207"] };
    expect(resumenProductos(filtrarProductos(f, filtro), AHORA).disponible.m3).toBe(r4(1.5 + 0.637));
    expect(porGrupo(filtrarProductos(f, filtro, "permiso"), "permiso").length).toBe(porGrupo(f, "permiso").length);
  });

  it("«Sin permiso» se puede elegir", () => {
    const x = filtrarProductos(filas(), { ...FILTRO_PRODUCTOS_VACIO, permiso: [SIN_PERMISO] });
    expect(x.map((f) => f.corrida.especie)).toEqual(["Cachimbo"]);
  });

  it("elegir «A» NO trae la corrida «A · B» (es otra fila): fila y cifra filtrada coinciden", () => {
    const f = filas();
    expect(filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, permiso: ["QA-PUESTA-0925"] })).toHaveLength(0);
    const doble = filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, permiso: ["CON-25-PAS-0033 · QA-PUESTA-0925"] });
    expect(doble.map((x) => x.corrida.especie)).toEqual(["Capirona"]);
    for (const g of porGrupo(f, "permiso")) {
      const r = resumenProductos(filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, permiso: [g.etiqueta] }), AHORA);
      expect(r.disponible.m3).toBeCloseTo(g.disponible.m3, 4);
    }
  });

  it("la tabla de paquetes esconde lo usado salvo que el estado lo pida", () => {
    const f = filas();
    expect(filasALaVista(f, []).some((x) => x.estado === "usado")).toBe(false);
    expect(filasALaVista(f, ["usado"]).length).toBe(6);
    const soloUsado = filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, estado: ["usado"] });
    expect(resumenProductos(soloUsado, AHORA).disponible.m3).toBe(0);
  });

  it("buscar un código trae ESE paquete, no toda su corrida", () => {
    const f = filas();
    const codigo = f[1]?.paquete?.codigo ?? "?";
    const x = filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, texto: codigo });
    expect(x.map((y) => y.paquete?.codigo)).toEqual([codigo]);
  });
});

describe("sin nada disponible (Blas: todo marcado usado)", () => {
  const blas = () =>
    filasDeProductos(
      Array.from({ length: 5 }, () =>
        corrida({
          especie: "Tornillo",
          titularOrigen: [],
          usadoAt: "2026-08-01",
          disponible: 15.29,
          paquetes: [paquete({ volumenM3: 7.645, cantidad: 0 }), paquete({ volumenM3: 7.645, cantidad: 0 })],
        }),
      ),
      AHORA,
    );

  it("no afirma ausencia de dato: dice por qué no hay nada", () => {
    const r = resumenProductos(blas(), AHORA);
    expect(r.disponible).toMatchObject({ filas: 0, m3: 0 });
    expect(r.usado).toMatchObject({ corridas: 5, m3: 76.45 });
    expect(motivoSinDisponible(r)).toBe("Todo está marcado usado");
    expect(motivoSinDisponible(resumenProductos([], AHORA))).toBe("Nada disponible");
    expect(motivoSinDisponible(resumenProductos([], AHORA), true)).toBe("Nada con estos filtros");
    expect(motivoSinDisponible(resumenProductos(filas(), AHORA))).toBeNull();
  });
});

describe("avisos, descuadre, gráfico y Excel", () => {
  it("cuenta los avisos de lo que se ve", () => {
    expect(cuentaDeAvisos(filasALaVista(filas(), []))).toEqual({
      "sin-escuadria": 1,
      "sin-piezas": 0,
      viejos: 1,
      apartados: 1,
    });
  });

  it("5 paquetes de 2 m³ con 4 m³ despachados: las cifras dan 6 m³ (el libro), no 10", () => {
    const c = corrida({
      producido: 10,
      despachado: 4,
      disponible: 6,
      paquetes: Array.from({ length: 5 }, () => paquete({ volumenM3: 2, cantidad: 20 })),
    });
    const f = filasDeProductos([c], AHORA);
    const r = resumenProductos(f, AHORA);
    expect(r.disponible.m3).toBe(6);
    expect(r.disponible.pt).toBe(ptDe(6));
    expect(r.saldoLibroM3).toBe(6);
    expect(r.descuadre).toEqual({ corridas: 1, paquetesM3: 10, libroM3: 6 });
    /* La tabla de paquetes sigue mostrando cada paquete con su m³ de etiqueta. */
    expect(f.map((x) => x.volumenM3)).toEqual([2, 2, 2, 2, 2]);
    for (const dim of ["permiso", "especie", "producto"] as const)
      expect(totalDeGrupos(porGrupo(f, dim)).disponible.m3).toBe(6);
    const hojas = hojasDeProductos({ filas: f, paquetes: f, ahora: AHORA, filtros: [], alcance: null });
    for (const i of [0, 1, 2]) expect(hojas[i]!.filas.reduce((a, x) => a + Number(x["m³ disponibles"]), 0)).toBe(6);
    expect(r4(hojas[3]!.filas.reduce((a, x) => a + Number(x["m³ según el libro"]), 0))).toBe(6);
    expect(JSON.stringify(hojas[4]!.filas)).toContain("Manda el libro");
  });

  it("buscar UN paquete de una corrida que cuadra no enciende «no cuadra»", () => {
    const c = corrida({ disponible: 3, paquetes: [paquete({ volumenM3: 1 }), paquete({ volumenM3: 2 })] });
    const f = filasDeProductos([c], AHORA);
    const uno = filtrarProductos(f, { ...FILTRO_PRODUCTOS_VACIO, texto: f[0]!.paquete!.codigo });
    expect(resumenProductos(uno, AHORA).descuadre.corridas).toBe(0);
    expect(resumenProductos(f, AHORA).descuadre.corridas).toBe(0);
  });

  it("la barra de un producto suma sus especies (± redondeo de pt)", () => {
    const pila = pilaProductoEspecie(filas(), 1);
    expect(pila.hayOtras).toBe(true);
    for (const f of pila.filas) {
      const suma = Object.values(f.porEspecie).reduce((a, v) => a + v, 0) + f.otras;
      expect(Math.abs(suma - f.pt)).toBeLessThanOrEqual(2);
    }
  });

  it("las hojas del Excel cierran entre sí", () => {
    const f = filas();
    const hojas = hojasDeProductos({ filas: f, paquetes: filasALaVista(f, []), ahora: AHORA, filtros: [], alcance: null });
    expect(hojas.map((h) => h.nombre)).toEqual(["Por permiso", "Por especie", "Por producto", "Paquete por paquete", "Qué se exportó"]);
    const suma = (i: number, col: string) => r4(hojas[i]!.filas.reduce((a, x) => a + Number(x[col] ?? 0), 0));
    const paquetes = suma(3, "m³");
    for (const i of [0, 1, 2]) expect(suma(i, "m³ disponibles")).toBeCloseTo(paquetes, 3);
    expect(suma(0, "Marcado usado (m³, aparte)")).toBe(3.292);
  });

  it("el CSV sale con las columnas prendidas y su TOTAL", () => {
    const csv = csvDeProductos(filasALaVista(filas(), []), {
      presentacion: false, medidas: false, lote: false, pieTablar: true, edad: true, valor: false, permiso: true,
    });
    const [cabecera] = csv.split("\n");
    expect(cabecera).toContain("Pie tablar");
    expect(cabecera).not.toContain("Presentación");
    expect(csv).toContain("TOTAL (5 filas)");
  });

  it("el Excel baja la tabla de paquetes tal como se ve: aviso tildado y orden", () => {
    const f = filasALaVista(filas(), []);
    const vistos = paquetesComoSeVen(f, "viejos", { by: "volumen", dir: "desc" });
    expect(vistos.every((x) => x.tramo === "viejo")).toBe(true);
    const porVolumen = paquetesComoSeVen(f, null, { by: "volumen", dir: "desc" }).map((x) => x.volumenM3);
    expect(porVolumen).toEqual([...porVolumen].sort((a, b) => b - a));
    const hojas = hojasDeProductos({ filas: filas(), paquetes: vistos, ahora: AHORA, filtros: ["Paquetes: sólo «más de 90 días»"], alcance: null });
    expect(hojas[3]!.filas).toHaveLength(vistos.length);
    expect(JSON.stringify(hojas[4]!.filas)).toContain("más de 90 días");
  });

  it("los filtros se leen como frase", () => {
    expect(
      filtrosEnTexto({ ...FILTRO_PRODUCTOS_VACIO, estado: ["libre", "apartado", "usado"], tramos: ["viejo"] }).map((c) => c.texto),
    ).toEqual(["todo, con lo marcado usado", "Más de 90 días"]);
  });
});
