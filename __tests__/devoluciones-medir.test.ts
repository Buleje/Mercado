/**
 * Devoluciones a proveedor — lo que calcula la pantalla (auditoría Compras,
 * 17-10):
 * - C51: sin costo es «Pendiente de valoración», nunca «S/ 0»;
 * - C56: la recuperación por proveedor no suma lo que no tiene costo y no
 *   cuenta las anuladas en ningún denominador;
 * - C49: la vista previa del tope calza con la regla del servidor.
 */
import { describe, it, expect } from "vitest";
import { medirDevoluciones } from "@/components/admin/devoluciones-proveedor/medir-devoluciones";
import { revisarContraOrigen, costoSugerido } from "@/components/admin/devoluciones-proveedor/origen-devolucion";
import { etiquetaValor, montoPorReclamar, proximoPaso, stockFuera, type Devolucion } from "@/components/admin/devoluciones-proveedor/tipos";

let n = 0;
function dev(over: Partial<Devolucion> = {}): Devolucion {
  n++;
  return {
    id: `d${n}`,
    createdAt: "2026-10-01T15:00:00.000Z",
    updatedAt: "2026-10-01T15:00:00.000Z",
    proveedorNombre: "Alicorp",
    motivo: "Producto vencido",
    estado: "PENDIENTE",
    items: [{ nombre: "Aceite", cantidad: 2, unidad: "und", productId: 1, precioUnitario: "10.00" }],
    ...over,
  };
}
const SIN_COSTO = [{ nombre: "Fideos", cantidad: 5, unidad: "und", productId: 2, precioUnitario: null }];

describe("etiquetaValor (C51)", () => {
  it("todo sin costo es «Pendiente de valoración», no S/ 0", () => {
    expect(etiquetaValor(SIN_COSTO)).toEqual({ texto: "Pendiente de valoración", sinPrecio: 1, pendiente: true });
  });

  it("con costo parcial muestra lo valorado y cuenta lo que falta", () => {
    const e = etiquetaValor([...dev().items, ...SIN_COSTO]);
    expect(e.pendiente).toBe(false);
    expect(e.sinPrecio).toBe(1);
    expect(e.texto).toMatch(/20/);
  });

  it("el Decimal que llega como texto se suma como número", () => {
    expect(etiquetaValor([{ nombre: "x", cantidad: 3, unidad: "und", precioUnitario: "1.50" }]).texto).toMatch(/4[.,]50/);
  });
});

describe("medirDevoluciones (C56)", () => {
  const lista = [
    dev({ estado: "RESUELTA", updatedAt: "2026-10-05T15:00:00.000Z" }), // 4 días, S/ 20
    dev({ estado: "ENVIADA" }), // S/ 20 por recuperar
    dev({ estado: "RESUELTA", items: SIN_COSTO, motivo: "Producto dañado", updatedAt: "2026-10-03T15:00:00.000Z" }), // 2 días, sin costo
    dev({ estado: "ANULADA" }), // no cuenta en nada
    dev({ proveedorNombre: "Gloria", motivo: "Producto dañado" }),
  ];
  const m = medirDevoluciones(lista);
  const alicorp = m.porProveedor.find((p) => p.proveedor === "Alicorp")!;

  it("el denominador excluye las anuladas y se dicen aparte", () => {
    expect(alicorp.n).toBe(3);
    expect(m.anuladas).toBe(1);
    expect(m.total.n).toBe(4);
  });

  it("lo pendiente de valoración no se suma como plata recuperada", () => {
    expect(alicorp.solicitado).toBe(40);
    expect(alicorp.recuperado).toBe(20);
    expect(alicorp.sinValorar).toBe(1);
    expect(alicorp.resueltas).toBe(2);
  });

  it("días a resolver = promedio sólo de las resueltas", () => {
    expect(alicorp.diasParaResolver).toBe(3);
    expect(m.porProveedor.find((p) => p.proveedor === "Gloria")!.diasParaResolver).toBeNull();
  });

  it("reincide cuando el mismo motivo se repite 2 o más veces", () => {
    expect(alicorp.motivo).toEqual({ texto: "Producto vencido", veces: 2 });
    expect(alicorp.reincide).toBe(true);
    expect(m.porProveedor.find((p) => p.proveedor === "Gloria")!.reincide).toBe(false);
  });

  it("los proveedores salen ordenados por cantidad de devoluciones", () => {
    expect(m.porProveedor.map((p) => p.proveedor)).toEqual(["Alicorp", "Gloria"]);
  });

  it("por reclamar no suma resueltas ni anuladas", () => {
    expect(montoPorReclamar(lista)).toEqual({ total: 40, sinPrecio: 0 }); // la ENVIADA y la de Gloria
  });
});

describe("estado ANULADA en la fila", () => {
  it("con la mercadería afuera pide «Volvió al almacén»", () => {
    const d = dev({ estado: "ANULADA", stockAplicadoAt: "2026-10-02T15:00:00.000Z" });
    expect(stockFuera(d)).toBe(true);
    expect(proximoPaso(d)).toMatch(/Volvió al almacén/);
  });

  it("una enviada viva no está «fuera» por anulación", () => {
    expect(stockFuera(dev({ estado: "ENVIADA", stockAplicadoAt: "2026-10-02T15:00:00.000Z" }))).toBe(false);
  });
});

describe("vista previa del tope (C49) — espejo del servidor", () => {
  const porProducto = {
    "1": { recibido: 10, devuelto: 7, retornable: 3, ultimoCosto: { costo: 9.5, fecha: "2026-10-06T00:00:00.000Z", ordenId: "oc-b", codigo: "OC-B" } },
  };
  const orden = { ordenId: "oc-b", codigo: "OC-B", fecha: "2026-10-06T00:00:00.000Z", lineas: [{ productId: 1, nombre: "Aceite", unidad: "und", costo: 9.8, llegaron: 2, puedesDevolver: 2 }] };
  const aceite = (cantidad: number) => ({ nombre: "Aceite", cantidad, unidad: "und", productId: 1 });

  it("tope = recibido − devuelto; dos renglones del mismo producto se suman", () => {
    const r = revisarContraOrigen([aceite(2), aceite(2)], porProducto, undefined);
    expect(r.tope.get(1)).toBe(3);
    expect(r.excede).toHaveLength(1);
  });

  it("con orden de origen manda lo que llegó en ella", () => {
    expect(revisarContraOrigen([aceite(3)], porProducto, orden).excede).toHaveLength(1);
    expect(revisarContraOrigen([aceite(2)], porProducto, orden).excede).toHaveLength(0);
  });

  it("producto que nunca entró de ese proveedor pide motivo", () => {
    const r = revisarContraOrigen([{ nombre: "Leche", cantidad: 1, unidad: "und", productId: 9 }], porProducto, undefined);
    expect(r.sinRecepcion).toEqual(["Leche"]);
  });

  it("costo sugerido: orden de origen → última compra → lo que había", () => {
    expect(costoSugerido(aceite(1), porProducto, orden)).toBe(9.8);
    expect(costoSugerido(aceite(1), porProducto, undefined)).toBe(9.5);
    expect(costoSugerido({ ...aceite(1), productId: 9, precioUnitario: 4 }, porProducto, undefined)).toBe(4);
  });
});
