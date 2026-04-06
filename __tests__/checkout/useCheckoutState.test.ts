import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCheckoutState,
  checkoutReducer,
  INITIAL_CHECKOUT_STATE,
} from "@/components/checkout/hooks/useCheckoutState";

describe("checkoutReducer", () => {
  it("SET_STEP avanza el wizard sin tocar el resto", () => {
    const next = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_STEP",
      step: "datos",
    });
    expect(next.step).toBe("datos");
    expect(next.customer).toBe(INITIAL_CHECKOUT_STATE.customer);
  });

  it("SET_CUSTOMER hace merge sin perder otros campos", () => {
    const seeded = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_CUSTOMER",
      patch: { name: "María", phone: "987654321" },
    });
    const next = checkoutReducer(seeded, {
      type: "SET_CUSTOMER",
      patch: { dni: "12345678" },
    });
    expect(next.customer.name).toBe("María");
    expect(next.customer.phone).toBe("987654321");
    expect(next.customer.dni).toBe("12345678");
  });

  it("SET_COUPON acumula y RESET_COUPON limpia", () => {
    const applied = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_COUPON",
      patch: { code: "BIENVENIDO10", discount: 5, applied: true, msg: "ok" },
    });
    expect(applied.coupon.applied).toBe(true);
    expect(applied.coupon.discount).toBe(5);

    const cleared = checkoutReducer(applied, { type: "RESET_COUPON" });
    expect(cleared.coupon.applied).toBe(false);
    expect(cleared.coupon.discount).toBe(0);
    expect(cleared.coupon.code).toBe("");
  });

  it("SET_PAYMENT actualiza el método y mantiene tip", () => {
    const withTip = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_PAYMENT",
      patch: { tip: 3 },
    });
    const withMethod = checkoutReducer(withTip, {
      type: "SET_PAYMENT",
      patch: { method: "yape" },
    });
    expect(withMethod.payment.tip).toBe(3);
    expect(withMethod.payment.method).toBe("yape");
  });

  it("SET_UI permite acumular flags sin romper otros estados", () => {
    const next = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_UI",
      patch: { submitting: true, submitError: "boom" },
    });
    expect(next.ui.submitting).toBe(true);
    expect(next.ui.submitError).toBe("boom");
    expect(next.ui.dataError).toBe("");
  });

  it("SET_DNI_LOOKUP cambia status y mensaje", () => {
    const next = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_DNI_LOOKUP",
      patch: { status: "loading", message: "Buscando..." },
    });
    expect(next.dniLookup.status).toBe("loading");
    expect(next.dniLookup.message).toBe("Buscando...");
  });

  it("SET_DELIVERY mantiene defaults cuando solo se actualiza un campo", () => {
    const next = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_DELIVERY",
      patch: { custom: true, date: "2026-04-07" },
    });
    expect(next.delivery.slot).toBe("lo-antes-posible");
    expect(next.delivery.custom).toBe(true);
    expect(next.delivery.date).toBe("2026-04-07");
  });

  it("RESET reemplaza completamente el estado", () => {
    const dirty = checkoutReducer(INITIAL_CHECKOUT_STATE, {
      type: "SET_STEP",
      step: "exito",
    });
    const reset = checkoutReducer(dirty, {
      type: "RESET",
      initial: INITIAL_CHECKOUT_STATE,
    });
    expect(reset.step).toBe("cuenta");
  });
});

describe("useCheckoutState", () => {
  it("expone state, dispatch y reset", () => {
    const { result } = renderHook(() => useCheckoutState());
    expect(result.current.state.step).toBe("cuenta");
    expect(typeof result.current.dispatch).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("dispatch actualiza el estado", () => {
    const { result } = renderHook(() => useCheckoutState());
    act(() => {
      result.current.dispatch({ type: "SET_STEP", step: "pago" });
    });
    expect(result.current.state.step).toBe("pago");
  });

  it("reset() vuelve al estado inicial", () => {
    const { result } = renderHook(() => useCheckoutState());
    act(() => {
      result.current.dispatch({ type: "SET_STEP", step: "exito" });
      result.current.dispatch({
        type: "SET_CUSTOMER",
        patch: { name: "Brandon" },
      });
    });
    expect(result.current.state.step).toBe("exito");
    expect(result.current.state.customer.name).toBe("Brandon");

    act(() => result.current.reset());
    expect(result.current.state.step).toBe("cuenta");
    expect(result.current.state.customer.name).toBe("");
  });
});
