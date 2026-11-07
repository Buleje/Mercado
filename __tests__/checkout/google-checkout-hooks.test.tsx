/**
 * Google en el checkout con los hooks REALES (useCheckoutState + useCheckoutInit
 * + useGoogleCheckout), como los arma CheckoutModal. Revisión 2026-10-11: en la
 * primera apertura el nombre de Google pisaba al del cliente registrado.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { checkoutReducer, INITIAL_CHECKOUT_STATE, useCheckoutState } from "@/components/checkout/hooks/useCheckoutState";
import { useCheckoutInit } from "@/components/checkout/hooks/useCheckoutInit";
import { useGoogleCheckout } from "@/components/checkout/hooks/useGoogleCheckout";
import type { Customer } from "@/contexts/customer-context";
import type { UsePhoneSearchResult } from "@/components/checkout/hooks/usePhoneSearch";

vi.mock("@/components/store/cliente/use-cliente-tienda", () => ({
  useClienteTienda: () => ({
    cliente: { nombre: "Ana Google", email: null, avatar: null, proveedor: "google" },
    disponible: true,
    cargando: false,
    entrarConGoogle: async () => {},
    salir: async () => {},
  }),
}));

const noop = () => {};
const phoneSearch = { reset: noop } as unknown as UsePhoneSearchResult;

interface Props {
  open: boolean;
  customer: Customer | null;
  activo?: boolean;
  hay?: boolean;
  puede?: boolean;
  onOpen?: () => void;
}

function Harness({ open, customer, activo = true, hay = true, puede = false, onOpen = noop }: Props) {
  const { state, dispatch, reset } = useCheckoutState();
  useCheckoutInit({
    open,
    customer,
    locations: [],
    storeLat: 0,
    storeLon: 0,
    reset,
    phoneSearch,
    setEditingCustomerData: noop,
    setSkippedAccount: noop,
    fetchLoyaltyPoints: async () => {},
  });
  useGoogleCheckout({
    activo,
    checkoutOpen: open,
    nombreActual: state.customer.name,
    dispatch,
    hayProductos: hay,
    puedeReabrir: puede,
    openCheckout: onOpen,
  });
  return <span data-testid="n">{state.customer.name}</span>;
}

const juan = { phone: "987654321", name: "Juan Casa" } as Customer;

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("nombre de Google en el checkout", () => {
  it("1.a apertura con cliente registrado: queda «Juan Casa» (Google no lo pisa)", () => {
    const r = render(<Harness open={false} customer={juan} />);
    act(() => r.rerender(<Harness open customer={juan} />));
    expect(r.getByTestId("n").textContent).toBe("Juan Casa");
  });

  it("2.a apertura con cliente registrado: sigue «Juan Casa»", () => {
    const r = render(<Harness open={false} customer={juan} />);
    act(() => r.rerender(<Harness open customer={juan} />));
    act(() => r.rerender(<Harness open={false} customer={juan} />));
    act(() => r.rerender(<Harness open customer={juan} />));
    expect(r.getByTestId("n").textContent).toBe("Juan Casa");
  });

  it("invitado sin nombre: se rellena con el de Google", () => {
    const r = render(<Harness open={false} customer={null} />);
    act(() => r.rerender(<Harness open customer={null} />));
    expect(r.getByTestId("n").textContent).toBe("Ana Google");
  });

  it("interruptor apagado: no rellena nada", () => {
    const r = render(<Harness open={false} customer={null} activo={false} />);
    act(() => r.rerender(<Harness open customer={null} activo={false} />));
    expect(r.getByTestId("n").textContent).toBe("");
  });

  it("el reducer decide «sólo si está vacío» con el estado de ese momento", () => {
    const conNombre = { ...INITIAL_CHECKOUT_STATE, customer: { ...INITIAL_CHECKOUT_STATE.customer, name: "Juan Casa" } };
    expect(checkoutReducer(conNombre, { type: "RELLENAR_NOMBRE_SI_VACIO", name: "Ana" }).customer.name).toBe("Juan Casa");
    expect(checkoutReducer(INITIAL_CHECKOUT_STATE, { type: "RELLENAR_NOMBRE_SI_VACIO", name: " Ana " }).customer.name).toBe("Ana");
  });
});

describe("?checkout=resume", () => {
  it("carrito vacío al montar: borra la marca y NO abre al agregar el primer producto", () => {
    window.history.replaceState(null, "", "/tienda?checkout=resume&cat=1");
    const onOpen = vi.fn();
    const r = render(<Harness open={false} customer={null} hay={false} puede onOpen={onOpen} />);
    expect(window.location.search).toBe("?cat=1");
    act(() => r.rerender(<Harness open={false} customer={null} hay puede onOpen={onOpen} />));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("con productos al montar: reabre una vez, cuando ya se sabe que la tienda usa checkout", () => {
    window.history.replaceState(null, "", "/tienda?checkout=resume");
    const onOpen = vi.fn();
    const r = render(<Harness open={false} customer={null} hay puede={false} onOpen={onOpen} />);
    expect(window.location.search).toBe("");
    expect(onOpen).not.toHaveBeenCalled();
    act(() => r.rerender(<Harness open={false} customer={null} hay puede onOpen={onOpen} />));
    act(() => r.rerender(<Harness open={false} customer={null} hay={false} puede onOpen={onOpen} />));
    act(() => r.rerender(<Harness open={false} customer={null} hay puede onOpen={onOpen} />));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("sin marca no abre nada", () => {
    window.history.replaceState(null, "", "/tienda");
    const onOpen = vi.fn();
    render(<Harness open={false} customer={null} hay puede onOpen={onOpen} />);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
