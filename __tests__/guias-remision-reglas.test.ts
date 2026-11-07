/**
 * Reglas de «Nueva guía de remisión» (auditoría de comprobantes p3, 17-10):
 * unidades, precarga desde el pedido, lo que falta por etapa, avisos, cuerpo
 * del POST, datos frecuentes y mensajes de error.
 */
import { describe, expect, it } from "vitest";
import {
  avisosDe, comprobanteDeFilas, cuerpoGuia, datosFrecuentes, formConPedido, formNuevo, guiaPreviaDelPedido,
  itemsDelPedido, limpiarDireccion, mensajeDeError, pendientesDe, pesoEstimado, resumenGuia, tieneDatos,
  type PedidoVinculado,
} from "@/components/admin/guias-remision/guia-reglas";
import { normalizarUnidad, unidadConCodigo, unidadLegible } from "@/components/admin/guias-remision/guia-unidades";
import { emptyItem, type DraftItem, type FormGuia, type GuiaRemision } from "@/components/admin/guias-remision/tipos";

const AHORA = new Date("2026-10-17T10:00:00");
const PEDIDO: PedidoVinculado = { id: "cmabc123456", codigo: "#123456", cliente: "Rosa", total: 45, referencia: "", comprobante: null };

function listo(over: Partial<FormGuia> = {}): FormGuia {
  return {
    ...formNuevo("Jr. Tarapacá 244", AHORA),
    fuente: "sin-pedido",
    motivoTraslado: "TRASLADO ENTRE ALMACENES",
    destinatarioNombre: "Tienda Yarinacocha",
    destinatarioDireccion: "Av. Yarinacocha 120",
    puntoLlegada: "Av. Yarinacocha 120",
    vehiculoPlaca: "ABC-123",
    conductorNombre: "Juan",
    conductorDni: "44556677",
    ...over,
  };
}
const ITEMS: DraftItem[] = [{ descripcion: "Arroz", cantidad: "20", unidad: "BG", pesoUnitario: "50" }];

function guia(over: Partial<GuiaRemision>): GuiaRemision {
  return {
    id: "g", numero: "T001-0001", tenantId: "t", fechaTraslado: "", motivoTraslado: "VENTA", destinatarioNombre: "", destinatarioDireccion: "",
    puntoPartida: "", puntoLlegada: "", status: "EMITIDA", items: [], createdBy: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "", ...over,
  };
}

describe("unidades", () => {
  it("convierte lo del pedido al código SUNAT y avisa lo que no reconoce", () => {
    expect(normalizarUnidad("kg")).toEqual({ codigo: "KGM", exacta: true });
    expect(normalizarUnidad("Botella")).toEqual({ codigo: "BO", exacta: true });
    expect(normalizarUnidad("und")).toEqual({ codigo: "NIU", exacta: true });
    expect(normalizarUnidad("porción")).toEqual({ codigo: "NIU", exacta: false });
    expect(normalizarUnidad("")).toEqual({ codigo: "NIU", exacta: true });
  });
  it("se lee por nombre", () => {
    expect(unidadLegible("KGM")).toBe("Kilogramo");
    expect(unidadConCodigo("niu")).toBe("Unidad (NIU)");
    expect(unidadLegible("ZZ")).toBe("ZZ");
  });
});

