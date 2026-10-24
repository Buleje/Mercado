import { describe, expect, it } from "vitest";
import { evaluarProveedor, MINIMO_PARA_EVALUAR, periodoValido, type OrdenParaEvaluar } from "@/lib/compras/evaluacion-proveedor";
import { compararPrecios, costoPuesto, type LineaDeCompra } from "@/lib/compras/precio-comparable";
import { resumirFicha, comprobanteDeOrden, type OrdenDeFicha } from "@/lib/compras/ficha-proveedor";

const HOY = "2026-10-17";

const orden = (o: Partial<OrdenParaEvaluar> & { id: string }): OrdenParaEvaluar => ({
  estado: "recibido",
  creada: "2026-09-01",
  prometida: null,
  recibida: null,
  items: [],
  ...o,
});

/** C36: período, muestra y fórmula; sin datos sigue sin evaluar. */
describe("evaluarProveedor", () => {
  it("una orden sin fecha prometida no cuenta como puntual", () => {
    const ev = evaluarProveedor(
      [
        orden({ id: "1", recibida: "2026-09-03" }),
        orden({ id: "2", creada: "2026-09-05", prometida: "2026-09-06", recibida: "2026-09-06" }),
      ],
      { hoy: HOY, meses: 12 },
    );
    expect(ev.muestra.sinFechaPrometida).toBe(1);
    expect(ev.muestra.aTiempo).toBe(1);
    const puntualidad = ev.metricas.find((m) => m.clave === "puntualidad");
    expect(puntualidad?.valor).toBe(100); // 1 de 1 con fecha; la otra no entra
  });

  it("menos del mínimo que llegaron = sin evaluar", () => {
    const ev = evaluarProveedor([orden({ id: "1", recibida: "2026-09-02" }), orden({ id: "2", recibida: "2026-09-02" })], { hoy: HOY, meses: 12 });
    expect(MINIMO_PARA_EVALUAR).toBe(3);
    expect(ev.puntaje).toBeNull();
    expect(ev.nota).toBeNull();
  });

  it("las anuladas no cuentan y una pendiente con el día vencido está atrasada", () => {
    const ev = evaluarProveedor(
      [
        orden({ id: "1", estado: "cancelado" }),
        orden({ id: "2", estado: "pendiente", prometida: "2026-10-10" }),
        orden({ id: "3", estado: "pendiente", prometida: "2026-10-20" }),
      ],
      { hoy: HOY, meses: 12 },
    );
    expect(ev.muestra).toMatchObject({ ordenes: 2, anuladas: 1, pendientes: 2, atrasadas: 1, aTiempo: 0 });
  });

  it("el período deja afuera lo de antes y sólo acepta 3, 6 o 12 meses", () => {
    const ev = evaluarProveedor([orden({ id: "viejo", creada: "2026-01-02" }), orden({ id: "nuevo", creada: "2026-09-02" })], { hoy: HOY, meses: 3 });
    expect(ev.periodo.desde).toBe("2026-07-17");
    expect(ev.muestra.ordenes).toBe(1);
    expect(periodoValido("6")).toBe(6);
    expect(periodoValido("7")).toBe(12);
  });

  it("parcial cuenta como llegó pero no como completa", () => {
    const ev = evaluarProveedor(
      [
        orden({ id: "1", recibida: "2026-09-02" }),
        orden({ id: "2", recibida: "2026-09-02" }),
        orden({ id: "3", estado: "parcial", recibida: "2026-09-02" }),
      ],
      { hoy: HOY, meses: 12 },
    );
    expect(ev.muestra).toMatchObject({ llegaron: 3, completas: 2, parciales: 1 });
    expect(ev.puntaje).not.toBeNull();
  });
});

const linea = (l: Partial<LineaDeCompra> & { supplierId: string; ordenId: string }): LineaDeCompra => ({
  supplierName: l.supplierId.toUpperCase(),
  estado: "recibido",
  creada: "2026-10-01",
  recibida: "2026-10-02",
  unidad: "saco",
  cantidad: 1,
  costoUnitario: 100,
  orden: { subtotal: 100, descuentoPct: 0, igvIncluido: true, flete: 0, otros: 0 },
  ...l,
});

