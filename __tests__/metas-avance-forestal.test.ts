/**
 * Avance de las metas forestales (ADR-488): conversión m³ ↔ PT con 424, lo
 * incompleto como `parcial` (nunca un 0 que parezca medido) y UNA lectura del
 * libro por ventana gracias al memo del pedido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  movimientoDelLibro: vi.fn(),
  filasPnlDelPeriodo: vi.fn(),
  cargosVentaMadera: vi.fn(),
  resumenPeriodo: vi.fn(),
  listCubicador: vi.fn(),
  cubicadoDelRango: vi.fn(),
  ctpPorUnidad: vi.fn(),
}));

vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: { movimientoDelLibro: db.movimientoDelLibro } }));
vi.mock("@/lib/db/forest-ctp-despacho.db", () => ({ ForestCtpDespachoDB: { filasPnlDelPeriodo: db.filasPnlDelPeriodo } }));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { resumenPeriodo: db.resumenPeriodo } }));
vi.mock("@/lib/db/forest-cubicaciones.db", () => ({ ForestCubicacionesDB: { list: db.listCubicador } }));
vi.mock("@/lib/db/metas-avance-forestal.db", () => ({
  MetasAvanceForestalDB: {
    cubicadoDelRango: db.cubicadoDelRango,
    ctpPorUnidad: db.ctpPorUnidad,
    cargosVentaMadera: db.cargosVentaMadera,
  },
}));

import { CALCULADORAS_FORESTALES as C } from "@/lib/metas/avance/forestal";
import { crearMemoLectura, type Calculadora } from "@/lib/metas/avance/tipos";
import { ventanaDeMeta } from "@/lib/admin/metas-periodo";

const T = "tenant-qa";
const OCTUBRE = ventanaDeMeta("mensual", "2026-10-09");
const calc = (k: keyof typeof C): Calculadora => {
  const c = C[k];
  if (!c) throw new Error(`falta la calculadora ${k}`);
  return c;
};

function movimiento(totales: Partial<Record<string, unknown>> = {}, porEspecie: unknown[] = []) {
  return {
    truncado: false,
    porEspecie,
    totales: {
      ingresoM3: 0, consumoM3: 0, producido: 0, despachado: 0, rendimiento: 0, corridasOtraUnidad: 0,
      unidadProducido: "m3", unidadDespachado: "m3", variacionPatioM3: 0, saldoPatioM3: 0,
      ...totales,
    },
  };
}

beforeEach(() => {
  for (const f of Object.values(db)) f.mockReset();
});

describe("libro CTP: ingreso, producción y despacho", () => {
  it("convierte el ingreso a PT con 424 y nombra las especies que más entraron", async () => {
    db.movimientoDelLibro.mockResolvedValue(
      movimiento({ ingresoM3: 2.5 }, [
        { especie: "Cumala", ingresoM3: 0.5, consumoM3: 0 },
        { especie: "Tornillo", ingresoM3: 2, consumoM3: 0 },
      ]),
    );
    const m3 = await calc("madera_ingresada")(T, OCTUBRE, "m³", crearMemoLectura());
    const pt = await calc("madera_ingresada")(T, OCTUBRE, "PT", crearMemoLectura());
    expect(m3.valor).toBe(2.5);
    expect(pt.valor).toBe(1060);
    expect(m3.detalle).toBe("Tornillo 2 m³ · Cumala 0,5 m³");
  });

  it("lee el libro UNA vez por ventana para ingreso, producción y despacho (y el día va en UTC)", async () => {
    db.movimientoDelLibro.mockResolvedValue(movimiento({ ingresoM3: 1, producido: 2, despachado: 3 }));
    const memo = crearMemoLectura();
    await calc("madera_ingresada")(T, OCTUBRE, "m³", memo);
    await calc("produccion")(T, OCTUBRE, "m³", memo);
    await calc("despacho")(T, OCTUBRE, "PT", memo);
    expect(db.movimientoDelLibro).toHaveBeenCalledTimes(1);
    expect(db.movimientoDelLibro).toHaveBeenCalledWith(T, {
      fromDate: new Date("2026-10-01T00:00:00.000Z"),
      toDate: new Date("2026-10-31T23:59:59.999Z"),
    });
    // Otra ventana, otra lectura.
    await calc("produccion")(T, ventanaDeMeta("anual", "2026-10-09"), "m³", memo);
    expect(db.movimientoDelLibro).toHaveBeenCalledTimes(2);
    expect(db.ctpPorUnidad).not.toHaveBeenCalled();
  });

  it("producción declarada en PT: la meta en m³ divide entre 424, sin parcial", async () => {
    db.movimientoDelLibro.mockResolvedValue(movimiento({ producido: 848, unidadProducido: "pt", corridasOtraUnidad: 2 }));
    const r = await calc("produccion")(T, OCTUBRE, "m³", crearMemoLectura());
    expect(r.valor).toBe(2);
    expect(r.parcial).toBeUndefined();
    expect(r.detalle).toBe("En el libro: 848 PT");
  });

  it("si el período mezcla unidades separa por unidad: m³ y PT suman, «unidad» va al parcial", async () => {
    db.movimientoDelLibro.mockResolvedValue(movimiento({ producido: 436, unidadProducido: null, corridasOtraUnidad: 3 }));
    db.ctpPorUnidad.mockResolvedValue([
      { section: "produccion", unidad: "m3", cantidad: 2, lineas: 3 },
      { section: "produccion", unidad: null, cantidad: 0.5, lineas: 1 },
      { section: "produccion", unidad: "PT", cantidad: 424, lineas: 1 },
      { section: "produccion", unidad: "unidad", cantidad: 10, lineas: 2 },
      { section: "despacho", unidad: "m3", cantidad: 99, lineas: 9 },
    ]);
    const r = await calc("produccion")(T, OCTUBRE, "m³", crearMemoLectura());
    expect(r.valor).toBe(3.5);
    expect(r.parcial).toBe("2 corridas en otra unidad (unidad) no suman");
    expect(r.detalle).toBe("En el libro: 2,5 m³ + 424 PT");
  });

  it("nada convertible y algo en otra unidad = sin dato, nunca 0", async () => {
    db.movimientoDelLibro.mockResolvedValue(movimiento({ despachado: 7, unidadDespachado: "unidad" }));
    db.ctpPorUnidad.mockResolvedValue([{ section: "despacho", unidad: "unidad", cantidad: 7, lineas: 1 }]);
    const r = await calc("despacho")(T, OCTUBRE, "m³", crearMemoLectura());
    expect(r.valor).toBeNull();
    expect(r.parcial).toBe("1 despacho en otra unidad (unidad) no suma");
  });

  it("una meta en una unidad que no es volumen no inventa cifra", async () => {
    const r = await calc("produccion")(T, OCTUBRE, "kg", crearMemoLectura());
    expect(r.valor).toBeNull();
    expect(db.movimientoDelLibro).not.toHaveBeenCalled();
  });
});

describe("venta de madera despachada (la cifra de «Madera vendida» de Mi Plata)", () => {
  let n = 0;
  /** Un despacho como lo decide `filasPnlDelPeriodo`; sin guía, cada uno es su propia venta. */
  const fila = (valorVenta: number | null, motivo: string, monedaVenta = "PEN", gtfSalida: string | null = null) => ({
    id: `d${++n}`, lineNo: n, producto: "Tornillo", gtfSalida, valorVenta, cogs: null, margen: null, margenPct: null,
    moneda: "PEN", motivo, monedaVenta, fecha: "2026-10-05T00:00:00.000Z",
  });
  const cargo = (monto: number, fecha: string, referencia: string | null = null) => ({
    id: `c${++n}`, parteId: "p1", parteNombre: "Maderera Ucayali", fecha: new Date(fecha), tipo: "cargo", concepto: "venta",
    monto, moneda: "PEN", referencia, ctpEntryId: null, liquidacionId: null, gtfNumber: null,
  });
  beforeEach(() => db.cargosVentaMadera.mockResolvedValue([]));

  it("suma todo despacho con precio en soles (también el sin costo) y dice los que faltan", async () => {
    db.filasPnlDelPeriodo.mockResolvedValue([
      fila(1000, "ok"),
      fila(500, "sin_costo"),
      fila(null, "sin_venta"),
      fila(null, "madera_de_servicio"),
      fila(200, "ok", "USD"),
    ]);
    const r = await calc("venta_madera")(T, OCTUBRE, "S/", crearMemoLectura());
    expect(r.valor).toBe(1500);
    expect(r.parcial).toBe("1 despacho sin precio y 1 venta en otra moneda: no suman");
    expect(r.detalle).toBe("2 ventas: S/ 1 500");
    expect(db.cargosVentaMadera).toHaveBeenCalledWith(T, "2026-10-01", "2026-10-31");
  });

  it("la madera de servicio no es venta aunque alguien le haya escrito un precio", async () => {
    db.filasPnlDelPeriodo.mockResolvedValue([fila(500, "madera_de_servicio"), fila(300, "ok")]);
    const r = await calc("venta_madera")(T, OCTUBRE, "S/", crearMemoLectura());
    expect(r).toEqual({ valor: 300, detalle: "1 venta: S/ 300" });
  });

  it("el cargo de venta de la cuenta cuenta aunque el despacho no tenga precio, y manda sobre el precio", async () => {
    db.filasPnlDelPeriodo.mockResolvedValue([
      fila(null, "sin_venta", "PEN", "019-001-0000005"),
      fila(999, "ok", "PEN", "019-001-0000006"),
    ]);
    db.cargosVentaMadera.mockResolvedValue([
      cargo(2300, "2026-10-05T00:00:00.000Z", "19-1-5"), // misma guía que el despacho sin precio
      cargo(1200, "2026-10-06T00:00:00.000Z", "019-001-0000006"), // manda sobre los 999 del despacho
      cargo(400, "2026-11-01T03:00:00.000Z"), // 22:00 del 31-10 en Lima: es de octubre
      cargo(700, "2026-11-01T00:00:00.000Z"), // día de calendario 01-11: no
    ]);
    const r = await calc("venta_madera")(T, OCTUBRE, "S/", crearMemoLectura());
    expect(r).toEqual({ valor: 3900, detalle: "3 ventas: S/ 3 900 (3 con el cargo de la cuenta del cliente)" });
  });

  it("sin ningún precio es «sin dato» con su parcial; sin despachos es 0", async () => {
    db.filasPnlDelPeriodo.mockResolvedValueOnce([fila(null, "sin_venta"), fila(null, "sin_venta")]);
    const sinPrecio = await calc("venta_madera")(T, OCTUBRE, "S/", crearMemoLectura());
    expect(sinPrecio).toEqual({ valor: null, parcial: "2 despachos sin precio: no suman" });

    db.filasPnlDelPeriodo.mockResolvedValueOnce([]);
    const vacio = await calc("venta_madera")(T, OCTUBRE, "S/", crearMemoLectura());
    expect(vacio).toEqual({ valor: 0 });
  });
});