describe("precarga desde el pedido", () => {
  const orden = {
    id: "cmabc123456",
    total: 45,
    customer: { name: "Rosa", location: "Jr. Tarapacá 244, GPS: -8.38006, -74.53553", reference: "frente al mercado" },
    items: [
      { id: 12, name: "Arroz", quantity: 2, unit: "kg" },
      { id: 0, name: "Pollo", quantity: 1, unit: "porción" },
      { id: 5, name: "", quantity: 1, unit: "und" },
    ],
  };

  it("quita las coordenadas de la dirección", () => {
    expect(limpiarDireccion("Jr. Tarapacá 244, GPS: -8.38, -74.53")).toBe("Jr. Tarapacá 244");
    expect(limpiarDireccion("Av. Centenario 5")).toBe("Av. Centenario 5");
  });

  it("llena quién recibe, la llegada con la referencia, el motivo y el comprobante", () => {
    const f = formConPedido(formNuevo("Partida", AHORA), orden, { numero: "B001-12", ruc: "44556677" });
    expect(f.destinatarioNombre).toBe("Rosa");
    expect(f.destinatarioDireccion).toBe("Jr. Tarapacá 244");
    expect(f.puntoLlegada).toBe("Jr. Tarapacá 244 · Ref.: frente al mercado");
    expect(f.destinatarioRuc).toBe("44556677");
    expect(f.documentoRef).toBe("B001-12");
    expect(f.motivoTraslado).toBe("VENTA");
    expect(f.puntoPartida).toBe("Partida");
  });

  it("los ítems llevan su unidad SUNAT y marcan la que no tiene", () => {
    const it = itemsDelPedido(orden);
    expect(it).toHaveLength(2);
    expect(it[0]).toMatchObject({ descripcion: "Arroz", cantidad: "2", unidad: "KGM", productoId: "12" });
    expect(it[0].unidadOrigen).toBeUndefined();
    expect(it[1]).toMatchObject({ unidad: "NIU", unidadOrigen: "porción" });
    expect(it[1].productoId).toBeUndefined();
  });

  it("el comprobante vivo del pedido, sin anulados ni notas", () => {
    const resp = {
      data: [
        { orderId: "x", type: "boleta", series: "B001", number: "1", sunatStatus: "accepted" },
        { orderId: "o1", type: "nota_credito", series: "BC01", number: "2", sunatStatus: "accepted" },
        { orderId: "o1", type: "factura", series: "F001", number: "3", sunatStatus: "voided" },
        { orderId: "o1", type: "factura", series: "F001", number: "4", sunatStatus: "pending", customerRuc: "20601234567" },
      ],
    };
    expect(comprobanteDeFilas(resp, "o1")).toEqual({ numero: "F001-4", ruc: "20601234567" });
    expect(comprobanteDeFilas(resp, "nada")).toBeNull();
    expect(comprobanteDeFilas({ error: "x" }, "o1")).toBeNull();
  });
});

describe("lo que falta por etapa", () => {
  it("una guía completa no tiene pendientes", () => {
    expect(pendientesDe(listo(), ITEMS, null)).toEqual([]);
  });

  it("de un pedido sin elegirlo, falta el pedido", () => {
    expect(pendientesDe(listo({ fuente: "pedido" }), ITEMS, null).map((p) => p.paso)).toEqual(["origen"]);
    expect(pendientesDe(listo({ fuente: "pedido" }), ITEMS, PEDIDO)).toEqual([]);
  });

  it("cada falta va a su etapa y su campo", () => {
    const p = pendientesDe(listo({ motivoTraslado: "", destinatarioDireccion: "", destinatarioRuc: "123", conductorDni: "12" }), [emptyItem()], null);
    expect(p.map((x) => [x.paso, x.campo])).toEqual([
      ["origen", "motivoTraslado"],
      ["destino", "destinatarioRuc"],
      ["destino", "destinatarioDireccion"],
      ["transporte", "conductorDni"],
      ["carga", undefined],
    ]);
  });

  it("en público el RUC del transportista tiene 11 números", () => {
    expect(pendientesDe(listo({ modalidad: "publico", transportistaRuc: "2060" }), ITEMS, null).map((p) => p.campo)).toEqual(["transportistaRuc"]);
  });

  it("un ítem con descripción y sin cantidad no pasa", () => {
    const p = pendientesDe(listo(), [...ITEMS, { ...emptyItem(), descripcion: "Azúcar", cantidad: "0" }], null);
    expect(p.map((x) => x.texto)).toEqual(["«Azúcar» no tiene cantidad"]);
  });
});

describe("avisos (no bloquean)", () => {
  it("sin nada raro, no avisa", () => {
    expect(avisosDe(listo(), ITEMS, null, null, AHORA)).toEqual([]);
  });

  it("pedido con guía, venta sin comprobante, fecha pasada, partida = llegada, sin placa", () => {
    const pedido = avisosDe(listo({ fuente: "pedido", motivoTraslado: "DEVOLUCION" }), ITEMS, PEDIDO, { numero: "T001-0002", estado: "emitida" }, AHORA);
    expect(pedido.map((a) => a.paso)).toEqual(["origen", "origen"]);
    const otros = avisosDe(
      listo({ motivoTraslado: "VENTA", fechaTraslado: "2026-10-10T08:00", puntoPartida: "Av. Yarinacocha 120", vehiculoPlaca: "" }),
      ITEMS, null, null, AHORA,
    );
    expect(otros.map((a) => a.paso)).toEqual(["origen", "origen", "destino", "transporte"]);
  });

  it("peso: ítems sin peso y bruto lejos del estimado", () => {
    const items = [...ITEMS, { ...emptyItem(), descripcion: "Fideos", unidadOrigen: "porción" }];
    expect(pesoEstimado(items)).toEqual({ kg: 1000, sinPeso: 1 });
    const a = avisosDe(listo({ pesoBruto: "1500" }), items, null, null, AHORA).map((x) => x.texto);
    expect(a.some((t) => t.includes("sin peso"))).toBe(true);
    expect(a.some((t) => t.includes("se aleja del estimado"))).toBe(true);
    expect(a.some((t) => t.includes("unidad SUNAT"))).toBe(true);
    expect(avisosDe(listo({ pesoBruto: "1012" }), ITEMS, null, null, AHORA)).toEqual([]);
  });
});

