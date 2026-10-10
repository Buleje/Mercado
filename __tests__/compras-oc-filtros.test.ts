import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFiltrosOrdenesCompra, POR_PAGINA } from "@/hooks/use-filtros-ordenes-compra";
import type { DbPurchaseOrder } from "@/lib/jsondb";

function oc(over: Partial<DbPurchaseOrder> = {}): DbPurchaseOrder {
  return {
    id: `po-${Math.random().toString(36).slice(2, 8)}`,
    supplierId: "sup-1",
    supplierName: "Distribuidora Ucayali",
    items: [{ productId: 1, name: "Arroz Costeño", quantity: 10, unitCost: 19.5, unit: "bolsa" }],
    total: 195,
    status: "pendiente",
    createdAt: "2026-08-10T15:00:00.000Z",
    updatedAt: "2026-08-10T15:00:00.000Z",
    ...over,
  } as DbPurchaseOrder;
}

describe("buscar órdenes", () => {
  it("encuentra por proveedor, por número de factura y por producto", () => {
    const datos = [
      oc({ supplierName: "Distribuidora Ucayali", invoiceNumber: "F001-00012345" }),
      oc({ supplierName: "Abarrotes del Oriente", items: [{ productId: 2, name: "Aceite Primor", quantity: 5, unitCost: 12, unit: "und" }] }),
    ];
    const { result } = renderHook(() => useFiltrosOrdenesCompra(datos));

    act(() => result.current.setBusqueda("ucayali"));
    expect(result.current.filtradas).toHaveLength(1);

    act(() => result.current.setBusqueda("F001-00012345"));
    expect(result.current.filtradas[0].invoiceNumber).toBe("F001-00012345");

    act(() => result.current.setBusqueda("primor"));
    expect(result.current.filtradas[0].supplierName).toBe("Abarrotes del Oriente");
  });

  it("ignora tildes y mayúsculas: buscar 'costeno' encuentra 'Costeño'", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra([oc()]));
    act(() => result.current.setBusqueda("COSTENO"));
    expect(result.current.filtradas).toHaveLength(1);
  });
});

describe("rango de fechas — en días de Pucallpa, no en UTC", () => {
  /**
   * Una compra de las 21:00 del 10 de agosto en Perú es 2026-08-11T02:00Z.
   * Comparando el instante contra `hasta=2026-08-10` se cae del rango, aunque
   * para el bodeguero fue el día 10. Este es el bug que la regla de fechas del
   * proyecto documenta, en su versión de cliente.
   */
  const compraDeLaNoche = oc({ createdAt: "2026-08-11T02:00:00.000Z" });

  it("una compra nocturna cuenta en su día peruano", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra([compraDeLaNoche]));
    act(() => result.current.setDesde("2026-08-10"));
    act(() => result.current.setHasta("2026-08-10"));
    expect(result.current.filtradas).toHaveLength(1);
  });

  it("el día siguiente NO la incluye", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra([compraDeLaNoche]));
    act(() => result.current.setDesde("2026-08-11"));
    expect(result.current.filtradas).toHaveLength(0);
  });

  it("el rango incluye ambos extremos", () => {
    const datos = [
      oc({ createdAt: "2026-08-01T15:00:00.000Z" }),
      oc({ createdAt: "2026-08-05T15:00:00.000Z" }),
      oc({ createdAt: "2026-08-09T15:00:00.000Z" }),
    ];
    const { result } = renderHook(() => useFiltrosOrdenesCompra(datos));
    act(() => result.current.setDesde("2026-08-01"));
    act(() => result.current.setHasta("2026-08-09"));
    expect(result.current.filtradas).toHaveLength(3);
  });
});

describe("ordenar", () => {
  const datos = [
    oc({ supplierName: "Zeta", total: 100, createdAt: "2026-08-01T15:00:00.000Z" }),
    oc({ supplierName: "Alfa", total: 500, createdAt: "2026-08-09T15:00:00.000Z" }),
  ];

  it("por defecto, la más reciente primero", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra(datos));
    expect(result.current.filtradas[0].supplierName).toBe("Alfa");
  });

  it("por monto y por proveedor", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra(datos));
    act(() => result.current.setOrden("mayor-monto"));
    expect(result.current.filtradas[0].total).toBe(500);
    act(() => result.current.setOrden("menor-monto"));
    expect(result.current.filtradas[0].total).toBe(100);
    act(() => result.current.setOrden("proveedor"));
    expect(result.current.filtradas[0].supplierName).toBe("Alfa");
  });
});

describe("paginar", () => {
  const muchas = Array.from({ length: 25 }, (_, i) =>
    oc({ total: i, createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T15:00:00.000Z` }),
  );

  it("corta de a diez y sabe cuántas páginas hay", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra(muchas));
    expect(result.current.visibles).toHaveLength(POR_PAGINA);
    expect(result.current.totalPaginas).toBe(3);
    act(() => result.current.setPagina(3));
    expect(result.current.visibles).toHaveLength(5);
  });

  it("filtrar desde una página alta no deja la pantalla vacía", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra(muchas));
    act(() => result.current.setPagina(3));
    act(() => result.current.setBusqueda("Ucayali")); // deja 25 → 1 página
    expect(result.current.pagina).toBe(1);
    expect(result.current.visibles.length).toBeGreaterThan(0);
  });

  it("cambiar un filtro vuelve a la primera página", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra(muchas));
    act(() => result.current.setPagina(2));
    expect(result.current.pagina).toBe(2);
    act(() => result.current.setOrden("mayor-monto"));
    expect(result.current.pagina).toBe(1);
  });
});

describe("limpiar", () => {
  it("saca todo y avisa que ya no hay filtros", () => {
    const { result } = renderHook(() => useFiltrosOrdenesCompra([oc()]));
    act(() => result.current.setBusqueda("algo"));
    act(() => result.current.setEstado("cancelado"));
    expect(result.current.hayFiltros).toBe(true);
    act(() => result.current.limpiar());
    expect(result.current.hayFiltros).toBe(false);
    expect(result.current.filtradas).toHaveLength(1);
  });
});