/** C37: el mismo alcance (unidad, flete, descuento, IGV) antes de decir «el mejor». */
describe("compararPrecios", () => {
  it("costo puesto: descuento, IGV si se cargó sin IGV y flete repartido por valor", () => {
    const r = costoPuesto({ costoUnitario: 100, orden: { subtotal: 200, descuentoPct: 10, igvIncluido: false, flete: 10, otros: 0 } });
    // 100 × 0,9 × 1,18 = 106,2 + 10 × 100/200 = 5 → 111,2
    expect(r.costo).toBe(111.2);
    expect(r.ajustes).toHaveLength(3);
  });

  it("no mezcla unidades: un kilo no compite con un saco", () => {
    const filas = compararPrecios(
      [linea({ supplierId: "a", ordenId: "1", unidad: "saco", costoUnitario: 100 }), linea({ supplierId: "b", ordenId: "2", unidad: "kg", costoUnitario: 2 })],
      HOY,
    );
    expect(filas.every((f) => !f.mejor)).toBe(true);
    expect(filas.every((f) => f.sobreElMejor === null)).toBe(true);
  });

  it("el mejor es por costo puesto, un precio cero no gana y las anuladas no entran", () => {
    const filas = compararPrecios(
      [
        linea({ supplierId: "a", ordenId: "1", costoUnitario: 100 }),
        linea({ supplierId: "b", ordenId: "2", costoUnitario: 95, orden: { subtotal: 95, descuentoPct: 0, igvIncluido: true, flete: 10, otros: 0 } }),
        linea({ supplierId: "c", ordenId: "3", costoUnitario: 0 }),
        linea({ supplierId: "d", ordenId: "4", costoUnitario: 50, estado: "cancelado" }),
      ],
      HOY,
    );
    expect(filas.find((f) => f.supplierId === "d")).toBeUndefined();
    expect(filas.find((f) => f.mejor)?.supplierId).toBe("a"); // b sale 105 con el flete
    expect(filas.find((f) => f.supplierId === "b")?.sobreElMejor).toBe(5);
    expect(filas.find((f) => f.supplierId === "c")?.mejor).toBe(false);
  });

  it("lo que llegó gana sobre lo sólo pedido aunque lo pedido sea más nuevo", () => {
    const [f] = compararPrecios(
      [
        linea({ supplierId: "a", ordenId: "1", costoUnitario: 100, creada: "2026-09-01", recibida: "2026-09-02" }),
        linea({ supplierId: "a", ordenId: "2", costoUnitario: 80, estado: "pendiente", creada: "2026-10-10", recibida: null }),
      ],
      HOY,
    );
    expect(f).toMatchObject({ ordenId: "1", llego: true, compras: 2, costoPuesto: 100 });
  });
});

const ordenFicha = (o: Partial<OrdenDeFicha> & { id: string }): OrdenDeFicha => ({
  estado: "recibido", total: 100, creada: "2026-09-01", prometida: null, recibida: null, comprobante: null, ...o,
});

/** C39: lo que se ve del proveedor en su ficha. */
describe("resumirFicha", () => {
  it("en camino incluye las que llegaron a medias; vencido sólo lo que pasó su día", () => {
    const r = resumirFicha(
      {
        ordenes: [
          ordenFicha({ id: "1" }),
          ordenFicha({ id: "2", estado: "parcial", total: 50 }),
          ordenFicha({ id: "3", estado: "pendiente" }),
          ordenFicha({ id: "4", estado: "cancelado", creada: "2026-10-15" }),
        ],
        cuentas: [
          { id: "c1", ordenId: "1", descripcion: "OC", monto: 100, pagado: 40, saldo: 60, estado: "pendiente", vence: "2026-10-01" },
          { id: "c2", ordenId: "2", descripcion: "OC", monto: 50, pagado: 0, saldo: 50, estado: "pendiente", vence: "2026-10-30" },
          { id: "c3", ordenId: null, descripcion: "Vieja", monto: 20, pagado: 20, saldo: 0, estado: "pagado", vence: "2026-08-01" },
        ],
        devoluciones: [
          { id: "d1", motivo: "Vencido", estado: "PENDIENTE", creada: "2026-10-01", items: 2, monto: 30 },
          { id: "d2", motivo: "Roto", estado: "RESUELTA", creada: "2026-09-01", items: 1, monto: 10 },
          { id: "d3", motivo: "Sin costo", estado: "ENVIADA", creada: "2026-10-02", items: 1, monto: null },
        ],
      },
      HOY,
    );
    expect(r).toMatchObject({
      saldo: 110, vencido: 60, cuentasAbiertas: 2,
      enCamino: 2, ordenesEnElAnio: 2, compradoEnElAnio: 150,
      ultimaCompra: "2026-09-01",
      devolucionesAbiertas: 2, montoDevolucionesAbiertas: 30,
    });
  });

  it("comprobante con su tipo, o nada si no se anotó número", () => {
    expect(comprobanteDeOrden("factura", "F001-123")).toBe("Factura F001-123");
    expect(comprobanteDeOrden("factura", " ")).toBeNull();
  });
});
