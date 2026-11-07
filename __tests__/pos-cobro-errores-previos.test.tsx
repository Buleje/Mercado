/**
 * __tests__/pos-cobro-errores-previos.test.tsx
 *
 * Cinco errores del cobro del POS que ya existían antes del rediseño (17-10)
 * y que el diseñador anotó. Cada `it` reproduce uno por el camino del cajero:
 *
 * 1. «Redondear a S/42» sobre S/ 41,60 era un descuento NEGATIVO que no viaja
 *    (`/api/sales` sólo acepta `descuentoMonto ≥ 0`): se veía 42, se registraba
 *    41,60. Y con un descuento ya puesto, «Redondear a S/41» lo reemplazaba por
 *    la diferencia contra el total YA descontado (46,22 −10 % → 45,62).
 * 2. Dos Enter en el mismo tick: `processing` es estado y no cambia hasta el
 *    próximo render, y cada llamada saca su propia clave de venta → dos POST,
 *    dos ventas (el servidor sólo deduplica reintentos con la MISMA clave).
 * 3. Plegar «Descuento» lo anulaba sin avisar (el total volvía al bruto).
 * 4. Efectivo → Yape dejaba lo tipeado en «Recibido»: un Yape de S/ 50 sobre
 *    S/ 41,60 y el servidor guardaba vuelto S/ 8,40 («Dar de vuelto» en caja).
 * 5. «Primera compra de este cliente» a quien debe S/ 150 de un fiado sin venta.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";
import type { POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";

// Datos del negocio que el cobro pide al montar: no importan acá.
vi.mock("@/components/admin/pos/pago/useBilleteraNegocio", () => ({
  useBilleteraNegocio: () => null,
  tieneQR: () => false,
}));
vi.mock("@/components/admin/pos/pago/useFiadoResumen", () => ({
  useFiadoResumen: () => ({ data: null, loading: false, refrescar: () => undefined }),
}));
vi.mock("@/components/admin/pos/usePOSOffline", () => ({ usePOSOffline: vi.fn() }));
vi.mock("@/components/admin/pos/POSAbonoRapido", () => ({
  default: ({ saldo }: { saldo: number }) => <p>Debe S/ {saldo}</p>,
}));

import { usePagoModal, type PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import { useAtajosDelCobro } from "@/components/admin/pos/pago/useAtajosDelCobro";
import { usePOSCobro } from "@/components/admin/pos/usePOSCobro";
import PagoTotal from "@/components/admin/pos/pago/PagoTotal";
import POSCustomerSearch from "@/components/admin/pos/POSCustomerSearch";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function props(total: number, extra: Partial<POSPaymentModalProps> = {}): POSPaymentModalProps {
  return {
    total,
    cartCount: 1,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    customerPhone: "",
    customerName: "",
    onCustomerPhone: vi.fn(),
    onCustomerName: vi.fn(),
    ...extra,
  };
}

describe("1 · redondear el total", () => {
  it("sólo ofrece redondear HACIA ABAJO (hacia arriba sería un recargo que no se registra)", () => {
    function Cobro() {
      const p = usePagoModal(props(41.6));
      return <PagoTotal p={p} />;
    }
    render(<Cobro />);
    expect(screen.getByRole("button", { name: "S/41" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "S/42" })).toBeNull();
    expect(screen.queryByRole("button", { name: "S/45" })).toBeNull();
  });

  it("un descuento negativo tipeado no sube el total", () => {
    const { result } = renderHook(() => usePagoModal(props(41.6)));
    act(() => {
      result.current.setDiscountMode("fixed");
      result.current.setShowDiscount(true);
      result.current.setDiscountValue("-0.40");
    });
    expect(result.current.total).toBe(41.6);
    expect(result.current.discountAmount).toBe(0);
  });

  it("con un descuento ya puesto, «Redondear a S/41» deja el total en 41 (no lo reemplaza)", () => {
    let cobro: PagoModal | undefined;
    function Cobro() {
      cobro = usePagoModal(props(46.22));
      return <PagoTotal p={cobro} />;
    }
    render(<Cobro />);
    act(() => {
      cobro!.setShowDiscount(true);
      cobro!.setDiscountValue("10");
    });
    expect(cobro!.total).toBe(41.6);
    fireEvent.click(screen.getByRole("button", { name: "S/41" }));
    expect(cobro!.total).toBeCloseTo(41, 2);
  });
});

describe("2 · dos Enter en el mismo tick", () => {
  function montarCobro(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    const carrito = {
      cart: [{ product: { id: 1, name: "Arroz", price: 41.6, unit: "kg", stock: 9 }, quantity: 1 }],
      setCart: vi.fn(),
      cartSubtotal: 41.6,
      globalDiscount: { monto: 0, porcentaje: 0 },
      setGlobalDiscount: vi.fn(),
    } as unknown as POSCarrito;
    function Cobro() {
      const cobro = usePOSCobro({
        carrito,
        fetchProducts: async () => undefined,
        playSaleComplete: vi.fn(),
        playError: vi.fn(),
        posOffline: { addToQueue: vi.fn() } as never,
      });
      const p = usePagoModal(props(41.6, { onConfirm: cobro.handlePaymentConfirm, processing: cobro.processing }));
      useAtajosDelCobro(p);
      return (
        <div data-modal-variante="pos">
          <input aria-label="Monto recibido" data-pago-enter="" defaultValue="" />
        </div>
      );
    }
    render(<Cobro />);
  }

  it("registra UNA venta", async () => {
    // La respuesta no llega todavía: es el momento del segundo Enter.
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => undefined));
    montarCobro(fetchMock);
    const input = screen.getByLabelText("Monto recibido");
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => undefined);
    const ventas = fetchMock.mock.calls.filter(([url]) => url === "/api/sales");
    expect(ventas).toHaveLength(1);
  });

  it("si la primera falla, el cajero puede volver a cobrar", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: "Caja cerrada" }), { status: 409 }));
    montarCobro(fetchMock);
    const input = screen.getByLabelText("Monto recibido");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/sales")).toHaveLength(2);
  });
});

describe("3 · plegar «Descuento»", () => {
  it("sólo lo oculta: el descuento sigue en el total y viaja con la venta", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => usePagoModal(props(100, { onConfirm })));
    act(() => {
      result.current.setShowDiscount(true);
      result.current.setDiscountValue("10");
    });
    act(() => result.current.setShowDiscount(false));
    expect(result.current.total).toBe(90);
    act(() => result.current.handleConfirm());
    expect(onConfirm.mock.calls[0][2]).toMatchObject({ discountAmount: 10 });
  });
});

describe("+ · total en céntimos", () => {
  it("24,90 −10 % es 22,41 en «Recibido», no 22.409999…", () => {
    const { result } = renderHook(() => usePagoModal(props(24.9)));
    act(() => result.current.setDiscountValue("10"));
    expect(result.current.total).toBe(22.41);
    expect(result.current.paymentLines[0].amount).toBe(22.41);
  });
});

describe("4 · de Efectivo a Yape", () => {
  it("lo recibido en efectivo no viaja con el Yape", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => usePagoModal(props(41.6, { onConfirm })));
    act(() => result.current.addBillete(50));
    expect(result.current.paymentLines).toEqual([{ method: "efectivo", amount: 50 }]);
    act(() => result.current.elegirMetodo("yape"));
    expect(result.current.paymentLines).toEqual([{ method: "yape", amount: 41.6 }]);
    expect(result.current.billetes).toEqual([]);
    act(() => result.current.handleConfirm());
    expect(onConfirm.mock.calls[0][0]).toEqual([{ method: "yape", amount: 41.6 }]);
  });

  it("tampoco cuando el método lo pone la preferencia del cliente elegido después", () => {
    localStorage.setItem("customer-payment-pref-999884455", "yape");
    const { result, rerender } = renderHook((p: POSPaymentModalProps) => usePagoModal(p), {
      initialProps: props(41.6),
    });
    act(() => result.current.updateAmount(0, 50));
    rerender(props(41.6, { customerPhone: "999884455" }));
    expect(result.current.paymentLines).toEqual([{ method: "yape", amount: 41.6 }]);
  });
});

describe("5 · «Primera compra» en el buscador de clientes", () => {
  function servir(fiadoPendiente: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
        if (url.endsWith("/fiado-resumen")) return json({ montoPendiente: fiadoPendiente, cantidadFiados: fiadoPendiente > 0 ? 1 : 0 });
        if (url.endsWith("/last-purchase")) return json(null); // fiado anotado en «Me deben»: sin venta
        if (url.startsWith("/api/fiados")) return json([]);
        if (url.includes("/orders")) return json([]);
        return json({});
      }),
    );
  }
  const buscador = () => (
    <POSCustomerSearch selectedPhone="999884455" selectedName="Cliente 4455" onSelect={vi.fn()} onClear={vi.fn()} />
  );

  it("no se lo dice a quien ya debe S/ 150", async () => {
    servir(150);
    render(buscador());
    await screen.findByText("Debe S/ 150");
    await act(async () => undefined);
    expect(screen.queryByText(/Primera compra/)).toBeNull();
  });

  it("sí a quien no tiene ventas ni deuda", async () => {
    servir(0);
    render(buscador());
    await waitFor(() => expect(screen.getByText(/Primera compra/)).toBeTruthy());
  });
});
