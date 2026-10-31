/**
 * Feed de movimientos del reparto (17-10, P18): quién produjo cada evento,
 * agrupar por pedido sin perder ninguno, qué pide atención y qué va al mapa.
 */
import { describe, it, expect } from "vitest";
import { actorDeEvento, agruparFeed, eventosDePedidosActivos, filtrarFeed, type EventoFeed } from "@/lib/delivery/feed-eventos";

const ahora = new Date("2026-10-17T15:00:00.000Z");
const min = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString();

let n = 0;
function ev(orderId: string, status: string, haceMin: number, extra: Partial<EventoFeed> = {}): EventoFeed {
  n += 1;
  return { id: `e${n}`, orderId, status, description: null, lat: null, lng: null, etaMinutes: null, actorType: "driver", createdAt: min(haceMin), ...extra };
}

describe("actorDeEvento", () => {
  it("distingue GPS, app del repartidor, negocio, cliente y sistema", () => {
    expect(actorDeEvento({ actorType: "driver", lat: -8.38, lng: -74.55 }).tipo).toBe("gps");
    expect(actorDeEvento({ actorType: "driver", lat: null, lng: null }).tipo).toBe("repartidor");
    expect(actorDeEvento({ actorType: "admin", lat: null, lng: null }).rotulo).toBe("Alguien del negocio");
    expect(actorDeEvento({ actorType: "customer", lat: null, lng: null }).tipo).toBe("cliente");
    expect(actorDeEvento({ actorType: "system", lat: null, lng: null }).tipo).toBe("sistema");
  });
});

describe("agruparFeed", () => {
  it("un grupo por pedido con TODOS sus eventos, del más nuevo al más viejo, y cuenta los repetidos", () => {
    const eventos = [
      ev("o1", "picked_up", 20),
      ev("o1", "in_transit", 15, { lat: 1, lng: 1 }),
      ev("o1", "in_transit", 10, { lat: 1, lng: 2 }),
      ev("o1", "delivered", 5),
      ev("o2", "assigned", 3, { customerName: "Rosa" }),
    ];
    const g = agruparFeed(eventos, ahora);
    expect(g.map((x) => x.orderId)).toEqual(["o2", "o1"]);
    const o1 = g.find((x) => x.orderId === "o1");
    expect(o1?.eventos).toHaveLength(4);
    expect(o1?.eventos[0].status).toBe("delivered");
    expect(o1?.repetidos).toBe(1);
    expect(o1?.cerrado).toBe(true);
    expect(g.find((x) => x.orderId === "o2")?.cliente).toBe("Rosa");
    expect(g.reduce((s, x) => s + x.eventos.length, 0)).toBe(eventos.length);
  });

  it("pide atención si falló, se canceló o va más de 30 min sin novedad", () => {
    const g = agruparFeed([ev("f", "failed", 2), ev("c", "cancelled", 2), ev("lento", "in_transit", 45), ev("bien", "in_transit", 5)], ahora);
    const de = (id: string) => g.find((x) => x.orderId === id)?.porAtender;
    expect(de("f")).toBe("No se pudo entregar");
    expect(de("c")).toBe("Se canceló en el camino");
    expect(de("lento")).toBe("Sin novedad hace 45 min");
    expect(de("bien")).toBeNull();
    expect(filtrarFeed(g, "atender").map((x) => x.orderId).sort()).toEqual(["c", "f", "lento"]);
    expect(filtrarFeed(g, "curso").map((x) => x.orderId).sort()).toEqual(["bien", "lento"]);
    expect(filtrarFeed(g, "cerrados")).toHaveLength(2);
    expect(filtrarFeed(g, "todos")).toHaveLength(4);
  });
});

describe("eventosDePedidosActivos (mapa y órdenes activas)", () => {
  it("deja fuera los pedidos cuyo ÚLTIMO evento es entregado, fallido o cancelado", () => {
    const eventos = [ev("o1", "in_transit", 20), ev("o1", "delivered", 5), ev("o2", "in_transit", 3), ev("o3", "failed", 10), ev("o3", "in_transit", 1)];
    const activos = eventosDePedidosActivos(eventos);
    expect([...new Set(activos.map((e) => e.orderId))].sort()).toEqual(["o2", "o3"]);
    expect(activos.filter((e) => e.orderId === "o3")).toHaveLength(2);
  });
});