describe("el POST", () => {
  it("privado no manda empresa; público sí; el pedido viaja por su id", () => {
    const priv = cuerpoGuia(listo({ fuente: "pedido", transportistaNombre: "Fantasma", transportistaRuc: "20601234567" }), ITEMS, PEDIDO);
    expect(priv.orderId).toBe("cmabc123456");
    expect(priv.transportistaNombre).toBeUndefined();
    expect(priv.transportistaRuc).toBeUndefined();
    expect(priv.items).toEqual([{ descripcion: "Arroz", cantidad: 20, unidad: "BG", pesoUnitario: 50, productoId: undefined }]);
    const pub = cuerpoGuia(listo({ modalidad: "publico", transportistaNombre: "Transportes Ucayali", transportistaRuc: "20601234567" }), ITEMS, PEDIDO);
    expect(pub.orderId).toBeUndefined();
    expect(pub.transportistaRuc).toBe("20601234567");
  });

  it("los errores se dicen con su causa", () => {
    expect(mensajeDeError(400, { error: { destinatarioDireccion: ["Required"] } })).toBe("Revisa: dirección de quien recibe.");
    expect(mensajeDeError(404, {})).toMatch(/pedido no está en este negocio/);
    expect(mensajeDeError(403, {})).toMatch(/no puede crear guías/);
    expect(mensajeDeError(null, null)).toMatch(/revisa la lista antes de reintentar/);
    expect(mensajeDeError(503, { error: "Database error" })).toBe("No se pudo crear la guía. Vuelve a intentar en un momento.");
  });
});

describe("frecuentes, guía previa, borrador y resumen", () => {
  const guias = [
    guia({ id: "1", puntoPartida: "Almacén", destinatarioNombre: "Rosa", puntoLlegada: "Jr. A", vehiculoPlaca: "ABC-123", conductorNombre: "Juan", createdAt: "2026-10-01T00:00:00Z" }),
    guia({ id: "2", puntoPartida: "almacén ", destinatarioNombre: "Rosa", puntoLlegada: "Jr. A", vehiculoPlaca: "ABC-123", conductorNombre: "Juan", createdAt: "2026-10-02T00:00:00Z", orderId: "o1" }),
    guia({ id: "3", puntoPartida: "Tienda", destinatarioNombre: "Pedro", puntoLlegada: "Jr. B", transportistaRuc: "20601234567", transportistaNombre: "Ucayali", createdAt: "2026-10-03T00:00:00Z" }),
    guia({ id: "4", puntoPartida: "Anulada", destinatarioNombre: "Nadie", status: "ANULADA", orderId: "o2" }),
  ];

  it("ordena por uso y deja fuera las anuladas", () => {
    const f = datosFrecuentes(guias);
    expect(f.partidas).toEqual(["Almacén", "Tienda"]);
    expect(f.destinos.map((d) => d.nombre)).toEqual(["Rosa", "Pedro"]);
    expect(f.transportes.map((t) => t.modalidad)).toEqual(["privado", "publico"]);
  });

  it("la guía previa del pedido ignora las anuladas", () => {
    expect(guiaPreviaDelPedido(guias, "o1")).toEqual({ numero: "T001-0001", estado: "emitida" });
    expect(guiaPreviaDelPedido(guias, "o2")).toBeNull();
  });

  it("partida y fecha solas no son borrador", () => {
    expect(tieneDatos(formNuevo("Almacén", AHORA), [emptyItem()], null)).toBe(false);
    expect(tieneDatos(formNuevo("Almacén", AHORA), ITEMS, null)).toBe(true);
  });

  it("el resumen dice pedido, llegada, placa, ítems y peso", () => {
    expect(resumenGuia(listo({ fuente: "pedido", puntoLlegada: "Jr. A · Ref.: mercado" }), ITEMS, PEDIDO)).toEqual(["#123456 · Rosa", "→ Jr. A", "ABC-123", "1 ítem", "1000 kg estimados"]);
  });
});
