/**
 * Vistas guardadas de la Lista de Pedidos (P08, 17-10):
 * `components/admin/OrdersTab/vistas-pedidos.ts`. Fija que aplicar y capturar
 * una vista den la misma vista, que «Pedidos de hoy» siga siendo hoy mañana
 * y que lo guardado en localStorage con otra forma no rompa la Lista. Tope,
 * nombre y reemplazo son del hook de todo el panel (`vistas-guardadas.test.ts`).
 */
import { describe, expect, it } from "vitest";
import type { OrderFilters } from "@/components/admin/OrdersTab/types";
import { ORDEN_INICIAL, type Orden } from "@/components/admin/OrdersTab/orden-pedidos";
import { guardarVista, leerVistas, vistaActual } from "@/lib/admin/vistas-guardadas";
import type { OrderStatus } from "@/lib/jsondb";
import { SIN_REPARTIDOR } from "@/components/admin/OrdersTab/filtrar-pedidos";
import {
  VISTA_ESTANDAR,
  VISTAS_DEL_SISTEMA,
  aplicarVista,
  capturarVista,
  esEstadoVistaPedidos,
  firmaVistaPedidos,
} from "@/components/admin/OrdersTab/vistas-pedidos";

const HOY = "2026-10-17";

const sinFiltros = (): OrderFilters => ({
  statuses: new Set(),
  paymentMethod: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  customerSearch: "",
  hasDebt: false,
  hasAdminNotes: false,
});


describe("vistas del sistema", () => {
  it("son cinco, con la estándar primero y sin filtros", () => {
    expect(VISTAS_DEL_SISTEMA.map((v) => v.id)).toEqual([
      "estandar",
      "preparacion",
      "hoy",
      "por-cobrar",
      "sin-asignar",
    ]);
    expect(VISTAS_DEL_SISTEMA[0]).toBe(VISTA_ESTANDAR);
    const { filters, repartidor } = aplicarVista(VISTA_ESTANDAR.estado.filtros, HOY);
    expect(filters).toEqual(sinFiltros());
    expect(repartidor).toBe("");
  });

  it("«Sin asignar» pide los que no tienen repartidor", () => {
    const v = VISTAS_DEL_SISTEMA.find((x) => x.id === "sin-asignar")!;
    expect(aplicarVista(v.estado.filtros, HOY).repartidor).toBe(SIN_REPARTIDOR);
  });

  it("«Pedidos de hoy» pone el día que se le dé (no el del día en que se guardó)", () => {
    const v = VISTAS_DEL_SISTEMA.find((x) => x.id === "hoy")!;
    expect(aplicarVista(v.estado.filtros, "2026-10-18").filters).toMatchObject({
      dateFrom: "2026-10-18",
      dateTo: "2026-10-18",
    });
  });
});

describe("aplicar y capturar", () => {
  it("ida y vuelta da los mismos filtros", () => {
    const f: OrderFilters = {
      ...sinFiltros(),
      statuses: new Set(["preparando", "confirmado"]),
      paymentMethod: "yape",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-10",
      amountMin: "50",
      customerSearch: "  rosa ",
      hasDebt: true,
      hasAdminNotes: true,
    };
    const capturada = capturarVista(f, "Pepe", HOY);
    expect(capturada.estados).toEqual(["confirmado", "preparando"]);
    expect(capturada.busqueda).toBe("rosa");
    expect(capturada.hoy).toBe(false);
    const { filters, repartidor } = aplicarVista(capturada, HOY);
    expect(repartidor).toBe("Pepe");
    expect(filters).toEqual({ ...f, customerSearch: "rosa" });
  });

  it("desde y hasta en el día de hoy quedan como «hoy»", () => {
    const capturada = capturarVista({ ...sinFiltros(), dateFrom: HOY, dateTo: HOY }, "", HOY);
    expect(capturada).toMatchObject({ hoy: true, desde: "", hasta: "" });
    expect(aplicarVista(capturada, "2026-10-20").filters.dateFrom).toBe("2026-10-20");
  });
});

describe("la misma vista (firma)", () => {
  const seVe = (filters: OrderFilters, repartidor: string, orden: Orden, hoy = HOY) =>
    vistaActual(
      VISTAS_DEL_SISTEMA,
      [],
      { filtros: capturarVista(filters, repartidor, hoy), orden },
      (e) => firmaVistaPedidos(e, hoy),
    );

  it("reconoce la vista puesta y deja de reconocerla si se toca algo", () => {
    const prep = VISTAS_DEL_SISTEMA.find((x) => x.id === "preparacion")!;
    const { filters, repartidor } = aplicarVista(prep.estado.filtros, HOY);
    expect(seVe(filters, repartidor, prep.estado.orden)?.id).toBe("preparacion");
    // El mismo filtro con otro orden ya no es «Preparación».
    expect(seVe(filters, repartidor, ORDEN_INICIAL)).toBeNull();
    expect(seVe({ ...filters, hasDebt: true }, repartidor, prep.estado.orden)).toBeNull();
  });

  it("sin filtros y en el orden de siempre es la estándar", () => {
    expect(seVe(sinFiltros(), "", ORDEN_INICIAL)?.id).toBe("estandar");
  });

  it("«Pedidos de hoy» se reconoce también al día siguiente", () => {
    const manana = "2026-10-18";
    const f = { ...sinFiltros(), dateFrom: manana, dateTo: manana };
    expect(seVe(f, "", ORDEN_INICIAL, manana)?.id).toBe("hoy");
  });

  it("el orden en que se eligieron los estados no cuenta", () => {
    const a = { filtros: { ...capturarVista(sinFiltros(), "", HOY), estados: ["preparando", "confirmado"] as OrderStatus[] }, orden: ORDEN_INICIAL };
    const b = { ...a, filtros: { ...a.filtros, estados: ["confirmado", "preparando"] as OrderStatus[] } };
    expect(firmaVistaPedidos(a, HOY)).toBe(firmaVistaPedidos(b, HOY));
  });
});

describe("guardar con el hook de todo el panel", () => {
  const estado = { filtros: capturarVista(sinFiltros(), "", HOY), orden: ORDEN_INICIAL };

  it("un nombre de las del sistema no se puede usar", () => {
    const r = guardarVista([], "preparación", estado, VISTAS_DEL_SISTEMA);
    expect(r.error).toMatch(/del sistema/);
  });

  it("lo guardado vuelve igual y lo que no tiene forma se descarta", () => {
    const r = guardarVista([], "Para Pepe", estado, VISTAS_DEL_SISTEMA, 1);
    expect(r.error).toBeNull();
    const crudo = JSON.stringify([
      ...(r.lista ?? []),
      { id: "b", nombre: "Mala fecha", en: 1, estado: { ...estado, filtros: { ...estado.filtros, desde: 20261017 } } },
      { id: "c", nombre: "Estado inventado", en: 1, estado: { ...estado, filtros: { ...estado.filtros, estados: ["inventado"] } } },
      { id: "d", nombre: "Pago raro", en: 1, estado: { ...estado, filtros: { ...estado.filtros, pago: "bitcoin" } } },
      { id: "e", nombre: "Columna rara", en: 1, estado: { ...estado, orden: { columna: "inventada", sentido: "asc" } } },
      { id: "f", nombre: "Sin orden", en: 1, estado: { filtros: estado.filtros } },
    ]);
    const leidas = leerVistas(crudo, esEstadoVistaPedidos);
    expect(leidas.map((v) => v.nombre)).toEqual(["Para Pepe"]);
    expect(leidas[0].estado).toEqual(estado);
  });
});