describe("cubicación", () => {
  it("suma lotes de fórmulas mezcladas, cada uno desde su unidad", async () => {
    db.cubicadoDelRango.mockResolvedValue([
      { formula: "smalian", sentido: "compra", material: "troza", volumen: 1.5, lotes: 2 },
      { formula: "oxapampina", sentido: "compra", material: "troza", volumen: 424, lotes: 1 },
      { formula: "tablar", sentido: "venta", material: "aserrada", volumen: 212, lotes: 1 },
    ]);
    const memo = crearMemoLectura();
    const m3 = await calc("cubicacion")(T, OCTUBRE, "m³", memo);
    const pt = await calc("cubicacion")(T, OCTUBRE, "PT", memo);
    expect(m3.valor).toBe(3);
    expect(pt.valor).toBe(1272);
    expect(m3.detalle).toBe("4 lotes (1 de aserrada) · compra 2,5 m³ · venta 0,5 m³");
    expect(db.cubicadoDelRango).toHaveBeenCalledTimes(1);
    expect(db.cubicadoDelRango).toHaveBeenCalledWith(T, "2026-10-01", "2026-10-31");
  });

  it("un lote de aserrada armado desde el Cubicador de madera no se cuenta dos veces", async () => {
    db.cubicadoDelRango.mockResolvedValue([
      { formula: "smalian", sentido: "compra", material: "troza", volumen: 2, lotes: 1, deCubicador: false },
      { formula: "tablar", sentido: "venta", material: "aserrada", volumen: 424, lotes: 1, deCubicador: true },
    ]);
    const r = await calc("cubicacion")(T, OCTUBRE, "m³", crearMemoLectura());
    expect(r.valor).toBe(2);
    expect(r.detalle).toBe(
      "1 lote · compra 2 m³ · venta 0 m³ · 1 lote del Cubicador de madera ya cuenta en «Madera aserrada cubicada»",
    );
  });

  it("un lote con fórmula desconocida no suma y se dice", async () => {
    db.cubicadoDelRango.mockResolvedValue([
      { formula: "smalian", sentido: "compra", material: "troza", volumen: 1, lotes: 1 },
      { formula: "huber", sentido: "compra", material: "troza", volumen: 9, lotes: 1 },
    ]);
    const r = await calc("cubicacion")(T, OCTUBRE, "m³", crearMemoLectura());
    expect(r.valor).toBe(1);
    expect(r.parcial).toBe("1 lote con una fórmula que no se conoce no suma");
  });

  it("el Cubicador filtra por la fecha del trabajo y en PT usa el pie tablar que publica", async () => {
    db.listCubicador.mockResolvedValue([
      { fecha: "2026-10-05", createdAt: "2026-10-05T15:00:00Z", totales: { m3: 1.1792, pieTablar: 500, piezas: 20 } },
      { fecha: "2026-09-30", createdAt: "2026-10-01T15:00:00Z", totales: { m3: 9, pieTablar: 3816, piezas: 90 } },
      // Vieja sin fecha: cae en su día de guardado en Lima (31-10 a las 21:00).
      { fecha: "", createdAt: "2026-11-01T02:00:00Z", totales: { m3: 0.5, pieTablar: 212, piezas: 4 } },
      // Sin ninguna fecha: no se cuela en «hoy».
      { totales: { m3: 7, pieTablar: 2968, piezas: 70 } },
    ]);
    const memo = crearMemoLectura();
    const pt = await calc("cubicador")(T, OCTUBRE, "PT", memo);
    const m3 = await calc("cubicador")(T, OCTUBRE, "m³", memo);
    expect(pt.valor).toBe(712);
    expect(m3.valor).toBe(1.6792);
    expect(pt.detalle).toBe("2 cubicaciones · 24 piezas");
    expect(db.listCubicador).toHaveBeenCalledTimes(1);
  });
});

describe("Libro TH", () => {
  it("tala y trozado comparten una lectura por ventana", async () => {
    db.resumenPeriodo.mockResolvedValue({ lineasCount: 5, taladoM3: 12.5, trozadoM3: 10 });
    const memo = crearMemoLectura();
    const tala = await calc("loth_tala")(T, OCTUBRE, "m³", memo);
    const trozado = await calc("loth_trozado")(T, OCTUBRE, "m³", memo);
    expect(tala).toEqual({ valor: 12.5, detalle: "Trozado del mismo período: 10 m³" });
    expect(trozado.valor).toBe(10);
    expect(db.resumenPeriodo).toHaveBeenCalledTimes(1);
  });
});
