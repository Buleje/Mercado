import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCheckoutSubmit } from "@/components/checkout/hooks/useCheckoutSubmit";
import {
  useCheckoutState,
  INITIAL_CHECKOUT_STATE,
} from "@/components/checkout/hooks/useCheckoutState";
import type { CartItem } from "@/contexts/cart-context";
import type { CheckoutState } from "@/components/checkout/types";

vi.mock("@/lib/analytics", () => ({
  trackPurchase: vi.fn(),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

const sampleItem: CartItem = {
  id: 1,
  name: "Manzana",
  category: "frutas",
  price: 3.5,
  image: "https://example.com/apple.jpg",
  unit: "kg",
  quantity: 2,
};

function makeState(overrides: Partial<CheckoutState> = {}): CheckoutState {
  return {
    ...INITIAL_CHECKOUT_STATE,
    customer: {
      dni: "",
      name: "Brandon Test",
      phone: "987654321",
    },
    address: {
      ...INITIAL_CHECKOUT_STATE.address,
      location: "Jr. Ucayali 450",
      reference: "Casa azul",
    },
    payment: {
      ...INITIAL_CHECKOUT_STATE.payment,
      method: "efectivo",
    },
    ...overrides,
  };
}

function setup(overrides: Partial<CheckoutState> = {}, finalTotal = 7) {
  const cartActions = {
    clear: vi.fn(),
    closeCart: vi.fn(),
    markOrderPending: vi.fn(),
  };
  const customerActions = {
    register: vi.fn(),
    openOrderStatusModal: vi.fn(),
  };
  const closeCheckout = vi.fn();

  const { result } = renderHook(() => {
    const { state, dispatch } = useCheckoutState(makeState(overrides));
    const submit = useCheckoutSubmit({
      state,
      items: [sampleItem],
      finalTotal,
      effectiveCustomer: null,
      promo: null,
      discount: 0,
      dispatch,
      cartActions,
      customerActions,
      closeCheckout,
    });
    return { state, dispatch, submit, cartActions, customerActions, closeCheckout };
  });

  return result;
}

describe("useCheckoutSubmit", () => {
  it("envía el pedido con efectivo y marca deuda=true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-123" }),
    });

    const result = setup();
    await act(async () => {
      await result.current.submit.submit();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.paymentMethod).toBe("efectivo");
    expect(body.deuda).toBe(true);
    expect(body.customer.name).toBe("Brandon Test");
    expect(body.customer.phone).toBe("987654321");
    expect(body.total).toBe(7);

    await waitFor(() => {
      expect(result.current.state.ui.orderId).toBe("ORDER-123");
    });
  });

  it("envía el pedido con yape y operationNumber, sin deuda", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-YAPE" }),
    });

    const result = setup({
      payment: {
        method: "yape",
        yapeOpNumber: "123456",
        showHint: false,
        tip: 0,
      },
    });
    await act(async () => {
      await result.current.submit.submit();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.paymentMethod).toBe("yape");
    expect(body.yapeOperationNumber).toBe("123456");
    expect(body.deuda).toBeUndefined();
  });

  it("guarda el cupón aplicado en el payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-COUPON" }),
    });

    const result = setup({
      coupon: {
        code: "DESC10",
        discount: 5,
        msg: "ok",
        applied: true,
        validating: false,
      },
    });
    await act(async () => {
      await result.current.submit.submit();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.appliedCouponCode).toBe("DESC10");
    expect(body.couponDiscount).toBe(5);
  });

  it("guarda el tip en el payload cuando es > 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-TIP" }),
    });

    const result = setup({
      payment: {
        method: "efectivo",
        yapeOpNumber: "",
        showHint: false,
        tip: 2.5,
      },
    });
    await act(async () => {
      await result.current.submit.submit();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.tip).toBe(2.5);
  });

  it("bloquea doble submit cuando submitting=true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-X" }),
    });

    const result = setup({
      ui: { ...INITIAL_CHECKOUT_STATE.ui, submitting: true },
    });

    await act(async () => {
      await result.current.submit.submit();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falla con submitError cuando falta nombre", async () => {
    const result = setup({
      customer: { dni: "", name: "", phone: "987654321" },
    });
    await act(async () => {
      await result.current.submit.submit();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.state.ui.submitError).toContain("nombre");
    expect(result.current.state.ui.submitting).toBe(false);
  });

  it("falla con submitError cuando DNI tiene formato inválido", async () => {
    const result = setup({
      customer: { dni: "123", name: "Test", phone: "987654321" },
    });
    await act(async () => {
      await result.current.submit.submit();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.state.ui.submitError).toContain("DNI");
  });

  it("falla con submitError cuando falta dirección", async () => {
    const result = setup({
      address: { ...INITIAL_CHECKOUT_STATE.address, location: "" },
    });
    await act(async () => {
      await result.current.submit.submit();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.state.ui.submitError).toContain("dirección");
  });

  it("muestra error de servidor cuando la API responde con 4xx", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "validation failed" }),
    });

    const result = setup();
    await act(async () => {
      await result.current.submit.submit();
    });

    expect(result.current.state.ui.submitError).toContain("intenta de nuevo");
    expect(result.current.state.ui.submitting).toBe(false);
  });

  it("sanitiza imágenes data-uri vaciándolas", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ORDER-IMG" }),
    });

    const dataUriItem: CartItem = {
      ...sampleItem,
      image: "data:image/png;base64,AAAAA...",
    };

    const cartActions = {
      clear: vi.fn(),
      closeCart: vi.fn(),
      markOrderPending: vi.fn(),
    };
    const customerActions = {
      register: vi.fn(),
      openOrderStatusModal: vi.fn(),
    };

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState(makeState());
      const submit = useCheckoutSubmit({
        state,
        items: [dataUriItem],
        finalTotal: 7,
        effectiveCustomer: null,
        promo: null,
        discount: 0,
        dispatch,
        cartActions,
        customerActions,
        closeCheckout: vi.fn(),
      });
      return { state, submit };
    });

    await act(async () => {
      await result.current.submit.submit();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.items[0].image).toBe("");
  });
});
