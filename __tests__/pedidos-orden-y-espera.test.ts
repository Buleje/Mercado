/**
 * Pedidos › cuánto lleva cada pedido en su paso (`tiempo-en-estado.ts`) y el
 * orden de la Lista (`orden-pedidos.ts`), 10-10. Antes la tarjeta decía «+2h
 * sin avanzar» a un pedido de 177 días; ahora se dice y se ordena el real.
 */
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nombreDelPago } from "@/components/admin/OrdersTab/types";
import { OrdersPrintPreview } from "@/components/admin/OrdersTab/OrdersPrintPreview";
import type { DbOrder } from "@/lib/jsondb";
import {
  cifrasDeEspera,
  masEsperaPrimero,
  msEnEstado,
  nivelDeEspera,
  textoDeEspera,
  UNA_HORA,
} from "@/components/admin/OrdersTab/tiempo-en-estado";
import {
  ordenarPedidos,
  siguienteOrden,
  ORDEN_INICIAL,
} from "@/components/admin/OrdersTab/orden-pedidos";

const AHORA = Date.parse("2026-10-10T15:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

function pedido(id: string, extra: Partial<DbOrder> = {}): DbOrder {
  return {
    id,
    customer: { name: id, phone: "900000000", location: "", reference: "" },
    items: [],
    total: 10,
    status: "pendiente",
    createdAt: hace(10 * UNA_HORA),
    updatedAt: hace(10 * UNA_HORA),
    ...extra,
  } as DbOrder;
}

describe("tiempo en su paso", () => {
  it("mide desde updatedAt (el último paso), no desde que se creó", () => {
    const p = pedido("a", { createdAt: hace(100 * UNA_HORA), updatedAt: hace(30 * 60_000) });
    expect(msEnEstado(p, AHORA)).toBe(30 * 60_000);
    expect(nivelDeEspera(msEnEstado(p, AHORA))).toBe("al-dia");
  });

  it("cortes de 1 h (aviso) y 2 h (tarde), los mismos del tablero de antes", () => {
    expect(nivelDeEspera(UNA_HORA - 1)).toBe("al-dia");
    expect(nivelDeEspera(UNA_HORA)).toBe("aviso");
    expect(nivelDeEspera(2 * UNA_HORA)).toBe("tarde");
  });

  it("dice el tiempo real, en la unidad que se lee", () => {
    expect(textoDeEspera(20_000)).toBe("recién");
    expect(textoDeEspera(40 * 60_000)).toBe("40 min");
    expect(textoDeEspera(3 * UNA_HORA)).toBe("3 h");
    expect(textoDeEspera(24 * UNA_HORA)).toBe("1 día");
    expect(textoDeEspera(177 * 24 * UNA_HORA)).toBe("5 meses");
    expect(textoDeEspera(45 * 24 * UNA_HORA)).toBe("45 días");
  });

  it("un reloj adelantado no da tiempos negativos", () => {
    expect(
      msEnEstado(pedido("a", { updatedAt: new Date(AHORA + 60_000).toISOString() }), AHORA),
    ).toBe(0);
  });

  it("cuenta los que no avanzan y encuentra al que más espera", () => {
    const pedidos = [
      pedido("nuevo", { updatedAt: hace(5 * 60_000) }),
      pedido("viejo", { updatedAt: hace(50 * UNA_HORA) }),
      pedido("medio", { updatedAt: hace(90 * 60_000) }),
    ];
    const c = cifrasDeEspera(pedidos, AHORA);
    expect(c.sinAvanzar).toBe(2);
    expect(c.elQueMasEspera?.pedido.id).toBe("viejo");
    expect(cifrasDeEspera([], AHORA)).toEqual({ sinAvanzar: 0, elQueMasEspera: null });
  });

  it("en la columna del tablero va primero el que más espera", () => {
    const orden = [
      pedido("b", { updatedAt: hace(1000) }),
      pedido("a", { updatedAt: hace(9000) }),
    ].sort(masEsperaPrimero);
    expect(orden.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("orden de la Lista", () => {
  const lista = [
    pedido("Carla", {
      status: "preparando",
      total: 30,
      createdAt: hace(3 * UNA_HORA),
      updatedAt: hace(1 * UNA_HORA),
    }),
    pedido("ana", {
      status: "pendiente",
      total: 5,
      createdAt: hace(1 * UNA_HORA),
      updatedAt: hace(1 * UNA_HORA),
    }),
    pedido("Beto", {
      status: "confirmado",
      total: 12,
      createdAt: hace(2 * UNA_HORA),
      updatedAt: hace(5 * UNA_HORA),
    }),
  ];
  const ids = (o: Parameters<typeof ordenarPedidos>[1]) =>
    ordenarPedidos(lista, o).map((p) => p.id);

  it("de entrada: lo más nuevo arriba", () => {
    expect(ids(ORDEN_INICIAL)).toEqual(["ana", "Beto", "Carla"]);
  });

  it("por cliente sin importar mayúsculas, por estado en el orden del pedido, por total", () => {
    expect(ids({ columna: "cliente", sentido: "asc" })).toEqual(["ana", "Beto", "Carla"]);
    expect(ids({ columna: "estado", sentido: "asc" })).toEqual(["ana", "Beto", "Carla"]);
    expect(ids({ columna: "total", sentido: "desc" })).toEqual(["Carla", "Beto", "ana"]);
  });

  it("«Sin avanzar» de más a menos pone primero al que más espera; los empates quedan como llegaron", () => {
    expect(ids({ columna: "espera", sentido: "desc" })).toEqual(["Beto", "Carla", "ana"]);
  });

  it("tocar la misma cabeza da vuelta el sentido; otra arranca en su sentido útil", () => {
    expect(siguienteOrden(ORDEN_INICIAL, "fecha")).toEqual({ columna: "fecha", sentido: "asc" });
    expect(siguienteOrden(ORDEN_INICIAL, "espera")).toEqual({ columna: "espera", sentido: "desc" });
    expect(siguienteOrden(ORDEN_INICIAL, "cliente")).toEqual({
      columna: "cliente",
      sentido: "asc",
    });
  });

  it("no toca la lista que recibe", () => {
    const copia = [...lista];
    ordenarPedidos(lista, { columna: "total", sentido: "asc" });
    expect(lista).toEqual(copia);
  });
});

describe("nombre del medio de pago", () => {
  it("dice cada medio como es, no «Efectivo» para todo", () => {
    expect(nombreDelPago("cash")).toBe("Efectivo");
    expect(nombreDelPago("plin")).toBe("Plin");
    expect(nombreDelPago("marketplace")).toBe("Marketplace");
    expect(nombreDelPago(null)).toBe("");
  });

  it("la vista de impresión imprime «Plin» para un pedido Plin", () => {
    const o = pedido("P1", { paymentMethod: "plin" } as Partial<DbOrder>);
    // La vista previa es un AdminModal (portal de Radix): el HTML estático del
    // servidor no lo pinta, así que se monta en el DOM y se lee el <body>.
    const { unmount } = render(
      createElement(OrdersPrintPreview, {
        orders: [o],
        selectedOrderIds: new Set(["P1"]),
        storeName: "Tienda",
        driverColor: () => "",
        onClose: () => {},
      }),
    );
    const texto = document.body.textContent ?? "";
    unmount();
    expect(texto).toContain("Plin");
    expect(texto).not.toContain("Efectivo");
  });
});
